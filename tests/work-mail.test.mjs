import test from 'node:test';
import assert from 'node:assert/strict';
import {mailKey,mailPayload,managedIdentityToken,deliveryOutcome,deliverMail} from '../server/work-mail.mjs';
const item={projectNo:'2026-001',projectName:'<script>x</script>',journeyStep:4,title:'G2 승인 요청',body:'확인 & 승인'};
test('mail keys are stable, distinguish recipients externally and rework reasons',()=>{
 assert.equal(mailKey(item),mailKey({...item,body:'상태 표시 변경'}));
 assert.notEqual(mailKey(item),mailKey({...item,journeyStep:6}));
 assert.notEqual(mailKey({...item,title:'G2 보완 요청 반영',body:'a'}),mailKey({...item,title:'G2 보완 요청 반영',body:'b'}));
});
test('mail escapes HTML and links to authenticated project only',()=>{
 const p=mailPayload(item,'self@example.com','https://portal.example.com/','n1');
 assert.ok(!p.htmlBody.includes('<script>'));assert.ok(p.htmlBody.includes('&amp;'));
 assert.ok(p.htmlBody.includes('workProject=2026-001'));assert.equal(p.recipient,'self@example.com');
 assert.throws(()=>mailPayload(item,'x','http://portal.example.com','n1'));
});
test('ambiguous sends are not retried automatically',()=>{
 assert.equal(deliveryOutcome(200),'sent');assert.equal(deliveryOutcome(202),'uncertain');
 assert.equal(deliveryOutcome(500),'uncertain');assert.equal(deliveryOutcome(429),'pending');
 assert.equal(deliveryOutcome(403),'failed');
});
test('managed identity requests exact Flow audience with bounded timeout',async()=>{
 const token=await managedIdentityToken({IDENTITY_ENDPOINT:'http://localhost/token',IDENTITY_HEADER:'secret'},async(url,options)=>{
  assert.equal(url.searchParams.get('resource'),'https://service.flow.microsoft.com/');
  assert.equal(options.headers['X-IDENTITY-HEADER'],'secret');assert.ok(options.signal);
  return {ok:true,json:async()=>({access_token:'token'})};
 });assert.equal(token,'token');
});
test('flow must acknowledge matching notification ID after Outlook succeeds',async()=>{
 const env={IDENTITY_ENDPOINT:'http://localhost/token',IDENTITY_HEADER:'secret',POWER_AUTOMATE_MAIL_URL:'https://test.environment.api.powerplatform.com/flow'};
 for(const [receipt,expected] of [[{status:'sent',notificationId:'n1'},'sent'],[{status:'sent',notificationId:'other'},'uncertain']]){
  const result=await deliverMail({notificationId:'n1'},env,async(url,opts)=>url.hostname==='localhost'?{ok:true,json:async()=>({access_token:'token'})}:{status:200,json:async()=>receipt});
  assert.equal(result.status,expected);
 }
});
