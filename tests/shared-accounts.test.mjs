import test from 'node:test';
import assert from 'node:assert/strict';
import {isProjectDeveloper,projectActorIds} from '../shared/project-actors.mjs';
import {withSharedUsers,sharedAccountFields} from '../server/shared-accounts.mjs';
test('shared account acts only for linked IDs and retains audit identity',async()=>{
 const actor=await withSharedUsers({query:async()=>({rows:[{id:12},{id:13}]})},{id:10,email:'shared@example.invalid',app_role:'bts',is_active:true});
 assert.deepEqual(projectActorIds(actor),['10','12','13']);
 assert.equal(actor.id,10);assert.match(actor.display_name,/공용 계정/);
 assert.ok(isProjectDeveloper({developerIds:['13']},actor));
 assert.equal(isProjectDeveloper({developerIds:['99']},actor),false);
 assert.equal(isProjectDeveloper({developerIds:['13']},{...actor,is_active:false}),false);
});
test('shared mailbox excludes internal, mixed-role and inactive targets',async()=>{
 for(const app_role of ['admin','general_user','team_member','bts']){
  const c={query:async sql=>({rows:sql.includes('select id,app_role')?[{id:5,app_role,is_active:true}]:[]})};
  await assert.rejects(()=>sharedAccountFields(c,{email:'x@example.invalid',role:'bp_solution'}),e=>e.status===409);
 }
 const c={query:async sql=>({rows:sql.includes('select id,app_role')?[{id:5,app_role:'bp_solution',is_active:true}]:[]})};
 assert.deepEqual(await sharedAccountFields(c,{email:'x@example.invalid',role:'bp_solution'}),{email:null,sharedAccountId:5});
});
