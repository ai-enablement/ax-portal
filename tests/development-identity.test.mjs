import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePortalUser} from '../server/database-api.mjs';
import {listGovernanceProjectPeople} from '../server/governance-project-people.mjs';
test('authenticated actor retains organization scope for the governance registry',async()=>{
 for(const source of ['development','entra']){
  const calls=[];
  const client={query:async(sql,args)=>{
   calls.push({sql,args});
   // Model the SQL projection rather than returning an unrealistically complete actor.
   if(sql.includes('from agent_portal.users')||sql.startsWith('update agent_portal.users')){
    const scope=sql.startsWith('update')?sql.split('returning')[1]:sql.split('from')[0];
    return {rows:[{id:7,email:'admin@company.com',display_name:'Admin',app_role:'admin',is_active:true,...(scope.includes('organization_id')?{organization_id:42}:{})}]};
   }
   throw new Error('unexpected identity query');
  }};
  const actor=await ensurePortalUser(client,{email:'admin@company.com',source});
  assert.equal(actor.organization_id,42);
  const registry={query:async(sql,args)=>{assert.equal(args[0],42);return {rows:[]};}};
  assert.equal((await listGovernanceProjectPeople(registry,actor)).status,200);
  assert.ok(calls.length>0);
 }
});
test('local preview resolves existing email without writing shared development identity',async()=>{
 const calls=[];
 const actor={id:'7',email:'test@example.com',app_role:'admin',is_active:true};
 const client={query:async(sql,args)=>{calls.push({sql,args});return {rows:[actor]};}};
 assert.equal(await ensurePortalUser(client,{email:actor.email,objectId:'development-user',source:'development'}),actor);
 assert.equal(calls.length,1);assert.match(calls[0].sql,/lower\(email\)=lower\(\$1\)/);
 assert.doesNotMatch(calls[0].sql,/update|insert|ms_account_id/i);
 assert.deepEqual(calls[0].args,[actor.email]);
});
test('unregistered local preview identity is not inserted into production users',async()=>{
 let count=0;const client={query:async(sql)=>{count++;assert.match(sql,/^select/);return {rows:[]};}};
 assert.equal(await ensurePortalUser(client,{email:'missing@example.com',source:'development'}),null);assert.equal(count,1);
});
