import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWorkflow} from '../server/workflow-v31.mjs';
import {nativeDocumentPolicy} from '../server/native-agent.mjs';
import {finalDocument,withArdApprovals} from '../shared/final-document.mjs';
import {gateBasis} from '../shared/workflow-v31.mjs';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
const state=()=>({no:'2026-033',source:'database',name:'테스트',journeyStep:3,requesterId:'1',ownerId:'2',workflowTrack:'MEDIUM',nativeAgentArtifacts:{ARD:{id:'1',status:'complete',version:1,contentVersion:1}},developerIds:['4']});
const actor=(id,app_role='general_user')=>({id,app_role,is_active:true,display_name:String(id)});
const vote=(s,role,a)=>applyWorkflow(s,{gateVote:{gate:'G2',role,decision:'APPROVED'}},{...structuredClone(s)},a,{requester_id:1,owner_id:2});
test('ARD parties approve before G2 leader and only then enter design',()=>{
 let s=state();assert.throws(()=>vote(s,'team_leader',actor(3,'team_leader')));
 s=vote(s,'requester',actor(1));assert.equal(s.journeyStep,3);
 s=vote(s,'owner',actor(2));assert.equal(s.journeyStep,4);
 assert.throws(()=>vote(s,'team_leader',actor(3,'team_leader')),/마감일/);
 s.committedDate='2026-10-01';s=vote(s,'team_leader',actor(3,'team_leader'));assert.equal(s.journeyStep,5);
});
test('completed ARD parties and assigned developer can read only final, not chat or drafts',()=>{
 for(const [id,member] of [[1,false],[2,false],[4,true]]){
  const p=nativeDocumentPolicy(actor(id),{requester_id:1,owner_id:2},state(),member,'ARD');
  assert.equal(p.canReadFinal,true);assert.equal(p.canReadStage,false);assert.equal(p.canEdit,false);
 }
 assert.equal(nativeDocumentPolicy(actor(9),{},state(),false,'ARD').canReadFinal,false);
 const draft=state();draft.nativeAgentArtifacts.ARD.status='draft';assert.equal(nativeDocumentPolicy(actor(1),{requester_id:1},draft,false,'ARD').canReadFinal,false);
});
test('final markdown preserves content and updates one approval appendix without resetting approval basis',()=>{
 const s=state(),md=finalDocument('# ARD 초안\n\n본문 원문','ARD','팀장','2026-09-14');
 assert.match(md,/작성 최종본/);assert.match(md,/본문 원문/);
 const first=withArdApprovals(md,s);s.workflowApprovals={G2:{requester:{decision:'APPROVED',actorName:'요구자',at:'now'}}};
 const second=withArdApprovals(first,s);assert.equal(second.split('## 승인 현황').length,2);assert.match(second,/승인 완료/);
 const before=gateBasis('G2',s);s.nativeAgentArtifacts.ARD.version=2;s.nativeAgentArtifacts.ARD.id='2';assert.equal(gateBasis('G2',s),before);
});
test('mail tasks follow ARD requester and owner, then G2 leader',()=>{
 let s=state();const notice=id=>buildWorkNotifications([s],{id:String(id),appRole:id===3?'team_leader':'general_user'});
 assert.equal(notice(1)[0].journeyStep,3);assert.equal(notice(2)[0].title,'ARD 요구 정의 승인');assert.equal(notice(3).length,0);
 s=vote(s,'requester',actor(1));assert.equal(notice(1).length,0);
 s=vote(s,'owner',actor(2));assert.equal(notice(3)[0].title,'G2 승인 요청');assert.equal(notice(3)[0].journeyStep,4);
});
