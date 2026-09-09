import {createHash, randomUUID} from 'node:crypto';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
import {listNotificationProjectsForActor} from './database-api.mjs';
import {getPool} from './db/pool.mjs';
import {mailAppOrigin} from './mail-config.mjs';
import {MailDiagnosticError} from './mail-diagnostics.mjs';
import {updateWorkerHealth,reportWorkerFailure} from './work-mail-health.mjs';

export function mailKey(item) {
  return createHash('sha256').update(JSON.stringify([
    item.projectNo,item.journeyStep,item.deliveryPhase||'',item.title,
    // A different rework reason is a new actionable request.
    item.title.includes('보완 요청') ? item.body : '',
  ])).digest('hex');
}

export function mailPayload(item, recipient, baseUrl, id) {
  const url = new URL(baseUrl);
  if(url.protocol!=='https:' || url.username || url.password) throw new Error('MAIL_APP_URL_INVALID');
  url.pathname='/'; url.search=''; url.hash='';
  url.searchParams.set('workProject',item.projectNo);
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {
    notificationId:id, recipient,
    subject:`[AX Portal] ${item.title} · ${item.projectName} (${item.projectNo})`,
    htmlBody:`<p>${escape(item.projectName)} (${escape(item.projectNo)})</p>${item.recipientRole?`<p>담당 역할: ${escape(item.recipientRole)}</p>`:''}<h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><p><a href="${escape(url.href)}">포털에서 담당 업무 확인</a></p><p>승인과 문서 수정은 포털 로그인 후 진행해 주세요.</p>`,
  };
}

// Rebuild from current assignments, never trust an old queue's recipient or body.
// A changed/finished task is cancelled; a lookup failure must not send stale mail.
export async function currentJobPayload(client, job, env=process.env, loadProjects=listNotificationProjectsForActor) {
  const actor=(await client.query('select id,email,app_role,is_active from agent_portal.users where id=$1 and is_active=true',[job.actor_id])).rows[0];
  if(!actor?.email)return null;
  const result=await loadProjects(client,actor);
  if(result.status!==200)throw new Error('MAIL_PROJECT_LOOKUP_FAILED');
  const items=buildWorkNotifications(result.body.projects,{id:String(actor.id),email:actor.email,appRole:actor.app_role});
  const current=items.find(item=>mailKey(item)===job.notification_key);
  if(!current)return null;
  const recipient=env.PORTAL_MAIL_MODE==='test'?env.PORTAL_MAIL_TEST_RECIPIENT:actor.email;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))throw new Error('MAIL_RECIPIENT_INVALID');
  return mailPayload(current,recipient,mailAppOrigin(env),job.id);
}

export async function managedIdentityToken(env=process.env, fetcher=fetch) {
  if(!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER) throw new MailDiagnosticError('MANAGED_IDENTITY_UNAVAILABLE');
  let url;
  try {url=new URL(env.IDENTITY_ENDPOINT);} catch {throw new MailDiagnosticError('MANAGED_IDENTITY_URL_INVALID');}
  url.searchParams.set('api-version','2019-08-01');
  url.searchParams.set('resource','https://service.flow.microsoft.com/');
  let response;
  try {response=await fetcher(url,{headers:{'X-IDENTITY-HEADER':env.IDENTITY_HEADER},signal:AbortSignal.timeout(10000)});}
  catch {throw new MailDiagnosticError('MANAGED_IDENTITY_REQUEST_FAILED');}
  if(!response.ok) throw new MailDiagnosticError('MANAGED_IDENTITY_TOKEN_FAILED',response.status);
  let token;
  try {token=await response.json();} catch {throw new MailDiagnosticError('MANAGED_IDENTITY_RESPONSE_INVALID',response.status);}
  if(!token?.access_token) throw new MailDiagnosticError('MANAGED_IDENTITY_TOKEN_MISSING',response.status);
  return token.access_token;
}

// No automatic resend on an ambiguous outcome: Outlook may already have sent it.
export function deliveryOutcome(status) {
  if(status===200) return 'sent';
  if(status===429) return 'pending';
  if([400,401,403,404].includes(status)) return 'failed';
  return 'uncertain';
}

