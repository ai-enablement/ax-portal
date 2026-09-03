import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {resolveContactUser} from '../server/project-contacts.mjs';

test('PostgreSQL owner contact resolves by email and preserves role, name and disabled status', {skip:process.env.PORTAL_TEST_POSTGRES!=='1'}, async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  const adapter={query:(sql,params)=>{
    for(const match of sql.matchAll(/agent_portal\.(\w+)/g)) assert.equal(match[1],'users');
    return client.query(sql.replaceAll('agent_portal.users','pg_temp.users'),params);
  }};
  try {
    await client.query('begin');
    await client.query('create temporary table users (like agent_portal.users including defaults including identity including constraints including indexes) on commit drop');
    const ownerId=await resolveContactUser(adapter,'현업 오너','owner-test@example.invalid',1);
    const again=await resolveContactUser(adapter,'다른 이름','OWNER-TEST@example.invalid',1);
    assert.equal(ownerId,again);
    await client.query("update pg_temp.users set app_role='team_leader' where id=$1",[ownerId]);
    await resolveContactUser(adapter,'바꾸지 않을 이름','owner-test@example.invalid',1);
    let row=(await client.query('select * from pg_temp.users where id=$1',[ownerId])).rows[0];
    assert.equal(row.display_name,'현업 오너');
    assert.equal(row.app_role,'team_leader');
    assert.equal(row.email,'owner-test@example.invalid');
    await client.query('update pg_temp.users set is_active=false where id=$1',[ownerId]);
    await assert.rejects(resolveContactUser(adapter,'현업 오너','owner-test@example.invalid',1),error=>error.status===409);
    row=(await client.query('select is_active from pg_temp.users where id=$1',[ownerId])).rows[0];
    assert.equal(row.is_active,false);
    assert.equal(await resolveContactUser(adapter,'미확인 오너','',1),null);
  } finally {
    await client.query('rollback').catch(()=>{});
    await client.end();
  }
});
