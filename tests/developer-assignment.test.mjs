import test from 'node:test';
import assert from 'node:assert/strict';
import {changeProjectDevelopers} from '../server/developer-assignment.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';
const actor={id:9,app_role:'admin',display_name:'Admin'};
const action={developerIds:['2'],expectedIds:['1'],reason:'업무 인수인계'};
function client(){const writes=[];return {writes,query:async(sql,args)=>{
 if(sql.startsWith('select u.id'))return {rows:[{id:1,name:'Old'}]};
 if(sql.startsWith('select id,display_name'))return {rows:[{id:2,name:'New'}]};
 if(sql.startsWith('select now()'))return {rows:[{at:'2026-09-10T01:00:00Z'}]};
 writes.push({sql,args});return {rows:[],rowCount:1};
}};}
test('only G2 permits leader and admin changes without altering stage or votes',async()=>{
 for(const journeyStep of [0,1,2,3,4,5,6,7,8,9])for(const historicalImport of [false,true])for(const app_role of ['admin','team_leader']){
  const state={journeyStep,historicalImport,workflowApprovals:{G2:{owner:{decision:'APPROVED'}}},developerAssignmentHistory:[]};
  const db=client();const result=await changeProjectDevelopers(db,{id:1,project_code:'2026-043',current_stage_code:['INT','FEA','G1','ARD','G2','DES','G3','PILOT','G4','OPS'][journeyStep],runtime_state:state},{...actor,app_role},action);
  if(journeyStep!==4){assert.equal(result.status,409);assert.equal(db.writes.length,0);continue;}
  assert.equal(result.status,200);const p=result.body.project;
  assert.equal(p.journeyStep,journeyStep);assert.deepEqual(p.workflowApprovals,state.workflowApprovals);
  assert.deepEqual(p.developerIds,['2']);assert.deepEqual(p.developerAssignmentHistory[0],{at:'2026-09-10T01:00:00.000Z',actorId:'9',actorName:'Admin',reason:action.reason,before:[{id:'1',name:'Old'}],after:[{id:'2',name:'New'}]});
  assert.ok(db.writes.some(w=>w.sql.includes('audit_logs')));assert.ok(!db.writes.some(w=>w.sql.includes('change_project_stage')));
 }
});
test('other roles, missing reasons, empty selections, conflicts and no-op changes are blocked without writes',async()=>{
 for(const [who,request,status] of [...['general_user','team_member','bts','bp_solution'].map(app_role=>[{...actor,app_role},action,403]),[actor,{...action,reason:' '},400],[actor,{...action,developerIds:[]},400],[actor,{...action,expectedIds:['5']},409],[actor,{...action,developerIds:['1']},400]]){
  const db=client();assert.equal((await changeProjectDevelopers(db,{id:1,current_stage_code:'G2'},who,request)).status,status);assert.equal(db.writes.length,0);
 }
});
test('real DB reassignment persists history and audit atomically, then rolls back',{skip:process.env.PORTAL_DEVELOPER_DB_TEST!=='1'},async()=>{
 const db=await getPool().connect();
 try{
  await db.query('begin');
  const project=(await db.query("select p.*,ir.raw_answers->'portalState' as runtime_state from agent_portal.projects p join agent_portal.intake_requests ir on ir.project_id=p.id where p.project_code='2026-043' and p.deleted_at is null for update of p")).rows[0];
  const admin=(await db.query("select * from agent_portal.users where app_role='admin' and is_active=true limit 1")).rows[0];
  // Isolated G2 fixture, always rolled back with the surrounding transaction.
  await db.query("update agent_portal.projects set current_stage_code='G2' where id=$1",[project.id]);
  project.current_stage_code='G2';
  const before=(await db.query("select user_id from agent_portal.project_members where project_id=$1 and relationship='developer' and ended_at is null",[project.id])).rows.map(r=>String(r.user_id));
  const candidate=(await db.query("select id from agent_portal.users where is_active=true and app_role <> 'general_user' and not(id=any($1::bigint[])) limit 1",[before])).rows[0];
  assert.ok(candidate);
  const result=await changeProjectDevelopers(db,project,admin,{expectedIds:before,developerIds:[String(candidate.id)],reason:'Transactional QA (rolled back)'});
  assert.equal(result.status,200);
  const saved=(await db.query("select raw_answers->'portalState' as s from agent_portal.intake_requests where project_id=$1",[project.id])).rows[0].s;
  assert.equal(saved.developerAssignmentHistory.at(-1).reason,'Transactional QA (rolled back)');
  assert.equal(saved.journeyStep,project.runtime_state.journeyStep);
  const audit=(await db.query("select after_data from agent_portal.audit_logs where project_id=$1 and action_code='PROJECT_DEVELOPER_CHANGE' order by id desc limit 1",[project.id])).rows[0];
  assert.equal(audit.after_data.after[0].id,String(candidate.id));
 }finally{await db.query('rollback');db.release();await closePool();}
});
