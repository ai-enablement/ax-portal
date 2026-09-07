import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {persistIntakeFeaV3,completionGaps} from '../server/intake-standard.mjs';

test('INT/FEA v3 real PostgreSQL saves, reloads and preserves legacy versions', {skip:process.env.PORTAL_TEST_POSTGRES!=='1'},async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  const tables=['intake_requests','documents','document_versions'];
  const adapter={query:(sql,params)=>{
    for(const match of sql.matchAll(/agent_portal\.(\w+)/g))assert.ok(tables.includes(match[1]));
    return client.query(sql.replaceAll('agent_portal.','pg_temp.'),params);
  }};
  try {
    await client.query('begin');
    for(const table of tables)await client.query(`create temporary table ${table} (like agent_portal.${table} including defaults including identity including constraints including indexes) on commit drop`);
    await client.query("insert into pg_temp.intake_requests(project_id,business_problem,raw_answers) values(1,'synthetic test','{}')");
    for(const code of ['INT','FEA']) {
      const d=(await client.query("insert into pg_temp.documents(project_id,document_type,document_code,document_title,document_status,current_version,author_id) values(1,$1,$2,'Synthetic legacy','draft',1,1) returning id",[code,'2099-999-'+code])).rows[0];
      await client.query("insert into pg_temp.document_versions(document_id,version_number,structured_content,created_by) values($1,1,$2::jsonb,1)",[d.id,JSON.stringify({legacy:'preserve-'+code})]);
    }
    const state={intakeStandardVersion:'3.0',journeyStep:1,intakeDraftCompleted:true,feaCompleted:true,
      intakeAnswers:['문서를 수동 대조합니다.','','','이전 기대 효과 보존',''],
      intakeDetails:{performer:'가상 담당자',countPerMonth:'20',asIsMinutes:'30',people:'2',quantityBasis:'추정',currentProcess:'수동 대조',failureImpact:'재작업 발생'},
      feaDraft:{standardVersion:'3.0',summary:'테스트 요약',alternatives:['규정만으로 부족','기존 기능 없음','다양한 양식으로 어려움','추적성 부족'],conclusion:'근거 포함 대조 초안 필요',
        expectedEffect:'재작업 감소',savedMinutes:'10',effectBasis:'가상 시범 측정',developmentCost:'3일',
        writeExec:false,sensitive:false,businessIdentity:true,scope:'TEAM',damageFinancial:false,maximumDamage:'재작업',track:'MEDIUM',agentType:'혼합형',autonomy:'L1',recommendation:'GO',targetDate:'2099-12-01'}};
    assert.deepEqual(completionGaps({journeyStep:1},{feaCompleted:true},state),[]);
    const project={id:1,project_code:'2099-999',project_name:'Synthetic integration test'};
    await persistIntakeFeaV3(adapter,project,state,1,{});
    await persistIntakeFeaV3(adapter,project,state,1,state);
    const rows=(await client.query('select d.document_type,d.current_version,v.version_number,v.structured_content from pg_temp.documents d join pg_temp.document_versions v on v.document_id=d.id order by d.document_type,v.version_number')).rows;
    assert.equal(rows.length,4);
    for(const code of ['INT','FEA']) {
      assert.equal(rows.find(r=>r.document_type===code&&r.version_number===1).structured_content.legacy,'preserve-'+code);
      assert.equal(rows.find(r=>r.document_type===code&&r.version_number===2).structured_content.standardVersion,'3.0');
    }
    assert.deepEqual(rows.find(r=>r.document_type==='FEA'&&r.version_number===2).structured_content,state.feaDraft);
    const int=rows.find(r=>r.document_type==='INT'&&r.version_number===2).structured_content;
    assert.deepEqual(int.details,state.intakeDetails);
    assert.equal(int.answers[3],'이전 기대 효과 보존');
    assert.equal((await client.query('select failure_impact from pg_temp.intake_requests')).rows[0].failure_impact,'재작업 발생');
  } finally {await client.query('rollback').catch(()=>{});await client.end();}
});
