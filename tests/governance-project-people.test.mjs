import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePeopleChange,listGovernanceProjectPeople,saveGovernanceProjectPeople,validateOwnerProfile,saveGovernanceOwnerProfile} from '../server/governance-project-people.mjs';
const actor={id:1,organization_id:1,is_active:true,app_role:'admin',display_name:'Admin'};
const change={ownerIds:['2'],developerIds:['3'],reason:'담당자 변경 요청',version:'2026-10-02T00:00:00.000Z'};
test('direct Owner entry creates new general-user identity and connects it without advancing workflow',async()=>{
 const calls=[];
 const db={async query(sql,args){calls.push({sql,args});
  if(sql.includes('for update of p'))return {rows:[{id:18,updated_at:change.version,state:{journeyStep:2}}]};
  if(sql.includes('where lower(u.email)'))return {rows:[]};
  if(sql.startsWith('select id from agent_portal.teams'))return {rows:[{id:8}]};
  if(sql.startsWith('insert into agent_portal.users'))return {rows:[{id:9}]};
  if(sql.includes('u.id=any'))return {rows:[{id:'9',name:'New Owner',email:'new@company.com',department:'Finance',role:'general_user'}]};
  return {rows:[]};
 }};
 const body={...change,developerIds:[],owners:[{name:'New Owner',email:'new@company.com',department:'Finance'}]};
 const r=await saveGovernanceProjectPeople(db,actor,'2026-018',body);assert.equal(r.status,200);
 assert.ok(calls.some(c=>c.sql.includes("'general_user',true")));
 assert.deepEqual(calls.find(c=>c.sql.startsWith('update agent_portal.projects')).args,[18,'9']);
 assert.equal(JSON.parse(calls.find(c=>c.sql.includes('raw_answers=jsonb_set')).args[1]).journeyStep,2);
 assert.ok(calls.some(c=>c.sql==='release savepoint owner_input'));
});
test('direct Owner errors roll back partial identities, reject duplicate emails and enforce permissions',async()=>{
 const calls=[],db={async query(sql){calls.push(sql);return {rows:[]};}};
 const owners=[{name:'New',email:'new@company.com',department:''}];
 assert.equal((await saveGovernanceProjectPeople(db,{...actor,app_role:'general_user'},'2026-018',{...change,owners})).status,403);
 assert.equal(calls.length,0);
 assert.equal((await saveGovernanceProjectPeople(db,actor,'2026-018',{...change,owners:[...owners,...owners]})).status,400);
 assert.ok(calls.includes('rollback to savepoint owner_input'));
});
test('typed existing email reuses canonical account, while later validation errors roll back new accounts',async()=>{
 for(const reuse of [true,false]){
  const calls=[],owner={id:'9',name:'New Owner',email:'new@company.com',department:'Finance',role:'general_user'};
  const db={async query(sql,args){calls.push({sql,args});
   if(sql.includes('for update of p'))return {rows:[{id:18,updated_at:change.version,state:{}}]};
   if(sql.includes('where lower(u.email)'))return {rows:reuse?[owner]:[]};
   if(sql.startsWith('select id from agent_portal.users'))return {rows:[{id:9}]};
   if(sql.startsWith('select id from agent_portal.teams'))return {rows:[{id:8}]};
   if(sql.startsWith('insert into agent_portal.users'))return {rows:[{id:9}]};
   if(sql.includes('u.id=any'))return {rows:[owner]};
   return {rows:[]};
  }};
  const result=await saveGovernanceProjectPeople(db,actor,'2026-018',{...change,developerIds:reuse?[]:['3'],owners:[{name:owner.name,email:owner.email,department:owner.department}]});
  assert.equal(result.status,reuse?200:400);
  assert.equal(calls.some(c=>c.sql.startsWith('insert into agent_portal.users')),!reuse);
  assert.equal(calls.some(c=>c.sql==='rollback to savepoint owner_input'),!reuse);
 }
});
test('project editor is rendered immediately after the selected row and Owners use direct fields',async()=>{
 const ui=await readFile(new URL('../app/governance-project-people.jsx',import.meta.url),'utf8');
 assert.match(ui,/draft\?\.no===p.no&&editor\}<\/Fragment>/);
 assert.match(ui,/\['name','Owner 이름'\]/);assert.match(ui,/\['department','Owner 부서'\]/);assert.match(ui,/\['email','Owner 이메일'\]/);
 assert.match(ui,/\+ Owner 추가/);assert.doesNotMatch(ui,/toggle\('ownerIds'/);
});
test('only active admin and leader may read and manage identities',async()=>{
 const db={query(){throw new Error('must not access DB');}};
 for(const role of ['general_user','team_member','bts','bp_solution']){
  assert.equal((await listGovernanceProjectPeople(db,{...actor,app_role:role})).status,403);
  assert.equal((await saveGovernanceProjectPeople(db,{...actor,app_role:role},'2026-018',change)).status,403);
 }
 assert.equal((await listGovernanceProjectPeople(db,{...actor,is_active:false})).status,403);
 assert.equal((await listGovernanceProjectPeople(db,{...actor,organization_id:undefined})).status,403);
});
const profile={name:'Owner Updated',email:'owner.new@company.com',department:'경영기획팀',reason:'연락처 보완',version:change.version};
test('Owner profile rejects invalid fields and unauthorized roles before touching DB',async()=>{
 for(const patch of [{name:''},{email:'wrong'},{department:'x'.repeat(201)},{reason:''},{version:'bad'}])assert.throws(()=>validateOwnerProfile({...profile,...patch}));
 const db={query(){throw new Error('must not query');}};
 assert.equal((await saveGovernanceOwnerProfile(db,{...actor,app_role:'team_member'},'2026-018','2',profile)).status,403);
});
function profileDb({target={},linked=true}={}){
 const calls=[];return {calls,async query(sql,args){calls.push({sql,args});
  if(sql.startsWith('select p.id from'))return {rows:linked?[{id:18}]:[]};
  if(sql.startsWith('select * from agent_portal.users'))return {rows:[{id:2,organization_id:1,is_active:true,app_role:'general_user',updated_at:profile.version,email:'old@company.com',display_name:'Owner Before',...target}]};
  if(sql.startsWith('select id from agent_portal.teams'))return {rows:[{id:7}]};
  if(sql.startsWith('select p.*,coalesce'))return {rows:[{id:18,project_code:'2026-018',owner_id:2,requester_id:2,state:{journeyStep:1,workflowApprovals:{G1:{approved:true}}}},{id:19,project_code:'2026-019',owner_id:2,requester_id:4,state:{journeyStep:9}}]};
  if(sql.startsWith('select u.id::text as id,u.display_name as name,coalesce')&&sql.includes('m.relationship'))return {rows:[{id:'2',name:profile.name,email:profile.email,department:profile.department,relationship:'owner'},{id:'3',name:'Dev',email:'dev@company.com',relationship:'developer'}]};
  return {rows:[]};
 }};
}
test('Owner profile keeps canonical ID and roles, syncs all related live contacts and audits',async()=>{
 const db=profileDb();const result=await saveGovernanceOwnerProfile(db,{...actor,app_role:'team_leader'},'2026-018','2',profile);
 assert.equal(result.status,200);assert.deepEqual(result.body.affectedProjects,['2026-018','2026-019']);
 const userWrite=db.calls.find(c=>c.sql.startsWith('update agent_portal.users'));assert.deepEqual(userWrite.args,[2,profile.name,profile.email,null,7]);assert.ok(!userWrite.sql.includes('app_role='));
 const states=db.calls.filter(c=>c.sql.includes('raw_answers=jsonb_set')).map(c=>JSON.parse(c.args[1]));
 assert.equal(states[0].requesterEmail,profile.email);assert.equal(states[0].projectOwners[0].name,profile.name);assert.equal(states[0].journeyStep,1);assert.deepEqual(states[0].workflowApprovals,{G1:{approved:true}});assert.equal(states[1].journeyStep,9);
 assert.ok(db.calls.some(c=>c.sql.includes('PROJECT_OWNER_PROFILE_CHANGED')));assert.ok(!db.calls.some(c=>/delete from|change_project_stage|update.*documents/.test(c.sql)));
});
test('Owner profile is limited to actual linked owners and current versions, protects privileged login emails',async()=>{
 assert.equal((await saveGovernanceOwnerProfile(profileDb({linked:false}),actor,'2026-018','2',profile)).status,404);
 for(const target of [{updated_at:'2020-01-01'},{app_role:'admin'},{app_role:'team_leader'}]){
  const db=profileDb({target});assert.equal((await saveGovernanceOwnerProfile(db,actor,'2026-018','2',profile)).status,409);assert.ok(!db.calls.some(c=>c.sql.startsWith('update ')));
 }
});
test('Owner profile blocks duplicate login emails and cross-organization identity links',async()=>{
 for(const foreign of [false,true]){
  const db=profileDb(),original=db.query.bind(db);
  db.query=async(sql,args)=>{
   if(sql.startsWith('select id,organization_id'))return {rows:[{id:99,organization_id:foreign?2:1}]};
   if(sql.startsWith('select id,app_role,is_active'))return {rows:[{id:99,app_role:'general_user',is_active:true}]};
   return original(sql,args);
  };
  assert.equal((await saveGovernanceOwnerProfile(db,actor,'2026-018','2',profile)).status,409);
  assert.ok(!db.calls.some(c=>c.sql.startsWith('update ')));
 }
});
test('requires valid unique identities, owner, reason and concurrency token',()=>{
 assert.deepEqual(validatePeopleChange(change),{ownerIds:['2'],developerIds:['3'],reason:change.reason});
 for(const patch of [{ownerIds:[]},{ownerIds:['2','2']},{developerIds:['x']},{reason:''},{version:'bad'}])assert.throws(()=>validatePeopleChange({...change,...patch}));
});
test('stale version does not write',async()=>{
 const db={async query(){return {rows:[{updated_at:'2026-10-01T00:00:00Z'}]};}};
 assert.equal((await saveGovernanceProjectPeople(db,actor,'2026-018',change)).status,409);
});
test('registry read includes canonical owner not just membership labels',async()=>{
 let i=0;const db={async query(){return {rows:i++===0?[{id:'2',name:'Owner',email:'owner@company.com',department:'Finance'}]:[{ownerId:'2',ownerIds:['4'],developerIds:['3']}]};}};
 const result=await listGovernanceProjectPeople(db,{...actor,app_role:'team_leader'});
 assert.deepEqual(result.body.projects[0].ownerIds,['2','4']);assert.equal(result.body.people[0].department,'Finance');
});
test('save synchronizes DB members, primary owner and snapshot without advancing workflow or changing accounts',async()=>{
 const calls=[];const prior={journeyStep:1,workflowApprovals:{G1:{decision:'APPROVED'}}};
 const db={async query(sql,args){calls.push({sql,args});if(sql.includes('for update of p'))return {rows:[{id:18,updated_at:change.version,state:prior}]};if(sql.startsWith('select u.id::text'))return {rows:[{id:'2',name:'Actual Owner',email:'owner@company.com',department:'Finance',role:'general_user'},{id:'3',name:'Actual Developer',email:'developer@company.com',role:'team_member'}]};if(sql.startsWith('select m.user_id'))return {rows:[{id:'1',name:'Old Developer',relationship:'developer'}]};return {rows:[]};}};
 assert.equal((await saveGovernanceProjectPeople(db,actor,'2026-018',change)).status,200);
 const state=JSON.parse(calls.find(c=>c.sql.includes('raw_answers=jsonb_set')).args[1]);
 assert.equal(state.journeyStep,1);assert.deepEqual(state.workflowApprovals,prior.workflowApprovals);assert.equal(state.projectOwners[0].email,'owner@company.com');assert.deepEqual(state.developerIds,['3']);assert.equal(state.developerAssignmentHistory.length,1);
 assert.ok(calls.some(c=>c.sql.includes('PROJECT_PEOPLE_CHANGED')));assert.ok(!calls.some(c=>/update agent_portal.users|change_project_stage/.test(c.sql)));
});
