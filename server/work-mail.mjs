import {createHash, randomUUID} from 'node:crypto';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
import {listNotificationProjectsForActor} from './database-api.mjs';
import {getPool} from './db/pool.mjs';
import {mailAppOrigin} from './mail-config.mjs';

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
    subject:`[AX Portal] ${item.title} · ${item.projectNo}`,
    htmlBody:`<p>${escape(item.projectName)} (${escape(item.projectNo)})</p><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><p><a href="${escape(url.href)}">포털에서 담당 업무 확인</a></p><p>승인과 문서 수정은 포털 로그인 후 진행해 주세요.</p>`,
  };
}

export async function managedIdentityToken(env=process.env, fetcher=fetch) {
  if(!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER) throw new Error('MANAGED_IDENTITY_UNAVAILABLE');
  const url=new URL(env.IDENTITY_ENDPOINT);
  url.searchParams.set('api-version','2019-08-01');
  url.searchParams.set('resource','https://service.flow.microsoft.com/');
  const response=await fetcher(url,{headers:{'X-IDENTITY-HEADER':env.IDENTITY_HEADER},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('MANAGED_IDENTITY_TOKEN_FAILED');
  const token=await response.json();
  if(!token.access_token) throw new Error('MANAGED_IDENTITY_TOKEN_MISSING');
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
  const url=new URL(env.POWER_AUTOMATE_MAIL_URL);
  if(url.protocol!=='https:' || !url.hostname.endsWith('.environment.api.powerplatform.com') || url.username || url.password)
    throw new Error('MAIL_FLOW_URL_INVALID');
  const token=await managedIdentityToken(env,fetcher);
  let response;
  try {
    response=await fetcher(url,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)});
  } catch { return {status:'uncertain',code:'HTTP_OUTCOME_UNKNOWN'}; }
  let status=deliveryOutcome(response.status);
  if(status==='sent') {
    const receipt=await response.json().catch(()=>null);
    if(receipt?.notificationId!==payload.notificationId || receipt?.status!=='sent') status='uncertain';
  }
  return {status,code:`HTTP_${response.status}`};
}

export async function scanWorkMail(client, env=process.env, loadProjects=listNotificationProjectsForActor) {
  const initialized=(await client.query('select id from agent_portal.work_mail_control where id=1')).rowCount>0;
  const actors=await client.query('select id,email,app_role,is_active from agent_portal.users where is_active=true');
  for(const actor of actors.rows) {
    const result=await loadProjects(client,actor);
    const items=buildWorkNotifications(result.body.projects,{id:String(actor.id),email:actor.email,appRole:actor.app_role});
    const keys=actor.email?items.map(mailKey):[];
    await client.query('begin');
    try {
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
      await client.query('commit');
    } catch(error) {await client.query('rollback');throw error;}
  }
  await client.query(`update agent_portal.work_mail_outbox set status='cancelled',updated_at=now() where status='pending' and actor_id not in (select id from agent_portal.users where is_active=true)`);
  await client.query('insert into agent_portal.work_mail_control(id) values(1) on conflict do nothing');
}

export async function runWorkMailCycle(env=process.env) {
  if(!['baseline','test','live'].includes(env.PORTAL_MAIL_MODE)) return;
  const client=await getPool().connect();
  let locked=false;
  try {
    locked=(await client.query('select pg_try_advisory_lock(8291708) as locked')).rows[0].locked;
    if(!locked) return;
    await scanWorkMail(client,env);
    if(env.PORTAL_MAIL_MODE==='baseline') return;
    // A process crash after send cannot safely be retried automatically.
    await client.query(`update agent_portal.work_mail_outbox set status='uncertain',result_code='WORKER_INTERRUPTED',updated_at=now() where status='sending'`);
    for(let i=0;i<10;i++) {
      const claim=await client.query(`update agent_portal.work_mail_outbox set status='sending',attempts=attempts+1,updated_at=now() where id=(select id from agent_portal.work_mail_outbox where status='pending' and available_at<=now() order by available_at limit 1 for update skip locked) returning *`);
      if(!claim.rowCount) break;
      const job=claim.rows[0];
      let outcome;
      try {outcome=await deliverMail(job.payload,env);}
      catch {outcome={status:job.attempts<5?'pending':'failed',code:'PRE_SEND_AUTH_OR_CONFIG_FAILED'};}
      if(outcome.status==='pending' && job.attempts>=5) outcome.status='failed';
      await client.query(`update agent_portal.work_mail_outbox set status=$2,result_code=$3,available_at=now()+($4::integer*interval '1 second'),updated_at=now() where id=$1`,[job.id,outcome.status,outcome.code,Math.min(3600,60*2**job.attempts)]);
    }
  } finally {
    if(locked) await client.query('select pg_advisory_unlock(8291708)');
    client.release();
  }
}

export const WORK_MAIL_INTERVAL_MS=60*60*1000;
let started=false;
export function startWorkMailWorker() {
  if(started || !['baseline','test','live'].includes(process.env.PORTAL_MAIL_MODE)) return;
  started=true;
  let busy=false;
  const tick=async()=>{
    if(busy)return;
    busy=true;
    try {await runWorkMailCycle();}
    catch {console.error('Work mail worker failed; inspect DB/configuration. No credentials logged.');}
    finally {busy=false;}
  };
  const timer=setInterval(tick,WORK_MAIL_INTERVAL_MS);
  timer.unref();
  void tick();
}
