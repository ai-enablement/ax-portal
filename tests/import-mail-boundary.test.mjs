import test from 'node:test';
import assert from 'node:assert/strict';
import {mailNotifications,currentJobPayload,mailKey} from '../server/work-mail.mjs';
const project={no:'2026-TEST',source:'database',name:'Import',historicalImport:true,requesterId:'1',ownerId:'2',developerIds:['3'],journeyStep:3,nativeAgentArtifacts:{ARD:{status:'complete',version:1}}};
test('every import stage excludes nonassigned requester, Owner, leader and Admin from mail',()=>{
 for(let journeyStep=0;journeyStep<=9;journeyStep++){
  const p={...project,journeyStep};
  for(const [id,appRole] of [['1','general_user'],['2','general_user'],['4','team_leader'],['5','admin']])assert.deepEqual(mailNotifications([p],{id,appRole}),[]);
  assert.equal(mailNotifications([p],{id:'3',appRole:'team_member'})[0].title,'과거 과제 이관 보완');
 }
});
test('already queued party approval mail is suppressed until import finalization',async()=>{
 const finalized={...project,historicalImportFinalizedAt:'2026-09-29'};
 for(const id of ['1','2']){
  const actor={id,email:`user${id}@example.com`,app_role:'general_user',is_active:true};
  const action=mailNotifications([finalized],{id,appRole:actor.app_role})[0];assert.equal(action.title,'ARD 요구 정의 승인');
  const client={query:async()=>({rows:[actor]})};
  const job={actor_id:id,notification_key:mailKey(action)};
  assert.equal(await currentJobPayload(client,job,{},async()=>({status:200,body:{projects:[project]}})),null);
 }
});
