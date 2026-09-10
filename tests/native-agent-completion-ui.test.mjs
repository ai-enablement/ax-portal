import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {GET} from '../app/api/native-agent/[code]/workspace/route.js';
import {verifyAndComplete,nativeDocumentPolicy} from '../server/native-agent.mjs';

test('verify buttons await completion and remain disabled after success',async()=>{
 for(const document of ['INT','FEA','ARD']){
  const response=await GET(new Request(`http://localhost/api/native-agent/2026-033/workspace?document=${document}`,{headers:{'x-ms-client-principal-name':'test@example.com'}}),{params:Promise.resolve({code:'2026-033'})});
  const html=await response.text();
  assert.equal((html.match(/post\('\/portal\/verify-complete',/g)||[]).length,3);
  assert.equal((html.match(/offerPortalCompletion\(r\); toast/g)||[]).length,3);
  assert.doesNotMatch(html,/window.confirm\(PORTAL_DOC/);
  for(const id of ['btnVerify','btnFeaVerify','btnArdVerify'])assert.ok(html.includes(`$('#${id}').disabled = portalReadOnly;`));
  const start=html.indexOf('function offerPortalCompletion('),end=html.indexOf('/* ═══════════════ 검증',start),messages=[];
  const ctx=vm.createContext({PORTAL_CODE:'2026-033',portalReadOnly:false,enforceReadOnly(){},location:{origin:'http://localhost'},window:{parent:{postMessage:m=>messages.push(m)}}});
  vm.runInContext(html.slice(start,end),ctx);
  ctx.offerPortalCompletion({done:true});assert.equal(messages.length,0);
  ctx.offerPortalCompletion({portalCompleted:true});assert.equal(ctx.portalReadOnly,true);assert.equal(messages[0].project,'2026-033');
 }
});
test('validation, generation and persistence run in order with successive revisions',async()=>{
 for(const doc of ['INT','FEA','ARD']){
  const calls=[];
  const r=await verifyAndComplete(doc,{project_no:'2026-043',form:{test:true}},2,async(path,data,revision)=>{calls.push({path,data,revision});return {status:200,body:{done:true},revision:revision+1};});
  assert.deepEqual(calls.map(c=>c.revision),[2,3,4]);
  assert.match(calls[0].path,/verify$/);assert.match(calls[1].path,/generate$|finalize$/);assert.equal(calls[2].path,'/portal/complete');
  assert.equal(r.body.portalCompleted,true);assert.equal(r.canEdit,false);
 }
});
test('incomplete or failed validation and generation never mark a stage complete',async()=>{
 for(const body of [{done:false},{done:true,blocked:true},{done:true,llm_error:'unavailable'}]){
  let calls=0;await verifyAndComplete('FEA',{},0,async()=>{calls++;return {status:200,body,revision:1};});assert.equal(calls,1);
 }
 let calls=0;const r=await verifyAndComplete('ARD',{},0,async()=>++calls===1?{status:200,body:{done:true},revision:1}:{status:503,body:{error:'save failed'}});
 assert.equal(calls,2);assert.equal(r.status,503);assert.equal(r.body.portalCompleted,undefined);
});
test('completed forms lock and explicit rework only unlocks authorized writers',()=>{
 for(const document of ['INT','FEA','ARD']){
  const state={journeyStep:{INT:0,FEA:1,ARD:3}[document],nativeAgentArtifacts:{[document]:{status:'complete'}}};
  for(const app_role of ['admin','team_leader','team_member','bts','bp_solution','general_user'])assert.equal(nativeDocumentPolicy({id:1,app_role},{requester_id:1},state,true,document).canEdit,false);
 }
 assert.equal(nativeDocumentPolicy({id:1,app_role:'team_leader'},{},{journeyStep:4,nativeAgentArtifacts:{ARD:{status:'complete'}},workflowApprovals:{G2:{owner:{decision:'REWORK'}}}},false,'ARD').canEdit,true);
});
