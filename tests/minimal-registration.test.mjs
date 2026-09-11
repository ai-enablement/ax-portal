import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationContacts} from '../server/project-contacts.mjs';
import {seedNativeProject} from '../server/native-agent.mjs';

for (const app_role of ['general_user','team_member','team_leader','admin','bts','bp_solution']) {
  test(`minimal registration uses authenticated requester and explicitly selected Owner: ${app_role}`, () => {
    const result = registrationContacts({registrationEntry:'INT_AGENT',requesterEmail:'other@example.com',ownerMode:'SELF',projectOwnerEmail:'other@example.com'}, {app_role,email:'logged-in@example.com'});
    assert.deepEqual(result,{requesterEmail:'logged-in@example.com',projectOwnerEmail:'logged-in@example.com'});
    assert.deepEqual(registrationContacts({registrationEntry:'INT_AGENT',ownerMode:'OTHER',projectOwner:'오너',projectOwnerEmail:'owner@example.com'},{app_role,email:'logged-in@example.com'}),{requesterEmail:'logged-in@example.com',projectOwnerEmail:'owner@example.com'});
    assert.throws(()=>registrationContacts({registrationEntry:'INT_AGENT',ownerMode:'OTHER',projectOwnerEmail:'owner@example.com'},{app_role,email:'logged-in@example.com'}),/이름/);
    assert.throws(()=>registrationContacts({registrationEntry:'INT_AGENT',ownerMode:'OTHER',projectOwner:'오너',projectOwnerEmail:'invalid'},{app_role,email:'logged-in@example.com'}),/이메일/);
  });
}
test('minimal registration requires a valid signed-in email', () => {
  assert.throws(()=>registrationContacts({registrationEntry:'INT_AGENT'}, {app_role:'admin',email:''}));
});
test('historical import retains its explicit requester and Owner', () => {
  assert.deepEqual(registrationContacts({historicalImport:true,registrationEntry:'INT_AGENT',requesterEmail:'requester@example.com',projectOwnerEmail:'owner@example.com'}, {app_role:'admin',email:'admin@example.com'}),{requesterEmail:'requester@example.com',projectOwnerEmail:'owner@example.com'});
});
test('native INT starts with project name and requester, not invented business content', () => {
  const project=seedNativeProject('2026-999',{name:'일정 Agent',requesterName:'테스트',intakeAnswers:[],intakeDetails:{}});
  assert.equal(project.agent_name,'일정 Agent');
  assert.equal(project.int_data.requester_name,'테스트');
  assert.equal(project.int_data.problem,'');
});
