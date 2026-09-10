import test from 'node:test';
import assert from 'node:assert/strict';
import {mailKey,mailPayload,managedIdentityToken,deliveryOutcome,deliverMail,WORK_MAIL_INTERVAL_MS,scanWorkMail,currentJobPayload} from '../server/work-mail.mjs';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';

const liveEnv={PORTAL_MAIL_MODE:'live',PORTAL_APP_URL:'https://portal.example.com'};
const roleActors=[
 {id:'1',email:'leader@example.com',app_role:'team_leader'},
 {id:'2',email:'admin@example.com',app_role:'admin'},
 {id:'11',email:'requester@example.com',app_role:'general_user'},
 {id:'12',email:'owner@example.com',app_role:'general_user'},
 {id:'13',email:'second-requester@example.com',app_role:'general_user'},
 {id:'21',email:'developer@example.com',app_role:'team_member'},
 {id:'22',email:'second-developer@example.com',app_role:'team_member'},
];
const roleProjects=[
 {no:'2026-033',name:'Calendar',journeyStep:2,historicalImport:true,historicalImportFinalizedAt:'2026-09-08',feaCompleted:true,requesterId:'11',developerIds:['21'],feaAuthor:{id:'2'}},
 {no:'2026-050',name:'Requirements project',journeyStep:3,requesterId:'11',ownerId:'12',developerIds:['21']},
 {no:'2026-051',name:'Approval project',journeyStep:4,requesterId:'11',ownerId:'12',developerIds:['21']},
 {no:'2026-052',name:'FEA project',journeyStep:1,requesterId:'13',developerIds:['22']},
 {no:'2026-053',name:'Design project',journeyStep:5,deliveryPhase:'design',requesterId:'13',developerIds:['22']},
].map(p=>({...p,source:'database'}));

test('live mail isolates each recipient, project, role, title, body and project link',async()=>{
 const queued=[];
 const client={query:async(sql,args)=>{
  if(sql.startsWith('select id from agent_portal.work_mail_control'))return {rowCount:1};
  if(sql.startsWith('select id,email'))return {rows:roleActors};
  if(sql.startsWith('select active_keys'))return {rows:[{active_keys:[]}]};
  if(sql.startsWith('insert into agent_portal.work_mail_outbox'))queued.push({actorId:args[1],payload:JSON.parse(args[3])});
  return {rows:[],rowCount:0};
 }};
 await scanWorkMail(client,liveEnv,async()=>({status:200,body:{projects:roleProjects}}));
 const expected=[['1','2026-033','G1 착수 판정'],['1','2026-051','G2 승인 요청'],['11','2026-051','G2 승인 요청'],['12','2026-051','G2 승인 요청'],['1','2026-052','타당성 평가서 작성'],['2','2026-052','타당성 평가서 작성'],['1','2026-050','ARD 요구 정의 작성'],['2','2026-050','ARD 요구 정의 작성'],['22','2026-053','설계 작성 완료']];
 assert.equal(queued.length,expected.length);
 for(const [actorId,no,title] of expected){
  const actor=roleActors.find(a=>a.id===actorId),project=roleProjects.find(p=>p.no===no);
  const match=queued.find(q=>q.actorId===actorId&&q.payload.subject.includes(no));
  assert.ok(match,`${actorId}/${no}`);
  assert.equal(match.payload.recipient,actor.email);
  assert.equal(match.payload.subject,`[AX Portal] ${title} · ${project.name} (${no})`);
  assert.ok(match.payload.htmlBody.includes(project.name));
  assert.ok(match.payload.htmlBody.includes(`workProject=${no}`));
  for(const other of roleProjects.filter(p=>p.no!==no))assert.ok(!match.payload.htmlBody.includes(other.no));
  if(no!=='2026-052')assert.ok(!match.payload.htmlBody.includes('FEA 작성을 완료'));
 }
 assert.ok(queued.find(q=>q.actorId==='1'&&q.payload.subject.includes('2026-051')).payload.htmlBody.includes('담당 역할: AI 활성화팀장'));
 assert.ok(queued.find(q=>q.actorId==='12').payload.htmlBody.includes('담당 역할: Project Owner'));
 assert.ok(queued.find(q=>q.actorId==='1'&&q.payload.subject.includes('2026-050')).payload.htmlBody.includes('AI Agent와 함께 요구 정의서를 작성'));
});

