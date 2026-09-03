import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {isContactEmail, normalizeContactEmail} from '../shared/project-contacts.mjs';
import {registrationContacts, resolveContactUser} from '../server/project-contacts.mjs';

const actor = {id: 1, app_role: 'admin', email: 'admin@example.com'};
const state = {requester: '요구자 · 부서 · requester@example.com', projectOwner: '현업 오너', projectOwnerEmail: ' Owner@Example.com '};

test('contact validation accepts one email and rejects malformed or multiple addresses', () => {
  assert.equal(normalizeContactEmail(' A@Example.COM '), 'a@example.com');
  for (const email of ['a@example.com', 'a+b@example.co.kr']) assert.equal(isContactEmail(email), true);
  for (const email of ['', 'a@', 'a b@example.com', 'a@example.com,b@example.com', 'a@example.com\nBcc:b@example.com', 'a@-example.com']) assert.equal(isContactEmail(email), false);
});

test('other owner has a separate validated address; same requester reuses requester contact', () => {
  assert.deepEqual(registrationContacts(state, actor), {requesterEmail:'requester@example.com',projectOwnerEmail:'owner@example.com'});
  assert.equal(registrationContacts({...state, ownerMode:'SELF'}, actor).projectOwnerEmail, 'requester@example.com');
});

test('general user requester identity is taken from authenticated account, never submitted email', () => {
  const result = registrationContacts({...state,ownerMode:'SELF',requesterEmail:'spoof@example.com'}, {...actor,app_role:'general_user'});
  assert.equal(result.requesterEmail, actor.email);
  assert.equal(result.projectOwnerEmail, actor.email);
});

test('new submissions require owner email; historical records can remain incomplete without using admin email', () => {
  assert.throws(() => registrationContacts({...state,projectOwnerEmail:''}, actor), error => error.status === 400);
  assert.equal(registrationContacts({...state,projectOwnerEmail:'',historicalImport:true},actor).projectOwnerEmail, '');
  assert.throws(() => registrationContacts({...state,projectOwnerEmail:'bad',historicalImport:true},actor), error => error.status === 400);
});

test('name-only historical owner is never resolved to the registrant', async () => {
  assert.equal(await resolveContactUser({query:()=>{throw new Error('No query expected');}}, '오너', '', 1), null);
});

test('contact resolution parameterizes email and does not reactivate or rename existing accounts', async () => {
  let captured;
  const id = await resolveContactUser({query:async(sql,params)=>{captured={sql,params};return {rows:[{id:2}]};}}, '실제 오너 · 현업', 'OWNER@example.com', 1);
  assert.equal(id,2);
  assert.deepEqual(captured.params,[1,'owner@example.com','실제 오너']);
  assert.match(captured.sql,/where users.is_active=true/);
  assert.equal(captured.sql.match(/do update set ([\s\S]*?)\s+where/)[1], 'email=users.email');
  await assert.rejects(resolveContactUser({query:async()=>({rows:[]})},'오너','inactive@example.com',1), error=>error.status===409);
});

test('wizard persists contact fields in both modes and project list returns owner email', async () => {
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  const server=await readFile(new URL('../server/database-api.mjs',import.meta.url),'utf8');
  assert.equal((page.match(/email=\{resolvedOwnerEmail\}/g)||[]).length,2);
  assert.ok(page.includes('projectOwnerEmail: registration?.projectOwnerEmail'));
  assert.ok(page.includes('contactsValid &&'));
  assert.ok(server.includes('Object.assign(submittedState, contacts)'));
  assert.ok(server.includes('owner_user.email as "ownerEmail"'));
  assert.ok(server.includes('if (!userId) continue;'));
  assert.ok(server.includes('["projectOwnerEmail", "requesterEmail", "ownerMode"].includes(key)'));
});
