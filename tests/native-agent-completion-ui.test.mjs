import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {GET} from '../app/api/native-agent/[code]/workspace/route.js';

test('all original verification buttons share one confirmed completion flow without footer button',async()=>{
 const component=await readFile(new URL('../app/native-agent-workspace.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(component,/<footer|onClick=\{complete\}|<button/);
 for(const [document,generate] of [['INT','/api/intake/finalize'],['FEA','/api/fea/generate'],['ARD','/api/ard/generate']]){
  const response=await GET(new Request(`http://localhost/api/native-agent/2026-033/workspace?document=${document}`,{headers:{'x-ms-client-principal-name':'test@example.com'}}),{params:Promise.resolve({code:'2026-033'})});
  const html=await response.text();
  assert.equal((html.match(/offerPortalCompletion\(r\); toast/g)||[]).length,3);
  const start=html.indexOf('var portalCompleting=false;');
  const end=html.indexOf('/* ═══════════════ 검증',start);
  assert.ok(start>=0&&end>start);
  const calls=[],messages=[];let confirmed=false;
  const context=vm.createContext({PORTAL_DOC:document,PORTAL_CODE:'2026-033',portalReadOnly:false,location:{origin:'http://localhost'},window:{confirm:()=>confirmed,_showLoading(){},_hideLoading(){},parent:{postMessage:m=>messages.push(m)}},post:async path=>{calls.push(path);return {};},toast(){}});
  vm.runInContext(html.slice(start,end),context);
  context.offerPortalCompletion({done:false});
  context.offerPortalCompletion({done:true}); // cancelled
  assert.equal(calls.length,0);
  confirmed=true;
  context.offerPortalCompletion({done:true,blocked:true});
  context.offerPortalCompletion({done:true,llm_error:'failed'});
  assert.equal(calls.length,0);
  context.offerPortalCompletion({done:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[generate,'/portal/complete']);
  assert.equal(messages[0].type,'native-agent-completed');
  assert.equal(messages[0].project,'2026-033');
 }
});
