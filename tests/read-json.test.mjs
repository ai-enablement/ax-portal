import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readJson} from '../shared/read-json.mjs';
const ok=data=>new Response(JSON.stringify(data));
test('transient read failures retry and always use GET/no-store',async()=>{
 let calls=0;
 const result=await readJson('/read',{delayMs:0,fetcher:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');
  return ++calls<3?new Response('',{status:503}):ok({value:1});
 }});
 assert.deepEqual(result,{value:1});assert.equal(calls,3);
});
test('authorization failures never retry',async()=>{
 for(const status of [401,403]){let calls=0;await assert.rejects(readJson('/read',{delayMs:0,fetcher:async()=>{calls++;return new Response('',{status});}}),e=>e.status===status);assert.equal(calls,1);}
});
test('timeouts are bounded and expose a readable error',async()=>{
 let calls=0;
 await assert.rejects(readJson('/read',{timeoutMs:5,delayMs:0,fetcher:async(_,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));}}),/조회 시간이 초과/);
 assert.equal(calls,3);
});
test('external cancellation stops retries',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(readJson('/read',{signal:controller.signal,fetcher:async()=>{calls++;controller.abort();throw new TypeError('network');}}),{name:'AbortError'});
 assert.equal(calls,1);
});
test('one resource failure does not delay another successful result',async()=>{
 let project;
 const broken=readJson('/gallery',{attempts:1,fetcher:async()=>new Response('',{status:503})});
 const good=readJson('/projects',{fetcher:async()=>ok({projects:[1]})}).then(data=>{project=data;});
 const results=await Promise.allSettled([broken,good]);
 assert.equal(results[0].status,'rejected');assert.deepEqual(project,{projects:[1]});
});
test('page loads resources independently and retries only selected resource',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const block=page.slice(page.indexOf('async function loadDatabaseData()'),page.indexOf('}, [identityStatus, role, loadRetries.projects])'));
 assert.ok(block.includes("readJson('/api/database/projects'"));
 assert.ok(!block.includes('/health'));assert.ok(!block.includes('/gallery'));assert.ok(!block.includes('Promise.all'));
 assert.ok(page.includes('databaseStatus={galleryStatus}'));
 assert.ok(page.includes('[identityStatus,role,loadRetries.gallery]'));
 assert.ok(page.includes('[identityStatus,loadRetries.health]'));
});
