import test from 'node:test';
import assert from 'node:assert/strict';
import {getPool,closePool} from '../server/db/pool.mjs';
import {resolvePortalIdentity} from '../server/auth.mjs';
import {createOperationalProject} from '../server/database-api.mjs';
import {nativeAgentRequest} from '../server/native-agent.mjs';

test('real DB: minimal registration, duplicate retry, native INT initialization and save, rolled back', {
  skip: process.env.PORTAL_MINIMAL_DB_TEST !== '1' || !process.env.PORTAL_AGENT_PYTHON,
}, async () => {
  const client=await getPool().connect();
  let code;
  try {
    await client.query('begin');
    // Use the configured local identity unchanged; never impersonate another role.
    const identity=resolvePortalIdentity(new Headers());
    assert.ok(identity?.email);
    const actor=(await client.query('select id,email,display_name from agent_portal.users where lower(email)=lower($1) and is_active=true',[identity.email])).rows[0];
    assert.ok(actor,'configured development account must already exist');
    const transact=work=>work(client);
    const input={name:'검증 전용 · 최소 접수 롤백',registrationEntry:'INT_AGENT',clientRequestId:crypto.randomUUID(),category:'개별 접수',requesterEmail:'ignored@example.invalid',ownerMode:'SELF'};
    const result=await createOperationalProject({project:input},identity,transact);
    assert.equal(result.status,201,JSON.stringify(result.body));
    const state=result.body.project;code=state.no;
    assert.equal(state.requesterEmail,actor.email.toLowerCase());
    assert.equal(state.requesterName,actor.display_name);
    assert.equal(state.intakeDraftCompleted,false);
    assert.equal(state.journeyStep,0);
    assert.equal(state.progress,0);
    assert.equal(state.projectOwnerEmail,'');
    const row=(await client.query('select id,requester_id,owner_id,current_stage_code from agent_portal.projects where project_code=$1',[code])).rows[0];
    assert.equal(String(row.requester_id),String(actor.id));
    assert.equal(row.owner_id,null);
    assert.equal(row.current_stage_code,'INT');
    const retry=await createOperationalProject({project:input},identity,transact);
    assert.equal(retry.status,200);assert.equal(retry.body.project.no,code);
    const deps={pool:client,transact};
    const project=await nativeAgentRequest(identity,code,'INT',`/api/projects/${code}`,'GET',{},0,deps);
    assert.equal(project.status,200,JSON.stringify(project.body));
    const serialized=JSON.stringify(project.body);
    assert.ok(serialized.includes(actor.display_name));
    assert.ok(serialized.includes(input.name));
    const saved=await nativeAgentRequest(identity,code,'INT',`/api/projects/${code}`,'PUT',{int_data:{problem:'반복 회의 일정 확인을 자동화하고 싶습니다.'}},project.revision||0,deps);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    const session=(await client.query('select * from agent_portal.native_agent_sessions where project_id=$1',[row.id])).rows[0];
    assert.ok(JSON.stringify(session).includes('반복 회의 일정 확인'));
    const stillInt=(await client.query('select current_stage_code from agent_portal.projects where id=$1',[row.id])).rows[0];
    assert.equal(stillInt.current_stage_code,'INT');
  } finally {
    await client.query('rollback');
    if(code)assert.equal((await client.query('select count(*)::int as n from agent_portal.projects where project_code=$1',[code])).rows[0].n,0);
    client.release();await closePool();
  }
});
