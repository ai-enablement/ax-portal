import test from 'node:test';
import assert from 'node:assert/strict';
import {scanWorkMail,createWorkMailScheduler,WORK_MAIL_RETRY_MS,runWorkMailCycle,mailKey} from '../server/work-mail.mjs';
import {workerFailure,workerHealth} from '../server/work-mail-health.mjs';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
const env={PORTAL_MAIL_MODE:'live',PORTAL_APP_URL:'https://portal.example.com'};
const actors=[{id:'11',email:'one@example.com',app_role:'general_user'},{id:'12',email:'two@example.com',app_role:'general_user'}];
const projects=actors.map((a,i)=>({no:`2026-00${i+1}`,name:`Project ${i}`,journeyStep:0,requesterId:a.id,source:'database'}));
const load=async()=>({status:200,body:{projects}});
function dbMock(failQueue=false){
 const writes=[],commits=[];let current;
 const client={query:async(sql,args)=>{
  if(sql.startsWith('select id from agent_portal.work_mail_control'))return {rowCount:1};
  if(sql.startsWith('select id,email'))return {rows:actors};
  if(sql.startsWith('select active_keys')){current=args[0];return {rows:[{active_keys:[]}]};}
  if(sql.startsWith('insert into agent_portal.work_mail_outbox')){
   if(failQueue&&current==='11')throw Object.assign(new Error('private detail'),{code:'42501'});
   writes.push(args[1]);
  }
  if(sql==='commit')commits.push(current);
  return {rows:[],rowCount:0};
 }};
 return {client,writes,commits};
}
test('lookup failure is isolated and only failed actors are rescanned',async()=>{
 const db=dbMock();
 const result=await scanWorkMail(db.client,env,async(c,a)=>{if(a.id==='11')throw Object.assign(new Error('secret'),{code:'ETIMEDOUT'});return load();});
 assert.deepEqual(result.failedActorIds,['11']);assert.deepEqual(db.writes,['12']);
 assert.equal(result.failures[0].stage,'project_lookup');
 const calls=[];
 await scanWorkMail(db.client,env,async(c,a)=>{calls.push(a.id);return load();},{actorIds:result.failedActorIds});
 assert.deepEqual(calls,['11']);
});
test('queue failure rolls back that actor and permits the next actor to commit',async()=>{
 const db=dbMock(true),result=await scanWorkMail(db.client,env,load);
 assert.deepEqual(result.failedActorIds,['11']);assert.deepEqual(db.commits,['12']);
 assert.equal(result.failures[0].stage,'queue_write');
});
test('diagnostics do not expose provider messages, SQL, contacts or tokens',()=>{
 const error=Object.assign(new Error('password=secret person@example.com https://private/token'),{code:'untrusted-code'});
 assert.deepEqual(workerFailure(error,'queue_write','11'),{stage:'queue_write',code:'MAIL_INTERNAL_ERROR',actorId:'11'});
 assert.equal(workerFailure({code:'42P18'},'queue_write').code,'42P18');
});
test('scheduler retries failed work only, at 1/5/15 minutes, then stops',async()=>{
 const timers=[],calls=[];
 const scheduler=createWorkMailScheduler(async options=>{calls.push(options);return {failures:[{code:'42501',stage:'queue_write'}],failedActorIds:['11']};},(fn,ms)=>{timers.push({fn,ms});return {}},()=>{});
 await scheduler.tick();
 for(let i=0;i<3;i++)await timers[i].fn();
 assert.deepEqual(timers.map(t=>t.ms),WORK_MAIL_RETRY_MS);
 assert.deepEqual(calls,[{},{actorIds:['11']},{actorIds:['11']},{actorIds:['11']}]);
 assert.equal(workerHealth().nextRetryAt,null);assert.equal(workerHealth().status,'failed');scheduler.stop();
});
test('successful retry clears failure state, ambiguous mail is not scheduled again',async()=>{
 const timers=[];let count=0;
 const scheduler=createWorkMailScheduler(async()=>++count===1?{retryAll:true,failures:[{code:'ETIMEDOUT'}]}:{failures:[],failedActorIds:[]},(fn)=>{timers.push(fn);return {}},()=>{});
 await scheduler.tick();await timers[0]();assert.equal(workerHealth().status,'success');assert.equal(workerHealth().failures.length,0);
 scheduler.stop();
 const uncertain=createWorkMailScheduler(async()=>({failures:[{code:'HTTP_OUTCOME_UNKNOWN'}],failedActorIds:[],retryPending:false}),()=>{assert.fail('ambiguous delivery must not be retried');},()=>{});
 await uncertain.tick();assert.equal(workerHealth().status,'failed');uncertain.stop();
});
test('cycle skips failed actors, continues sending other jobs, and releases a broken lock connection',async()=>{
 const item=buildWorkNotifications(projects,{id:'12',appRole:'general_user'})[0];
 const job={id:'job',actor_id:'12',notification_key:mailKey(item),attempts:1};
 const db=dbMock();let claimed=false,released=false;const query=db.client.query;
 db.client.query=async(sql,args)=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes("set status='sending',attempts")){
   assert.deepEqual(args,[['11']]);if(claimed)return {rowCount:0};claimed=true;return {rowCount:1,rows:[job]};
  }
  if(sql.includes('where id=$1 and is_active=true'))return {rows:[actors[1]]};
  return query(sql,args);
 };
 db.client.release=()=>{released=true;};
 let sent=0;
 const result=await runWorkMailCycle(env,{}, {pool:{connect:async()=>db.client},loadProjects:async(c,a)=>{if(a.id==='11')throw new Error('failure');return load();},deliver:async()=>{sent++;return {status:'sent',code:'HTTP_200'};}});
 assert.equal(sent,1);assert.ok(released);assert.deepEqual(result.failedActorIds,['11']);
 let destroyed=false;
 const broken={query:async sql=>{if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};throw new Error('connection lost');},release:force=>{destroyed=force;}};
 await assert.rejects(runWorkMailCycle(env,{}, {pool:{connect:async()=>broken}}));assert.equal(destroyed,true);
});
