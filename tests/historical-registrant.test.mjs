import test from 'node:test';
import assert from 'node:assert/strict';
import {isProjectParty} from '../shared/project-actors.mjs';
import {eligibleRole} from '../shared/workflow-v31.mjs';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
test('historical registrant fallback cannot receive UAT or approve on behalf of emailed parties',()=>{
 const state={source:'database',no:'2026-037',historicalImport:true,historicalImportFinalizedAt:'2026-09-30',createdByUserId:'99',journeyStep:6,requesterId:'99',ownerId:'99',requesterEmail:'requester@example.com',projectOwnerEmail:'owner@example.com'};
 const admin={id:'99',email:'admin@example.com',appRole:'admin',app_role:'admin'};
 const requester={id:'1',email:'requester@example.com',appRole:'general_user',app_role:'general_user',is_active:true};
 const owner={id:'2',email:'owner@example.com',appRole:'general_user'};
 assert.equal(isProjectParty(state,admin,'requester'),false);
 assert.equal(isProjectParty(state,owner,'owner'),true);
 assert.equal(eligibleRole('requester',admin,{requester_id:99},state),false);
 assert.equal(eligibleRole('requester',requester,{requester_id:99},state),true);
 assert.equal(buildWorkNotifications([state],admin).some(n=>n.title==='요구자 UAT 확인'),false);
 assert.equal(buildWorkNotifications([state],requester).some(n=>n.title==='요구자 UAT 확인'),true);
 assert.equal(isProjectParty({...state,requesterEmail:''},admin,'requester'),false);
 assert.equal(isProjectParty({...state,requesterEmail:admin.email},admin,'requester'),true);
});