test('before delivery stale content and recipient are rebuilt from the current assigned task',async()=>{
 const actor=roleActors[0];
 const notification=buildWorkNotifications(roleProjects,{id:actor.id,appRole:actor.app_role})[0];
 const job={id:'job-1',actor_id:actor.id,notification_key:mailKey(notification),payload:{recipient:'wrong@example.com',htmlBody:'wrong project FEA',subject:'wrong'}};
 const client={query:async()=>({rows:[actor]})};
 const load=async()=>({status:200,body:{projects:roleProjects}});
 const payload=await currentJobPayload(client,job,liveEnv,load);
 assert.equal(payload.recipient,'leader@example.com');
 assert.ok(payload.subject.includes('G1 착수 판정'));
 assert.ok(payload.htmlBody.includes('Calendar (2026-033)'));
 assert.ok(!payload.htmlBody.includes('wrong'));
 const reassigned={...roleActors[6],email:'current-developer@example.com'};
 const doc=buildWorkNotifications(roleProjects,{id:'22',appRole:'team_member'})[0];
 assert.equal((await currentJobPayload({query:async()=>({rows:[reassigned]})},{...job,actor_id:'22',notification_key:mailKey(doc)},liveEnv,load)).recipient,reassigned.email);
});

test('completed, reassigned, inactive and inaccessible tasks never deliver the old payload',async()=>{
 const actor=roleActors[6];
 const task=buildWorkNotifications(roleProjects,{id:actor.id,appRole:actor.app_role})[0];
 const job={id:'job-1',actor_id:actor.id,notification_key:mailKey(task),payload:{subject:'old'}};
 const client={query:async()=>({rows:[actor]})};
 for(const projects of [[],roleProjects.map(p=>({...p,developerIds:['21']})),roleProjects.map(p=>({...p,journeyStep:9}))]){
  assert.equal(await currentJobPayload(client,job,liveEnv,async()=>({status:200,body:{projects}})),null);
 }
 assert.equal(await currentJobPayload({query:async()=>({rows:[]})},job,liveEnv),null);
 await assert.rejects(currentJobPayload(client,job,liveEnv,async()=>({status:503})),/MAIL_PROJECT_LOOKUP_FAILED/);
});

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
  assert.deepEqual(queued.map(p=>p.recipient),['admin@example.com']);
  assert.deepEqual(cancelled.find(([id])=>id==='11'),['11',[]]);
 }
});
test('automatic work mail checks run hourly',()=>{
 assert.equal(WORK_MAIL_INTERVAL_MS,3600000);
});

test('pending external mail is cancelled before historical finalization, and resumes only after finalization',async()=>{
 const actor={id:'21',email:'external@example.com',app_role:'bts'};
 const project={no:'2026-070',name:'Import',source:'database',journeyStep:5,deliveryPhase:'design',developerIds:['21'],historicalImport:true};
 const completed={...project,historicalImportFinalizedAt:'2026-09-09'};
 const action=buildWorkNotifications([completed],{id:actor.id,appRole:actor.app_role})[0];
 const job={id:'j',actor_id:actor.id,notification_key:mailKey(action),payload:{recipient:actor.email}};
 const client={query:async()=>({rows:[actor]})};
 assert.equal(await currentJobPayload(client,job,liveEnv,async()=>({status:200,body:{projects:[project]}})),null);
 assert.equal((await currentJobPayload(client,job,liveEnv,async()=>({status:200,body:{projects:[completed]}}))).recipient,actor.email);
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
