import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getPool,closePool} from '../server/db/pool.mjs';
import {handleDatabaseRequest} from '../server/database-api.mjs';

test('Gallery review checks are required, persisted, restored and not overwritten by published edits',async()=>{
 Object.assign(process.env,{PGHOST:'localhost',PGDATABASE:'test',PGUSER:'test',PGPASSWORD:'test',PGSSLMODE:'disable'});
 const pool=getPool();
 const connect=pool.connect;
 let status='submitted',recorded=null;
 const complete={access:true,dataPolicy:true,safetyNotice:true,operationOwner:true};
 pool.connect=async()=>({release(){},async query(sql,args){
  if(sql.includes('for update'))return {rows:[{id:1,submitted_by:2,submission_status:status}]};
  if(sql.includes('select id, email')||sql.includes('update agent_portal.users'))return {rows:[{id:2,email:'admin@example.com',app_role:'admin',is_active:true}]};
  if(sql.includes('insert into agent_portal.gallery_reviews'))recorded=args.slice(4,8);
  if(sql.includes('gs.submission_number as')){
   assert.match(sql,/jsonb_build_object\('access'/);
   assert.match(sql,/order by gr.id desc limit 1/);
   return {rows:[{id:'test',checks:complete}]};
  }
  return {rows:[]};
 }});
 const call=body=>handleDatabaseRequest({method:'PATCH',pathname:'/gallery/applications/test',identity:{email:'admin@example.com'},body});
 try{
  assert.equal((await call({status:'PUBLISHED'})).status,400);
  for(const key of Object.keys(complete))assert.equal((await call({status:'RECOMMENDED',checks:{...complete,[key]:false}})).status,400);
  const result=await call({status:'PUBLISHED',checks:complete});
  assert.equal(result.status,200);
  assert.deepEqual(recorded,[true,true,true,true]);
  assert.deepEqual(result.body.application.checks,complete);
  status='published';recorded=null;
  assert.equal((await call({status:'PUBLISHED',description:'Edited description'})).status,200);
  assert.equal(recorded,null);
 }finally{pool.connect=connect;await closePool();}
});

test('Gallery UI uses controlled checks and paginated queue',()=>{
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/checked=\{Boolean\(reviewChecks\[key\]\)\}/);
 assert.match(page,/checks: reviewChecks/);
 assert.match(page,/applications.slice\(currentReviewPage \* 10, \(currentReviewPage \+ 1\) \* 10\)/);
 assert.match(page,/reviewQueue.map/);
 assert.match(page,/if \(saved\) notify\(message\)/);
 const css=fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/-webkit-line-clamp: 4/);
 assert.match(css,/\.gallery-page \.agent-stats[^}]+margin-top: auto/);
});
