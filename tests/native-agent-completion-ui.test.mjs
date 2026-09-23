import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {GET} from '../app/api/native-agent/[code]/workspace/route.js';
import {verifyAndComplete,finishNativeDocument,nativeDocumentPolicy} from '../server/native-agent.mjs';

test('embedded workspace has a real measured root and accessible collapsible cards even in read-only mode',async()=>{
 const response=await GET(new Request('http://localhost/api/native-agent/2026-046/workspace?document=FEA',{headers:{'x-ms-client-principal-name':'test@example.com'}}),{params:Promise.resolve({code:'2026-046'})});
 const html=await response.text();
 assert.match(html,/<main class="main app">/);
 for(const [,script] of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
 assert.ok(html.includes("'.card > .card-head,.fsec > h4'"));
 assert.ok(html.includes("'[data-portal-fold],[data-export]"));
 const buttons=[],head={textContent:'에이전트 판정 권고',querySelector:()=>null,appendChild:b=>buttons.push(b)};
 let folded=false,scheduled=0;
 head.parentElement={classList:{toggle(){folded=!folded;return folded;}}};
 const ctx=vm.createContext({root:{querySelectorAll:()=>[head]},document:{createElement:()=>({setAttribute(k,v){this[k]=v;},addEventListener(k,v){this[k]=v;}})},schedule(){scheduled++;}});
 const start=html.indexOf('function addFolds()'),end=html.indexOf('function resize()',start);
 vm.runInContext(html.slice(start,end),ctx);ctx.addFolds();
 assert.equal(buttons[0]['aria-expanded'],'true');
 buttons[0].click();assert.equal(buttons[0]['aria-expanded'],'false');assert.equal(buttons[0].textContent,'펼치기 ▾');
 buttons[0].click();assert.equal(buttons[0]['aria-expanded'],'true');assert.equal(scheduled,2);
});

test('interview buttons do not complete stages; explicit completion cards await portal persistence and lock',async()=>{
 for(const document of ['INT','FEA','ARD']){
  const response=await GET(new Request(`http://localhost/api/native-agent/2026-033/workspace?document=${document}`,{headers:{'x-ms-client-principal-name':'test@example.com'}}),{params:Promise.resolve({code:'2026-033'})});
  const html=await response.text();
  assert.equal((html.match(/post\('\/portal\/finish',/g)||[]).length,3);
  assert.equal((html.match(/post\('\/portal\/verify-complete',/g)||[]).length,0);
  assert.ok(html.includes("'/api/fea/repeat' : '/api/fea/verify'"));
  assert.ok(html.includes('b.disabled = portalReadOnly;'));
  assert.doesNotMatch(html,/window.confirm\(PORTAL_DOC/);
  for(const id of ['btnVerify','btnFeaVerify','btnArdVerify','btnIntComplete','btnArdComplete'])assert.ok(html.includes(`$('#${id}').disabled = portalReadOnly;`));
  const start=html.indexOf('function offerPortalCompletion('),end=html.indexOf("window.addEventListener('DOMContentLoaded'",start),messages=[];
  const ctx=vm.createContext({PORTAL_CODE:'2026-033',portalReadOnly:false,enforceReadOnly(){},location:{origin:'http://localhost'},window:{parent:{postMessage:m=>messages.push(m)}}});
  vm.runInContext(html.slice(start,end),ctx);
  ctx.offerPortalCompletion({done:true});assert.equal(messages.length,0);
  ctx.offerPortalCompletion({portalCompleted:true});assert.equal(ctx.portalReadOnly,true);assert.equal(messages[0].project,'2026-033');
 }
});

test('upstream completion choice is carried into generation, but only portal completion advances the stage',async()=>{
 for(const document of ['INT','FEA','ARD']){
  const calls=[],data={project_no:'2026-046',decision:'Conditional Go',form:{summary:'saved'}};
  const result=await finishNativeDocument(document,data,4,async(path,body,revision)=>{
   calls.push({path,body,revision});return {status:200,revision:revision+1,body:path==='/portal/complete'?{markdown:'final',projectCode:'2026-046'}:{markdown:'draft'}};
  });
  assert.equal(calls[0].body,data);assert.equal(calls[1].path,'/portal/complete');
  assert.equal(result.body.markdown,'final');assert.equal(result.body.portalCompleted,true);
  assert.deepEqual(calls.map(c=>c.revision),[4,5]);
 }
 for(const failure of [{status:400,body:{error:'invalid'}},{status:200,body:{guardrails:{passed:false}}}]){
  let calls=0;const result=await finishNativeDocument('INT',{},0,async()=>{calls++;return failure;});
  assert.equal(calls,1);assert.equal(result.status,400);assert.equal(result.body.portalCompleted,undefined);
 }
 let calls=0;const result=await finishNativeDocument('ARD',{},0,async()=>++calls===1?{status:200,revision:1,body:{}}:{status:400,body:{error:'Required fields missing'}});
 assert.equal(result.status,400);assert.equal(result.body.portalCompleted,undefined);
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
