import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadRpaProject,canLinkRpaPic,validateRpaRequest} from '../shared/rpa-policy.mjs';
test('RPA visibility is role or explicitly linked email, never name or department',()=>{
 for(const role of ['admin','team_leader','team_member'])assert.equal(canReadRpaProject({app_role:role,is_active:true,email:'a@example.com'},[]),true);
 for(const role of ['general_user','bts','bp_solution']){
  const actor={app_role:role,is_active:true,email:'a@example.com',display_name:'동명이인'};
  assert.equal(canReadRpaProject(actor,[]),false);
  assert.equal(canReadRpaProject(actor,[{email:'b@example.com'}]),false);
  assert.equal(canReadRpaProject(actor,[{email:'A@example.com'}]),true);
 }
 assert.equal(canReadRpaProject({app_role:'admin',is_active:false},[]),false);
 for(const role of ['admin','team_leader','team_member'])assert.equal(canLinkRpaPic(role),true);
 for(const role of ['general_user','bts','bp_solution',undefined])assert.equal(canLinkRpaPic(role),false);
});
test('request validation does not allow invalid type, email, idempotency key or missing content',()=>{
 const body={projectId:'source:2',title:'오류',description:'현상',type:'오류 수정',priority:'normal',occurredDate:'2026-09-23',notifyEmail:'u@example.com',key:'00112233-4455-6677-8899-aabbccddeeff'};
 assert.equal(validateRpaRequest(body),null);
 for(const [key,value] of [['description',''],['type','admin'],['notifyEmail','bad'],['key','x'],['occurredDate','yesterday'],['title','a'.repeat(201)]])assert.ok(validateRpaRequest({...body,[key]:value}));
});
