import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSummary,fiscalRange,calendarDays,validDay,validateProgressChange,scheduleStatus} from '../shared/leader-dashboard.mjs';
import {saveProjectProgress} from '../server/project-progress.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';
test('inclusive fiscal calendar and KST date input',()=>{
 assert.equal(dashboardSummary([],fiscalRange(2026),'2026-09-28').elapsed,91);
 assert.equal(calendarDays('2024-02-28','2024-03-01'),3);
 assert.equal(validDay('2026-02-30'),false);
 assert.equal(dashboardSummary([],fiscalRange(2026),'2025-10-01').elapsed,0);
 assert.equal(dashboardSummary([],fiscalRange(2026),'2027-01-01').elapsed,100);
});
test('manual progress weighted by FULL intake-to-deadline days, excludes missing not zero',()=>{
 const projects=[{start:'2026-01-01',end:'2026-01-10',manualProgress:100},{start:'2026-01-01',end:'2026-01-30',manualProgress:0},{start:'2026-01-01',end:'2026-01-20',manualProgress:null},{start:'',end:'',manualProgress:100},{start:'2025-01-01',end:'2025-01-02',manualProgress:100}];
 const result=dashboardSummary(projects,{start:'2026-01-05',end:'2026-01-06'},'2026-01-05');
 assert.equal(result.progress,25);assert.equal(result.scoped.length,3);assert.equal(result.missingDates,1);assert.equal(result.missingProgress,1);
 assert.equal(dashboardSummary([],fiscalRange(2026),'2026-09-28').progress,null);
});
test('status never treats missing progress as completed',()=>{
 assert.equal(scheduleStatus({start:'2026-09-01',end:'2026-09-15'},'2026-09-28'),'late');
 assert.equal(scheduleStatus({start:'2026-10-01',end:'2026-10-15'},'2026-09-28'),'plan');
 assert.equal(scheduleStatus({manualProgress:100},'2026-09-28'),'done');
});
test('strict validation, no blank / string / fractional / overflowing values',()=>{
 for(const percent of [null,'', '50', -1,101,NaN,Infinity,2.5])assert.throws(()=>validateProgressChange({percent,note:''}));
 assert.deepEqual(validateProgressChange({percent:0,note:' hello '}),{percent:0,note:'hello'});
});
function fixture({assigned=true,state={},role='team_member'}={}){
 const writes=[];const client={query:async(sql,args)=>{if(sql.startsWith('select 1'))return {rows:assigned?[{ok:1}]:[]};writes.push({sql,args});return {rows:[],rowCount:1};}};
 const project={id:1,project_code:'TEST',committed_completion_date:'2026-10-31',runtime_state:{name:'test',progress:80,journeyStep:5,...state}};
 const actor={id:7,display_name:'Developer',app_role:role};return {writes,client,project,actor};
}
test('persist separately, preserve workflow, record authenticated author',async()=>{
 const f=fixture();const result=await saveProjectProgress(f.client,f.project,f.actor,{percent:32,note:'work',expectedRevision:0});
 assert.equal(result.status,200);assert.equal(result.body.project.manualProgress,32);assert.equal(result.body.project.progress,80);assert.equal(result.body.project.journeyStep,5);assert.equal(result.body.project.progressRevision,1);
 assert.equal(result.body.project.progressHistory[0].actorId,'7');assert.equal(f.writes.length,2);
 const stored=JSON.parse(f.writes[0].args[1]);assert.equal(stored.manualProgress,32);
 assert.match(f.writes[1].sql,/PROJECT_MANUAL_PROGRESS/);
});
test('unassigned admin and general user cannot write; reject stale and invalid date',async()=>{
 for(const options of [{assigned:false,role:'admin'},{role:'general_user'}]){const f=fixture(options);assert.equal((await saveProjectProgress(f.client,f.project,f.actor,{percent:20,note:'',expectedRevision:0})).status,403);assert.equal(f.writes.length,0);}
 const f=fixture({state:{progressRevision:2}});assert.equal((await saveProjectProgress(f.client,f.project,f.actor,{percent:20,note:'',expectedRevision:0})).status,409);assert.equal(f.writes.length,0);
 assert.equal((await saveProjectProgress(f.client,f.project,f.actor,{percent:20,start:'2027-01-01',note:'',expectedRevision:2})).status,400);
});
test('real DB save / reread / audit verified inside rollback-only transaction',{skip:process.env.PORTAL_PROGRESS_DB_TEST!=='1'},async()=>{
 const client=await getPool().connect();
 try{
  await client.query('begin');
  const project=(await client.query("select p.*,ir.raw_answers->'portalState' as runtime_state from agent_portal.projects p join agent_portal.intake_requests ir on ir.project_id=p.id where p.deleted_at is null and exists(select 1 from agent_portal.project_members m join agent_portal.users u on u.id=m.user_id where m.project_id=p.id and m.relationship='developer' and m.ended_at is null and u.is_active=true and u.app_role<>'general_user') order by p.id limit 1 for update of p")).rows[0];
  assert.ok(project);
  const actor=(await client.query("select u.* from agent_portal.users u join agent_portal.project_members m on u.id=m.user_id where m.project_id=$1 and m.relationship='developer' and m.ended_at is null and u.is_active=true and u.app_role<>'general_user' limit 1",[project.id])).rows[0];
  const result=await saveProjectProgress(client,project,actor,{percent:37,note:'Rollback-only automated verification',expectedRevision:project.runtime_state?.progressRevision||0});
  assert.equal(result.status,200);
  const saved=(await client.query("select raw_answers->'portalState' as state from agent_portal.intake_requests where project_id=$1",[project.id])).rows[0].state;
  assert.equal(saved.manualProgress,37);assert.equal(saved.progressHistory.at(-1).actorId,String(actor.id));assert.equal(saved.progress,project.runtime_state.progress);
  const audit=(await client.query("select after_data from agent_portal.audit_logs where project_id=$1 and action_code='PROJECT_MANUAL_PROGRESS' order by id desc limit 1",[project.id])).rows[0];assert.equal(audit.after_data.percent,37);
  const unchanged=(await client.query('select current_stage_code,progress_percent from agent_portal.projects where id=$1',[project.id])).rows[0];assert.equal(unchanged.current_stage_code,project.current_stage_code);assert.equal(unchanged.progress_percent,project.progress_percent);
 }finally{await client.query('rollback');client.release();await closePool();}
});
