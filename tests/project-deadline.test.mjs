import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDeadlineChange,validDeadline,canEditProjectDeadline} from '../shared/project-deadline.mjs';
import {applyWorkflow} from '../server/workflow-v31.mjs';
const actor={id:3,app_role:'team_leader',display_name:'팀장'};
const initial={journeyStep:4},change={date:'2026-10-01',previousDate:'',reason:'G2 일정 협의'};
test('only the team leader confirms and changes deadlines with immutable history',()=>{
 for(const app_role of ['general_user','admin','team_member','bts','bp_solution'])assert.throws(()=>applyDeadlineChange(initial,change,{...actor,app_role}),/팀장만/);
 const first=applyDeadlineChange(initial,change,actor,'2026-09-11T00:00:00Z');
 const second=applyDeadlineChange({...initial,...first,journeyStep:6},{date:'2026-10-08',previousDate:first.committedDate,reason:'평가 일정 조정'},actor);
 assert.equal(second.deadlineHistory.length,2);assert.equal(second.deadlineHistory[1].previousDate,'2026-10-01');assert.equal(first.deadlineHistory.length,1);
 assert.throws(()=>applyDeadlineChange({...initial,...first},change,actor),/다른 화면/);
 assert.throws(()=>applyDeadlineChange(initial,{...change,reason:''},actor),/사유/);
 assert.throws(()=>applyDeadlineChange({journeyStep:3},change,actor),/G2/);
 assert.equal(validDeadline('2026-02-30'),false);
});
test('generic updates cannot bypass deadline authorization or forge history',()=>{
 for(const update of [{committedDate:'2026-10-01'},{deadlineHistory:[]}])assert.throws(()=>applyWorkflow(initial,update,{...initial,...update},actor,{}),/전용/);
});
test('historical assigned developers can set deadlines from G2, including import preparation',()=>{
 const project={...initial,historicalImport:true,developerIds:['7','8']};
 for(const app_role of ['team_member','bts','bp_solution','admin']){
  const developer={id:7,app_role,display_name:'개발 담당'};
  assert.equal(canEditProjectDeadline(project,{userId:'7',appRole:app_role}),true);
  const saved=applyDeadlineChange(project,change,developer);
  assert.equal(saved.committedDate,change.date);assert.equal(saved.deadlineHistory[0].actorId,'7');
  const next=applyDeadlineChange({...project,...saved},{date:'2026-10-02',previousDate:change.date,reason:'공동 담당자 일정 조정'},{...developer,id:8});
  assert.equal(next.deadlineHistory.length,2);
  assert.throws(()=>applyDeadlineChange({...project,...saved},change,developer),/다른 화면/);
  assert.throws(()=>applyDeadlineChange({...project,journeyStep:3},change,developer),/G2/);
  assert.throws(()=>applyDeadlineChange({...project,historicalImport:false},change,developer),/팀장만/);
 }
 assert.equal(canEditProjectDeadline(project,{userId:'99',sharedUserIds:['7'],appRole:'team_member'}),true);
 for(const developer of [{id:9,app_role:'team_member'},{id:9,app_role:'admin'},{id:7,app_role:'general_user'},{id:7,app_role:'team_member',is_active:false}]){
  assert.equal(canEditProjectDeadline(project,developer),false);
  assert.throws(()=>applyDeadlineChange(project,change,developer),/배정된 개발 담당자/);
 }
 const developer={id:7,app_role:'team_member',display_name:'개발 담당'};
 const result=applyWorkflow(project,{deadlineChange:change},{...project,deadlineChange:change},developer,{});
 assert.equal(result.committedDate,change.date);assert.equal(result.journeyStep,4);
 assert.equal(result.historicalImportFinalizedAt,undefined);assert.equal(result.workflowApprovals,undefined);
 assert.equal(canEditProjectDeadline(project,actor),false);
 assert.equal(canEditProjectDeadline({...project,historicalImportFinalizedAt:'2026-09-29T00:00:00Z'},actor),true);
});
test('finalizing an import revokes developer deadline writes, including stale open editors',()=>{
 const before={...initial,historicalImport:true,developerIds:['7','8']};
 const developer={id:7,app_role:'team_member',display_name:'개발 담당'};
 const saved=applyDeadlineChange(before,change,developer);
 const finalized={...before,...saved,historicalImportFinalizedAt:'2026-09-29T00:00:00Z'};
 const update={date:'2026-10-08',previousDate:change.date,reason:'완료 후 일정 변경'};
 for(const app_role of ['team_member','bts','bp_solution','admin','general_user']){
  const member={...developer,app_role};
  assert.equal(canEditProjectDeadline(finalized,{userId:'7',appRole:app_role}),false);
  assert.throws(()=>applyDeadlineChange(finalized,update,member),e=>e.status===403);
  assert.throws(()=>applyDeadlineChange({...finalized,committedDate:''},change,member),e=>e.status===403);
  assert.throws(()=>applyWorkflow(finalized,{deadlineChange:update},{...finalized,deadlineChange:update},member,{}),e=>e.status===403);
 }
 assert.equal(canEditProjectDeadline(finalized,{userId:'99',sharedUserIds:['7'],appRole:'team_member'}),false);
 assert.equal(canEditProjectDeadline(finalized,actor),true);
 const result=applyDeadlineChange(finalized,update,actor);
 assert.equal(result.committedDate,update.date);
 assert.equal(result.deadlineHistory.length,2);
 assert.equal(result.deadlineHistory[0].actorId,'7');
 assert.equal(result.deadlineHistory[1].actorId,String(actor.id));
});
