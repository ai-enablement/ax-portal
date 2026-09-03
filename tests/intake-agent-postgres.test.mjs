import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {handleAgentRequest,AgentError} from '../server/intake-agent.mjs';

// Real SQL against session-local clones only; no business records are read or written.
test('Agent PostgreSQL integration: request/reply, confirmation, conflict, retry and authorization', {skip:process.env.PORTAL_TEST_POSTGRES!=='1'}, async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  const keys=['AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_API_KEY','AZURE_OPENAI_DEPLOYMENT'];
  const previous=keys.map(k=>process.env[k]);
  Object.assign(process.env,{AZURE_OPENAI_ENDPOINT:'https://test.openai.azure.com/',AZURE_OPENAI_API_KEY:'test-only',AZURE_OPENAI_DEPLOYMENT:'test-only'});
  const tables=['users','projects','project_members','intake_requests','intake_conversations','intake_messages','documents','document_versions','audit_logs'];
  const adapter={query:(sql,params)=>{
    for(const match of sql.matchAll(/agent_portal\.(\w+)/g)) assert.ok(tables.includes(match[1]),`Unexpected production object: ${match[1]}`);
    return client.query(sql.replaceAll('agent_portal.','pg_temp.'),params);
  }};
  let transactionActive=false;
  const transaction=async fn=>{
    await client.query('savepoint agent_test');transactionActive=true;
    try {const result=await fn(adapter);await client.query('release savepoint agent_test');return result;}
    catch(e){await client.query('rollback to savepoint agent_test');throw e;}
    finally {transactionActive=false;}
  };
  try {
    await client.query('begin');
    for(const table of tables) await client.query(`create temporary table ${table} (like agent_portal.${table} including defaults including identity including constraints including indexes) on commit drop`);
    const actor=(await client.query("insert into pg_temp.users(organization_id,email,display_name,app_role) values(1,'agent-test@example.invalid','테스트 사용자','general_user') returning id")).rows[0];
    const project=(await client.query("insert into pg_temp.projects(organization_id,project_code,project_name,requester_id,owner_id,current_stage_code,project_status) values(1,'2099-999','테스트 신규 과제',$1,$1,'FEA','in_progress') returning id",[actor.id])).rows[0];
    const state={no:'2099-999',name:'테스트 신규 과제',journeyStep:1,historicalImport:false,intakeAnswers:['업무 정보를 사람이 수작업으로 취합하고 누락 여부를 확인합니다.','','','','']};
    await client.query("insert into pg_temp.intake_requests(project_id,business_problem,raw_answers) values($1,'테스트',$2::jsonb)",[project.id,JSON.stringify({portalState:state})]);
    let calls=0;
    const generate=async()=>{assert.equal(transactionActive,false,'AI must not run inside write transaction');calls++;return {reply:'월간 건수를 확인해 주세요.',target:'int.currentProcess',question:'현재 절차와 수행자는 누구인가요?',proposals:[{key:'fea.countPerMonth',value:'20',kind:'extracted',evidence:'월 20건입니다.'}]};};
    const args={identity:{email:'agent-test@example.invalid'},code:'2099-999',pool:adapter,transaction,generate};
    const body={action:'message',requestId:'test-request-000001',message:'월 20건입니다.'};
    let result=await handleAgentRequest({...args,method:'POST',body});
    assert.equal(result.messages.length,2);assert.equal(result.session.proposals.length,1);assert.equal(calls,1);
    await handleAgentRequest({...args,method:'POST',body});assert.equal(calls,1,'duplicate request must not call AI');
    result=await handleAgentRequest({...args,method:'POST',body:{action:'confirm',keys:['fea.countPerMonth'],revision:result.session.revision}});
    assert.equal(result.project.feaDraft.countPerMonth,'20');assert.equal(result.project.feaCompleted,undefined);
    const docs=(await client.query("select d.document_type,v.structured_content from pg_temp.documents d join pg_temp.document_versions v on v.document_id=d.id order by d.document_type")).rows;
    assert.equal(docs.length,2);assert.equal(docs.find(d=>d.document_type==='FEA').structured_content.countPerMonth,'20');
    assert.equal((await client.query('select count(*)::int as count from pg_temp.intake_messages')).rows[0].count,2);
    assert.equal((await client.query('select current_stage_code from pg_temp.projects')).rows[0].current_stage_code,'FEA');
    await assert.rejects(handleAgentRequest({...args,method:'POST',body:{action:'confirm',keys:[],revision:0}}),e=>e.status===409);
    await assert.rejects(handleAgentRequest({...args,identity:{email:'not-related@example.invalid'},method:'GET'}),e=>e.status===403);
    // Simulate a failed call, then retry the same persisted user message (no duplication).
    await client.query("update pg_temp.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState,agentSession,request,startedAt}',to_jsonb('2000-01-01T00:00:00Z'::text))");
    const second={action:'message',requestId:'test-request-000002',message:'담당자는 매월 직접 취합하고 검토합니다.'};
    await assert.rejects(handleAgentRequest({...args,method:'POST',body:second,generate:async()=>{throw new AgentError(502,'테스트 연결 실패');}}),e=>e.status===502);
    await client.query("update pg_temp.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState,agentSession,request,startedAt}',to_jsonb('2000-01-01T00:00:00Z'::text))");
    result=await handleAgentRequest({...args,method:'POST',body:second});
    assert.equal(result.messages.filter(m=>m.requestId===second.requestId&&m.role==='user').length,1);
    await client.query("update pg_temp.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState,historicalImport}','true'::jsonb)");
    await assert.rejects(handleAgentRequest({...args,method:'GET'}),e=>e.status===403);
  } finally {
    await client.query('rollback').catch(()=>{});await client.end();
    keys.forEach((key,i)=>{if(previous[i]===undefined) delete process.env[key];else process.env[key]=previous[i];});
  }
});
