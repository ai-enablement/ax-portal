import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withIntContacts,finalDocument} from '../shared/final-document.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';
import {handleDatabaseRequest} from '../server/database-api.mjs';

test('final INT keeps original requester and Owner contact details, without duplicate sections',()=>{
 const state={requester:'Requester',requesterEmail:'requester@example.com',projectOwner:'Owner',projectOwnerEmail:'owner@example.com'};
 const result=withIntContacts(finalDocument('# INT 초안','INT','Writer','2026-09-21'),state);
 assert.match(result,/INT 최종본/);
 assert.match(result,/Project Owner \| Owner \| owner@example.com/);
 assert.match(result,/요구자 \| Requester \| requester@example.com/);
 assert.equal(withIntContacts(result,state),result);
});

test('new registration reuses Owner picker and empty dashboard does not render a completed journey',()=>{
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/name="new-project-owner-mode"/);
 assert.match(page,/ownerMode,\s+projectOwnerEmail: resolvedOwnerEmail/);
 assert.match(page,/hasProjects && <WorkflowJourney/);
 assert.match(page,/applicationHistory = isTeam \? applications : applications.filter/);
 assert.match(page,/isLeader && a.applicationId/);
});

test('Gallery lists published or own applications and restricts published edits/deletes to Admin and leader',async()=>{
 Object.assign(process.env,{PGHOST:'localhost',PGDATABASE:'test',PGUSER:'test',PGPASSWORD:'test',PGSSLMODE:'disable'});
 const pool=getPool(),originalQuery=pool.query,originalConnect=pool.connect;
 let role='general_user',listed=false,edited=false,deleted=false;
 const query=async(sql,args)=>{
  if(sql.includes('select id, email')||sql.includes('update agent_portal.users'))return {rows:[{id:'7',email:'user@example.com',app_role:role,is_active:true}]};
  if(sql.includes('for update'))return {rows:[{id:10,submission_status:'published',submitted_by:'9',agent_name:'Agent'}]};
  if(sql.includes('gs.submission_number as')){
   if(sql.includes('order by gs.submitted_at')){
    if(role==='general_user'){assert.match(sql,/where gs.submission_status = 'published' or gs.submitted_by = \$1/);assert.deepEqual(args,['7']);}
    listed=true;
   }
   return {rows:[]};
  }
  if(sql.includes('update agent_portal.gallery_submissions'))edited=true;
  if(sql.includes('delete from agent_portal.gallery_submissions'))deleted=true;
  return {rows:[],rowCount:1};
 };
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const call=(method,pathname,body={})=>handleDatabaseRequest({method,pathname,body,identity:{email:'user@example.com',source:'development'}});
 try{
  assert.equal((await call('GET','/gallery/applications')).status,200);assert.ok(listed);
  for(role of ['general_user','team_member','bts','bp_solution','team_leader','admin']){
   edited=false;deleted=false;
   const allowed=['team_leader','admin'].includes(role);
   assert.equal((await call('PATCH','/gallery/applications/test',{status:'PUBLISHED',description:'Edited'})).status,allowed?200:403,role);
   assert.equal(edited,allowed,role);
   assert.equal((await call('DELETE','/gallery/applications/test')).status,allowed?200:403,role);
   assert.equal(deleted,allowed,role);
  }
 }finally{pool.query=originalQuery;pool.connect=originalConnect;await closePool();}
});
