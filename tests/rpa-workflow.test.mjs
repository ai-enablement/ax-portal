import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowAction,workflowTransition} from '../shared/rpa-workflow.mjs';
test('RPA four stage role matrix has no admin override after assignment',()=>{
 const admin={id:1,email:'admin@example.com',app_role:'admin'},dev={id:2,email:'dev@example.com',app_role:'general_user'},pic={id:3,email:'pic@example.com',app_role:'general_user'};
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
