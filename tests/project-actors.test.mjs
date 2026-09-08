import test from 'node:test';
import assert from 'node:assert/strict';
import {isProjectParty,isProjectApprover,isProjectDeveloper} from '../shared/project-actors.mjs';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
const p={source:'database',no:'2026-033',historicalImport:true,historicalImportFinalizedAt:'2026-09-09',createdByUserId:'99',requesterId:'1',ownerId:'2',developerIds:['3'],securityReviewerId:'4',requesterEmail:'stale@example.com'};
test('every UI role resolves persisted account ID even when email or roster is missing',()=>{
 assert.equal(isProjectParty(p,{userId:'1'},'requester'),true);
 assert.equal(isProjectParty(p,{userId:'2'},'owner'),true);
 assert.equal(isProjectDeveloper(p,{userId:'3'}),true);
 assert.equal(isProjectApprover(p,{userId:'4'},'security_reviewer'),true);
 assert.equal(isProjectApprover(p,{userId:'5',appRole:'team_leader'},'team_leader'),true);
 for(const role of ['requester','owner','security_reviewer','team_leader'])assert.equal(isProjectApprover(p,{userId:'99',appRole:'admin'},role),false);
 assert.equal(isProjectParty(p,{userId:'99',email:'stale@example.com'},'requester'),false);
 assert.equal(isProjectParty({}, {email:''},'owner'),false);
 assert.equal(isProjectParty({ownerId:'2'},{email:''},'owner'),false);
 assert.equal(isProjectParty({requesterEmail:'match@example.com'},{email:'MATCH@example.com'},'requester'),true);
 assert.equal(isProjectDeveloper(p,{userId:'3',is_active:false}),false);
});
test('historical lifecycle alerts use real parties and never the bulk import creator',()=>{
 const actors=[{id:'1',appRole:'general_user'},{id:'2',appRole:'general_user'},{id:'3',appRole:'team_member'},{id:'4',appRole:'team_member'},{id:'5',appRole:'team_leader'},{id:'99',appRole:'admin',email:'stale@example.com'}];
 const cases=[
  [0,{},['1']], [1,{},['1']], [2,{},['5']], [3,{},['3']], [4,{},['1','2','5']],
  [5,{deliveryPhase:'design'},['3']], [5,{deliveryPhase:'development'},['1','3']],
  [6,{workflowTrack:'HIGH',uatRecord:{completed:true}},['4','5']], [7,{},['3']], [8,{},['2','5']],
  [2,{g1Resolution:{decision:'GO'},developerIds:[]},['99']],
  [2,{g1Resolution:{decision:'DROP',reason:'보완'}},['1']]
 ];
 for(const [journeyStep,extra,expected] of cases){
  const project={...p,journeyStep,...extra};
  assert.deepEqual(actors.filter(a=>buildWorkNotifications([project],a).length).map(a=>a.id),expected,`step ${journeyStep} ${JSON.stringify(extra)}`);
 }
});
