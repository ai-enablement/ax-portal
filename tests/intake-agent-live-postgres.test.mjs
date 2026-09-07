import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {handleAgentRequest} from '../server/intake-agent.mjs';
import {fieldValue} from '../shared/intake-agent.mjs';

// Full server path with real Azure and PostgreSQL; synthetic, pg_temp-only rows.
test('live Azure answer -> confirmation -> real PostgreSQL conversation and v3 document', {
  skip:process.env.PORTAL_TEST_AZURE_AI!=='1'||process.env.PORTAL_TEST_POSTGRES!=='1',timeout:80000,
},async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  const tables=['users','projects','project_members','intake_requests','intake_conversations','intake_messages','documents','document_versions','audit_logs'];
  const adapter={query:(sql,params)=>{
    for(const match of sql.matchAll(/agent_portal\.(\w+)/g))assert.ok(tables.includes(match[1]),'Unexpected production object');
    return client.query(sql.replaceAll('agent_portal.','pg_temp.'),params);
  }};
  const transaction=async fn=>{
    await client.query('savepoint live_intake_test');
    try{const result=await fn(adapter);await client.query('release savepoint live_intake_test');return result;}
    catch(e){await client.query('rollback to savepoint live_intake_test');throw e;}
  };
  try {
    await client.query('begin');
    for(const table of tables)await client.query(`create temporary table ${table} (like agent_portal.${table} including defaults including identity including constraints including indexes) on commit drop`);
    const actor=(await client.query("insert into pg_temp.users(organization_id,email,display_name,app_role) values(1,'live-test@example.invalid','가상 테스트 사용자','general_user') returning id")).rows[0];
    const project=(await client.query("insert into pg_temp.projects(organization_id,project_code,project_name,requester_id,owner_id,current_stage_code,project_status) values(1,'2099-999','가상 테스트 과제',$1,$1,'INT','submitted') returning id",[actor.id])).rows[0];
    const state={no:'2099-999',name:'가상 테스트 과제',intakeStandardVersion:'3.0',journeyStep:0,historicalImport:false,intakeAnswers:['','','','',''],intakeDetails:{}};
    await client.query("insert into pg_temp.intake_requests(project_id,business_problem,raw_answers) values($1,'가상 테스트',$2::jsonb)",[project.id,JSON.stringify({portalState:state})]);
    const args={identity:{email:'live-test@example.invalid'},code:'2099-999',pool:adapter,transaction};
    const message='테스트용 가상 업무입니다. 품질팀 담당자가 부품 변경 문서를 수동으로 대조합니다. 월평균 약 20건입니다. 건당 약 30분입니다. 수행 인원은 2명입니다. 누락되면 문서를 재작성해야 합니다. 숫자는 담당자의 대략적인 추정입니다.';
    let result=await handleAgentRequest({...args,method:'POST',body:{action:'message',requestId:'live-test-2099-999-000001',message}});
    assert.equal(result.messages.length,2);
    const quantity=result.session.proposals.find(p=>['int.countPerMonth','int.asIsMinutes','int.people'].includes(p.key));
    assert.ok(quantity,'Source-backed v3 quantity must survive actual server validation');
    assert.equal(fieldValue(result.project,quantity.key),'');
    result=await handleAgentRequest({...args,method:'POST',body:{action:'confirm',keys:[quantity.key],revision:result.session.revision}});
    assert.equal(fieldValue(result.project,quantity.key),quantity.value);
    const reloaded=await handleAgentRequest({...args,method:'GET'});
    assert.equal(fieldValue(reloaded.project,quantity.key),quantity.value);
    assert.equal(reloaded.messages.length,2);
    assert.equal(reloaded.project.journeyStep,0);
    assert.equal(reloaded.project.feaCompleted,undefined);
    const document=(await client.query("select v.structured_content from pg_temp.documents d join pg_temp.document_versions v on v.document_id=d.id and v.version_number=d.current_version where d.document_type='INT'")).rows[0].structured_content;
    assert.equal(document.standardVersion,'3.0');
    assert.equal(document.details[quantity.key.split('.')[1]],quantity.value);
    assert.equal((await client.query('select current_stage_code from pg_temp.projects')).rows[0].current_stage_code,'INT');
  } finally {await client.query('rollback').catch(()=>{});await client.end();}
});