export async function deliverMail(payload, env=process.env, fetcher=fetch) {
  let url;
  try {url=new URL(env.POWER_AUTOMATE_MAIL_URL);} catch {throw new MailDiagnosticError('MAIL_FLOW_URL_INVALID');}
  if(url.protocol!=='https:' || !url.hostname.endsWith('.environment.api.powerplatform.com') || url.username || url.password)
    throw new MailDiagnosticError('MAIL_FLOW_URL_INVALID');
  const token=await managedIdentityToken(env,fetcher);
  let response;
  try {
    response=await fetcher(url,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)});
  } catch { return {status:'uncertain',stage:'flow_request',code:'HTTP_OUTCOME_UNKNOWN'}; }
  let status=deliveryOutcome(response.status);
  if(status==='sent') {
    const receipt=await response.json().catch(()=>null);
    if(receipt?.notificationId!==payload.notificationId || receipt?.status!=='sent') status='uncertain';
  }
  return {status,stage:response.status===200?'flow_receipt':'flow_request',code:response.status===200 && status==='uncertain'?'FLOW_RECEIPT_INVALID':`HTTP_${response.status}`,httpStatus:response.status};
}

export async function scanWorkMail(client, env=process.env, loadProjects=listNotificationProjectsForActor, options={}) {
  const initialized=(await client.query('select id from agent_portal.work_mail_control where id=1')).rowCount>0;
  const actors=await client.query('select id,email,app_role,is_active from agent_portal.users where is_active=true');
  const failures=[];
  for(const actor of actors.rows) {
    if(options.actorIds&&!options.actorIds.includes(String(actor.id)))continue;
    let transaction=false,stage='project_lookup';
    try {
    const result=await loadProjects(client,actor);
    if(result.status && result.status!==200)throw new Error('MAIL_PROJECT_LOOKUP_FAILED');
    stage='notification_calculation';
    const items=buildWorkNotifications(result.body.projects,{id:String(actor.id),email:actor.email,appRole:actor.app_role});
    const keys=actor.email?items.map(mailKey):[];
    stage='queue_write';
    await client.query('begin');transaction=true;
      const previous=await client.query('select active_keys from agent_portal.work_mail_state where actor_id=$1 for update',[actor.id]);
      const old=new Set(previous.rows[0]?.active_keys||[]);
      // Baseline each existing user's tasks before enabling any delivery.
      if(initialized && env.PORTAL_MAIL_MODE!=='baseline') {
        for(const item of items) {
          const key=mailKey(item);
          if(!actor.email) continue;
          const recipient=env.PORTAL_MAIL_MODE==='test'?env.PORTAL_MAIL_TEST_RECIPIENT:actor.email;
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||'')) throw new Error('MAIL_RECIPIENT_INVALID');
          const id=randomUUID();
          const payload=mailPayload(item,recipient,mailAppOrigin(env),id);
          // Refresh pending content/contact values before sending, including test/live mode changes.
          await client.query(`update agent_portal.work_mail_outbox set payload=($3::jsonb || jsonb_build_object('notificationId',id::text)) where actor_id=$1 and notification_key=$2 and status='pending'`,[actor.id,key,JSON.stringify(payload)]);
          if(old.has(key)) continue;
          await client.query(`insert into agent_portal.work_mail_outbox(id,actor_id,notification_key,payload,status) values($1,$2,$3,$4::jsonb,'pending')`,[id,actor.id,key,JSON.stringify(payload)]);
        }
      }
      await client.query(`update agent_portal.work_mail_outbox set status='cancelled',updated_at=now() where actor_id=$1 and status='pending' and not(notification_key=any($2::text[]))`,[actor.id,keys]);
      await client.query(`insert into agent_portal.work_mail_state(actor_id,active_keys) values($1,$2::jsonb) on conflict(actor_id) do update set active_keys=excluded.active_keys,updated_at=now()`,[actor.id,JSON.stringify(keys)]);
      await client.query('commit');transaction=false;
    } catch(error) {
      const failure=reportWorkerFailure(error,stage,actor.id);failures.push(failure);
      if(transaction)await client.query('rollback');
    }
  }
  await client.query(`update agent_portal.work_mail_outbox set status='cancelled',updated_at=now() where status='pending' and actor_id not in (select id from agent_portal.users where is_active=true)`);
  // A failed first baseline must not cause historical tasks to be mailed on retry.
  if(initialized||!failures.length)await client.query('insert into agent_portal.work_mail_control(id) values(1) on conflict do nothing');
  return {failures,failedActorIds:failures.map(f=>f.actorId)};
}

