import test from 'node:test';
import assert from 'node:assert/strict';
import {mailKey,mailPayload,managedIdentityToken,deliveryOutcome,deliverMail,WORK_MAIL_INTERVAL_MS,scanWorkMail} from '../server/work-mail.mjs';

test('live scan queues the actual FEA assignee and cancels obsolete admin work without sending mail',async()=>{
 const actors=[{id:'1',email:'admin@example.com',app_role:'admin'},{id:'21',email:'dev@example.com',app_role:'team_member'},{id:'11',email:'requester@example.com',app_role:'general_user'}];
 for(const historicalImport of [false,true]){
  const queued=[],cancelled=[];
  const client={query:async(sql,args)=>{
   if(sql.startsWith('select id from agent_portal.work_mail_control'))return {rowCount:1};
   if(sql.startsWith('select id,email'))return {rows:actors};
   if(sql.startsWith('select active_keys'))return {rows:[{active_keys:[]}]};
   if(sql.startsWith('insert into agent_portal.work_mail_outbox'))queued.push(JSON.parse(args[3]));
   if(sql.includes("status='cancelled'")&&sql.includes('notification_key=any'))cancelled.push(args);
   return {rows:[],rowCount:0};
  }};
  const project={no:'2026-033',name:'Test',source:'database',journeyStep:1,requesterId:'11',developerIds:['21'],historicalImport,historicalImportFinalizedAt:'2026-09-08',feaAuthor:{id:historicalImport?'1':'11'}};
  await scanWorkMail(client,{PORTAL_MAIL_MODE:'live',PORTAL_APP_URL:'https://portal.example.com'},async()=>({body:{projects:[project]}}));
  assert.deepEqual(queued.map(p=>p.recipient),['requester@example.com']);
  assert.deepEqual(cancelled.find(([id])=>id==='1'),['1',[]]);
 }
});
test('automatic work mail checks run hourly',()=>{
 assert.equal(WORK_MAIL_INTERVAL_MS,3600000);
});
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
