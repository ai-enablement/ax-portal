import test from 'node:test';
import assert from 'node:assert/strict';
import {manageD2BAccess,leaderDashboardScope} from '../server/leader-dashboard-access.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';

test('D2B management rejects unauthorized roles before querying the database',async()=>{
 const client={query:()=>{throw Error('must not query');}};
 for(const app_role of ['general_user','bts','bp_solution'])assert.equal((await manageD2BAccess(client,{is_active:true,app_role},'GET')).status,403);
 for(const method of ['POST','PATCH','DELETE'])assert.equal((await manageD2BAccess(client,{is_active:true,app_role:'team_member'},method,'1',{})).status,403);
 assert.equal((await manageD2BAccess(client,{is_active:false,app_role:'admin'},'GET')).status,403);
});
test('D2B management validates email and name before writes',async()=>{
 const client={query:()=>{throw Error('must not query');}},actor={is_active:true,app_role:'admin'};
 for(const email of ['', 'bad', 'a@@example.com', 'a@b'])assert.equal((await manageD2BAccess(client,actor,'POST',undefined,{displayName:'Test',email})).status,400);
 assert.equal((await manageD2BAccess(client,actor,'POST',undefined,{displayName:'',email:'valid@example.com'})).status,400);
});
test('D2B database CRUD, access changes and audit are atomic (rolled back)',{skip:process.env.PORTAL_D2B_DB_TEST!=='1'},async()=>{
 const pool=getPool(),client=await pool.connect();
 try{
  await client.query('begin');
  const actor=(await client.query("select id,is_active,app_role from agent_portal.users where is_active and app_role='admin' limit 1")).rows[0];assert.ok(actor);
  const email=`d2b-test-${Date.now()}@example.invalid`,renamed=email.replace('d2b-test-','d2b-renamed-');
  assert.equal((await manageD2BAccess(client,actor,'POST',undefined,{displayName:'D2B test',email:email.toUpperCase()})).status,201);
  assert.equal(await leaderDashboardScope({email},client),'D2B');
  assert.equal((await manageD2BAccess(client,actor,'POST',undefined,{displayName:'Duplicate',email})).status,409);
  let entry=(await client.query('select * from agent_portal.d2b_dashboard_access where email=$1',[email])).rows[0];
  assert.equal((await manageD2BAccess(client,actor,'PATCH',String(entry.id),{displayName:'Updated',email:renamed,revision:0})).status,409);
  assert.equal((await manageD2BAccess(client,{...actor,app_role:'team_leader'},'PATCH',String(entry.id),{displayName:'Updated',email:renamed,revision:entry.revision})).status,200);
  assert.equal(await leaderDashboardScope({email},client),'all');assert.equal(await leaderDashboardScope({email:renamed},client),'D2B');
  entry=(await client.query('select * from agent_portal.d2b_dashboard_access where id=$1',[entry.id])).rows[0];
  assert.equal((await manageD2BAccess(client,actor,'DELETE',String(entry.id),{revision:entry.revision})).status,200);
  assert.equal(await leaderDashboardScope({email:renamed},client),'all');
  assert.equal((await manageD2BAccess(client,actor,'POST',undefined,{displayName:'Re-added',email:renamed})).status,201);
  const listed=await manageD2BAccess(client,{...actor,app_role:'team_member'},'GET');assert.equal(listed.body.canManage,false);
  assert.ok(listed.body.accounts.some(a=>a.email===renamed));
  const audit=await client.query("select action_code from agent_portal.audit_logs where entity_type='d2b_dashboard_access' and entity_id=$1 order by id",[String(entry.id)]);
  assert.deepEqual(audit.rows.map(a=>a.action_code),['D2B_ACCESS_ADDED','D2B_ACCESS_UPDATED','D2B_ACCESS_REMOVED','D2B_ACCESS_ADDED']);
 }finally{await client.query('rollback');client.release();await closePool();}
});