export async function runWorkMailCycle(env=process.env, options={}, dependencies={}) {
  if(!['baseline','test','live'].includes(env.PORTAL_MAIL_MODE)) return;
  const client=await (dependencies.pool||getPool()).connect();
  let locked=false;
  try {
    locked=(await client.query('select pg_try_advisory_lock(8291708) as locked')).rows[0].locked;
    if(!locked) return {skipped:true};
    const scan=await scanWorkMail(client,env,dependencies.loadProjects||listNotificationProjectsForActor,options);
    const failures=[...scan.failures];let retryPending=false;
    if(env.PORTAL_MAIL_MODE==='baseline') return {...scan,retryPending:false};
    // A process crash after send cannot safely be retried automatically.
    await client.query(`update agent_portal.work_mail_outbox set status='uncertain',result_code='WORKER_INTERRUPTED',updated_at=now() where status='sending'`);
    for(let i=0;i<10;i++) {
      const claim=await client.query(`update agent_portal.work_mail_outbox set status='sending',attempts=attempts+1,updated_at=now() where id=(select id from agent_portal.work_mail_outbox where status='pending' and available_at<=now() and not(actor_id=any($1::bigint[])) order by available_at limit 1 for update skip locked) returning *`,[scan.failedActorIds]);
      if(!claim.rowCount) break;
      const job=claim.rows[0];
      let outcome,stage='recipient_revalidation';
      try {
        const payload=await currentJobPayload(client,job,env,dependencies.loadProjects||listNotificationProjectsForActor);
        if(!payload)outcome={status:'cancelled',code:'TASK_NO_LONGER_ASSIGNED'};
        else {
          stage='payload_write';
          await client.query('update agent_portal.work_mail_outbox set payload=$2::jsonb where id=$1',[job.id,JSON.stringify(payload)]);
          stage='flow_delivery';
          outcome=await (dependencies.deliver||deliverMail)(payload,env);
        }
      }
      catch(error) {const failure=reportWorkerFailure(error,stage,job.actor_id);failures.push(failure);outcome={status:job.attempts<5?'pending':'failed',code:failure.code};}
      if(outcome.status==='pending' && job.attempts>=5) outcome.status='failed';
      if(outcome.status==='pending')retryPending=true;
      if(['failed','uncertain'].includes(outcome.status))failures.push({stage:outcome.stage||stage,code:outcome.code,actorId:String(job.actor_id)});
      await client.query(`update agent_portal.work_mail_outbox set status=$2,result_code=$3,available_at=now()+($4::integer*interval '1 second'),updated_at=now() where id=$1`,[job.id,outcome.status,outcome.code,Math.min(3600,60*2**job.attempts)]);
    }
    const pending=await client.query("select exists(select 1 from agent_portal.work_mail_outbox where status='pending' and not(actor_id=any($1::bigint[]))) as pending",[scan.failedActorIds]);
    retryPending=retryPending||Boolean(pending.rows[0]?.pending);
    return {failures,failedActorIds:scan.failedActorIds,retryPending};
  } finally {
    try {if(locked)await client.query('select pg_advisory_unlock(8291708)');}
    catch(error){client.release(true);throw error;}
    client.release();
  }
}

export const WORK_MAIL_INTERVAL_MS=60*60*1000;
export const WORK_MAIL_RETRY_MS=[60_000,300_000,900_000];
export function createWorkMailScheduler(run, schedule=setTimeout, cancel=clearTimeout) {
  let busy=false,retryTimer=null,stopped=false;
  const tick=async(options={},attempt=0)=>{
    if(busy||stopped)return;
    if(!attempt&&retryTimer){cancel(retryTimer);retryTimer=null;}
    busy=true;
    updateWorkerHealth({status:'running',startedAt:new Date().toISOString(),nextRetryAt:null,failures:[]});
    let result;
    try {result=await run(options);}
    catch(error){result={failures:[reportWorkerFailure(error,'cycle_database')],retryAll:true};}
    finally{busy=false;}
    if(stopped)return;
    const failures=result?.failures||[];
    const needsRetry=result?.retryAll||result?.failedActorIds?.length||result?.retryPending||result?.skipped;
    updateWorkerHealth({status:result?.skipped?'locked':failures.length?'failed':needsRetry?'retrying':'success',finishedAt:new Date().toISOString(),failures:failures.slice(0,50),...(!failures.length&&!needsRetry?{lastSuccessAt:new Date().toISOString()}:{})});
    if(needsRetry&&attempt<WORK_MAIL_RETRY_MS.length){
      const delay=WORK_MAIL_RETRY_MS[attempt];
      updateWorkerHealth({nextRetryAt:new Date(Date.now()+delay).toISOString()});
      retryTimer=schedule(()=>tick(result?.retryAll?{}:result?.skipped?options:{actorIds:result.failedActorIds||[]},attempt+1),delay);
      retryTimer?.unref?.();
    }
  };
  return {tick,stop(){stopped=true;if(retryTimer)cancel(retryTimer);}};
}
let started=false;
export function startWorkMailWorker() {
  if(started || !['baseline','test','live'].includes(process.env.PORTAL_MAIL_MODE)) return;
  started=true;
  const scheduler=createWorkMailScheduler(options=>runWorkMailCycle(process.env,options));
  const timer=setInterval(()=>void scheduler.tick(),WORK_MAIL_INTERVAL_MS);
  timer.unref();
  void scheduler.tick();
}
