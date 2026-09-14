import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalAdminChange,historicalAdminUpdate} from '../server/historical-admin.mjs';
const admin={id:1,app_role:'admin',display_name:'관리자'};
const state=()=>({historicalImport:true,journeyStep:1,workflowApprovals:{G1:{team_leader:{decision:'APPROVED'}}}});
const input=()=>({action:'replace',document:'INT',name:'접수.md',markdown:'# 원문\n내용',reason:'기존 문서 이관',previousStep:1,previousVersion:0});
test('historical admin rejects all non-admin roles and new projects',()=>{
 for(const role of ['general_user','team_member','team_leader','bts','bp_solution'])assert.throws(()=>historicalAdminChange(state(),{...admin,app_role:role},input()),{status:403});
 assert.throws(()=>historicalAdminChange({...state(),historicalImport:false},admin,input()),{status:403});
});
test('replacement validates scope, file, reason and concurrent changes',()=>{
 for(const patch of [{document:'DES'},{name:'a.exe'},{markdown:''},{markdown:'\u0000'},{reason:''},{markdown:'a'.repeat(1024*1024+1)}])assert.throws(()=>historicalAdminChange(state(),admin,{...input(),...patch}),{status:400});
 assert.throws(()=>historicalAdminChange(state(),admin,{...input(),previousStep:2}),{status:409});
 assert.throws(()=>historicalAdminChange(state(),admin,{...input(),previousVersion:2}),{status:409});
});
test('replacement keeps current stage and preserves signatures as history',()=>{
 for(const document of ['INT','FEA','ARD']){
  const before=state(),{state:after}=historicalAdminChange(before,admin,{...input(),document});
  assert.equal(after.journeyStep,1);assert.equal(after.historicalImportFinalizedAt,undefined);
  assert.deepEqual(after.workflowApprovals.G1,{});assert.equal(after.workflowApprovalHistory[0].approvals.G1.team_leader.decision,'APPROVED');
  assert.equal(before.workflowApprovals.G1.team_leader.decision,'APPROVED');
 }
});
test('forced forward/backward transitions retain import notification boundary and record actor/reason',()=>{
 for(const step of [0,2,3,4,5,6,7,8,9]){
  const {state:after,event}=historicalAdminChange(state(),admin,{...input(),action:'move',step,phase:'development'});
  assert.equal(after.journeyStep,step);assert.equal(after.historicalBaselineStep,step);assert.equal(after.historicalImportFinalizedAt,undefined);
  assert.equal(event.actorId,'1');assert.equal(event.reason,'기존 문서 이관');
 }
 const finalized={...state(),historicalImportFinalizedAt:'2026-09-01'};
 assert.equal(historicalAdminChange(finalized,admin,{...input(),action:'move',step:3}).state.historicalImportFinalizedAt,'2026-09-01');
 for(const step of [-1,10,2.5])assert.throws(()=>historicalAdminChange(state(),admin,{...input(),action:'move',step}),{status:400});
});
test('replacement persistence uses project lock, final snapshot, seeded session and audit in one transaction',async()=>{
 const calls=[];
 const client={query:async(sql,args=[])=>{
  calls.push({sql,args});
  let rows=[];
  if(sql.includes('from agent_portal.projects where project_code'))rows=[{id:1,current_stage_code:'FEA',requester_id:2,owner_id:3}];
  else if(sql.includes('from agent_portal.users'))rows=[admin];
  else if(sql.includes('select raw_answers'))rows=[{raw_answers:{portalState:state()}}];
  else if(sql.includes('max(version_number)'))rows=[{version:2}];
  else if(sql.includes('insert into agent_portal.native_agent_documents'))rows=[{id:8,version_number:3}];
  else if(sql.includes('insert into agent_portal.gates'))rows=[{id:9}];
  return {rows};
 }};
 let transactions=0;
 await historicalAdminUpdate({email:'test@example.com'},'2026-001',input(),async work=>{transactions++;return work(client);});
 assert.equal(transactions,1);
 assert.ok(calls.findIndex(x=>x.sql.includes('for update'))<calls.findIndex(x=>x.sql.includes('insert into agent_portal.native_agent_documents')));
 const doc=calls.find(x=>x.sql.includes('insert into agent_portal.native_agent_documents'));
 assert.match(doc.args[4],/작성 최종본/);assert.match(doc.args[4],/원문/);
 const saved=JSON.parse(calls.find(x=>x.sql.startsWith('update agent_portal.intake_requests')).args[1]);
 assert.equal(saved.nativeAgentArtifacts.INT.version,3);assert.equal(saved.historicalAdminHistory[0].version,3);
 const payload=JSON.parse(calls.find(x=>x.sql.includes('insert into agent_portal.native_agent_sessions')).args[1]);
 assert.ok(payload.int_data);assert.match(payload.int_md,/원문/);
 assert.ok(calls.some(x=>x.sql.includes('ADMIN_HISTORICAL_OVERRIDE')));
 assert.ok(!calls.some(x=>x.sql.startsWith('update agent_portal.projects')));
 calls.length=0;
 const batch={action:'replace',reason:'일괄 대체',previousStep:1,documents:['INT','FEA','ARD'].map(document=>({...input(),document}))};
 await historicalAdminUpdate({email:'test@example.com'},'2026-001',batch,async work=>work(client));
 assert.equal(calls.filter(x=>x.sql.includes('insert into agent_portal.native_agent_documents')).length,3);
 assert.equal(calls.filter(x=>x.sql.includes('ADMIN_HISTORICAL_OVERRIDE')).length,1);
 const bulkSaved=JSON.parse(calls.find(x=>x.sql.startsWith('update agent_portal.intake_requests')).args[1]);
 assert.equal(bulkSaved.historicalAdminHistory.length,1);
 assert.equal(bulkSaved.historicalAdminHistory[0].documents.length,3);
 for(const document of ['INT','FEA','ARD'])assert.equal(bulkSaved.nativeAgentArtifacts[document].status,'complete');
 calls.length=0;
 batch.documents[2].markdown='';
 await assert.rejects(()=>historicalAdminUpdate({email:'test@example.com'},'2026-001',batch,work=>work(client)),{status:400});
 assert.equal(calls.filter(x=>/^(insert|update)/.test(x.sql)).length,0,'validate every file before the first write');
});
test('batch accepts subsets and rejects duplicate, empty, invalid or stale selections',()=>{
 const batch={action:'replace',reason:'일괄 대체',previousStep:1,documents:['INT','FEA','ARD'].map(document=>({...input(),document}))};
 assert.equal(historicalAdminChange(state(),admin,batch).event.documents.length,3);
 assert.equal(historicalAdminChange(state(),admin,{...batch,documents:batch.documents.slice(0,2)}).event.documents.length,2);
 for(const documents of [[],[input(),input()],[null],{},[...batch.documents,input()]])assert.throws(()=>historicalAdminChange(state(),admin,{...batch,documents}),{status:400});
 assert.throws(()=>historicalAdminChange(state(),admin,{...batch,documents:[{...input(),previousVersion:1}]}),{status:409});
});
