import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDeadlineChange,validDeadline} from '../shared/project-deadline.mjs';
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
