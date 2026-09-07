import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {persistWorkflowApprovals,applyWorkflow} from '../server/workflow-v31.mjs';

test('workflow approvals persist in real PostgreSQL with exact roles, invalidation and no skipped LOW gates',{skip:process.env.PORTAL_TEST_POSTGRES!=='1'},async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  const tables=['gates','gate_approvals'];
  const adapter={query:(sql,params)=>{
    for(const m of sql.matchAll(/agent_portal\.(\w+)/g))assert.ok(tables.includes(m[1]));
    return client.query(sql.replaceAll('agent_portal.','pg_temp.'),params);
  }};
  const project={id:1,requester_id:1,owner_id:2};
  const actor={id:3,app_role:'team_leader',is_active:true};
  const vote=id=>({actorId:String(id),decision:'APPROVED',at:'2026-09-07T00:00:00Z'});
  try{
    await client.query('begin');
    await client.query("set local statement_timeout='10s'");
    for(const table of tables)await client.query(`create temporary table ${table} (like agent_portal.${table} including defaults including identity including constraints including indexes) on commit drop`);
    let state={workflowTrack:'MEDIUM',workflowApprovals:{G2:{requester:vote(1)}}};
    await persistWorkflowApprovals(adapter,project,state,{},actor);
    assert.equal((await client.query('select gate_status from pg_temp.gates')).rows[0].gate_status,'pending');
    const done={...state,workflowApprovals:{G2:{requester:vote(1),owner:vote(2),team_leader:vote(3)}}};
    await persistWorkflowApprovals(adapter,project,done,state,actor);
    assert.equal((await client.query('select gate_status from pg_temp.gates')).rows[0].gate_status,'approved');
    assert.deepEqual((await client.query("select approver_role from pg_temp.gate_approvals where decision='approved' order by approver_role")).rows.map(r=>r.approver_role),['owner','requester','team_leader']);
    state={...done,workflowApprovals:{G2:{}}};
    await persistWorkflowApprovals(adapter,project,state,done,actor);
    assert.equal((await client.query('select gate_status from pg_temp.gates')).rows[0].gate_status,'pending');
    assert.equal((await client.query("select count(*)::int as n from pg_temp.gate_approvals where decision='approved'")).rows[0].n,0);
    const high={workflowTrack:'HIGH',workflowApprovals:{G3:{team_leader:vote(3),security_reviewer:vote(4)},G4:{owner:vote(2),team_leader:vote(3)}}};
    await persistWorkflowApprovals(adapter,project,high,{},actor);
    assert.equal((await client.query("select count(*)::int as n from pg_temp.gates where gate_status='approved'")).rows[0].n,2);
    const before={journeyStep:2,workflowTrack:'LOW',g1Resolution:{decision:'GO'},developerIds:[]};
    const low=applyWorkflow(before,{developerIds:['5']},{...before,developerIds:['5']},{id:6,app_role:'admin',is_active:true},{...project,id:2});
    await persistWorkflowApprovals(adapter,{id:2},low,before,actor);
    assert.equal(low.lowRoute.phase,'registration');
    assert.equal((await client.query('select count(*)::int as n from pg_temp.gates where project_id=2')).rows[0].n,0);
  }finally{await client.query('rollback').catch(()=>{});await client.end();}
});
