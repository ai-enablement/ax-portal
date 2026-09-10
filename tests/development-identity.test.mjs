import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePortalUser} from '../server/database-api.mjs';
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
