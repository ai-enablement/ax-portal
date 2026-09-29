import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowAction,workflowTransition} from '../shared/rpa-workflow.mjs';
import {kstDate} from '../shared/portal-time.mjs';
test('only management roles modify progress, but the requester retains verification',()=>{
 for(const role of ['admin','team_leader','team_member','general_user','bts','bp_solution','d2b',undefined]){
  const actor={id:3,email:'dev@example.com',app_role:role},p={assigneeEmail:actor.email,verification:{decision:'approved'}};
  const allowed=['admin','team_leader','team_member'].includes(role);
  assert.equal(workflowAction('received',p,actor,3),allowed?'assign':null);
  assert.equal(workflowAction('working',p,actor,3),allowed?'resolve':null);
  assert.equal(workflowAction('completed',p,actor,3),allowed?'finalize':null);
  assert.equal(workflowAction('testing',p,actor,3),'verify');
  assert.equal(workflowAction('testing',p,actor,4),null);
  assert.equal(workflowAction('testing',{...p,deletedAt:'now'},actor,3),null);
 }
});
test('expected date is date-only, rejects impossible days and preserves legacy KST dates',()=>{
 const assign=expectedAt=>workflowTransition('received',{},'assign',{expectedAt,assigneeEmail:'dev@example.com'});
 assert.equal(assign('2026-10-01').values.expectedAt,'2026-10-01');
 assert.equal(assign('2028-02-29').values.expectedAt,'2028-02-29');
 for(const value of ['','2026-02-29','2026-02-30','2026-13-01','2026-10-01T15:00:00+09:00'])assert.throws(()=>assign(value));
 assert.equal(kstDate('2026-09-30T15:00:00Z'),'2026-10-01');
});
test('RPA four stage role matrix has no admin override after assignment',()=>{
 const admin={id:1,email:'admin@example.com',app_role:'admin'},dev={id:2,email:'dev@example.com',app_role:'team_member'},pic={id:3,email:'pic@example.com',app_role:'general_user'};
 const p={assigneeEmail:dev.email,verification:{decision:'approved'}};
 assert.equal(workflowAction('received',p,admin,3),'assign');assert.equal(workflowAction('received',p,pic,3),null);
 assert.equal(workflowAction('working',p,admin,3),null);assert.equal(workflowAction('working',p,dev,3),'resolve');
 assert.equal(workflowAction('testing',p,pic,3),'verify');assert.equal(workflowAction('testing',p,admin,3),null);
 assert.equal(workflowAction('completed',p,dev,3),'finalize');assert.equal(workflowAction('completed',{...p,completedAt:'now'},dev,3),null);
});
test('verification rejection requires a reason and returns to development',()=>{
 assert.throws(()=>workflowTransition('testing',{},'verify',{decision:'rejected'}));
 assert.equal(workflowTransition('testing',{},'verify',{decision:'rejected',reason:'Fix again'}).status,'working');
 assert.equal(workflowTransition('testing',{},'verify',{decision:'approved'}).status,'completed');
 assert.throws(()=>workflowTransition('working',{},'resolve',{analysis:'Only cause'}));
});
