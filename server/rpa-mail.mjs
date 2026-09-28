import {getPool,withTransaction} from './db/pool.mjs';
import {deliverMail} from './work-mail.mjs';
import {mailAppOrigin} from './mail-config.mjs';
import {escapeHtml} from '../shared/notification-content.mjs';
const aggregate=jobs=>['uncertain','failed','sending','pending'].find(s=>jobs.some(j=>j.status===s))||'sent';
export async function runRpaMailCycle(env=process.env,send=deliverMail){
 if(!['live','test'].includes(env.PORTAL_MAIL_MODE))return;
 const client=await getPool().connect();let locked=false;
 try{
  locked=(await client.query('select pg_try_advisory_lock(8291710) as locked')).rows[0].locked;if(!locked)return;
  const rows=(await client.query("select id,payload from agent_portal.rpa_requests where exists(select 1 from jsonb_array_elements(coalesce(payload->'completionMailJobs','[]'::jsonb) || coalesce(payload->'stageMailJobs','[]'::jsonb)) job where job->>'status' in ('pending','sending')) order by id limit 20")).rows;
  for(const row of rows)for(const key of ['stageMailJobs','completionMailJobs'])for(const candidate of row.payload[key]||[]){
   if(!['pending','sending'].includes(candidate.status))continue;
   const statusKey=key==='stageMailJobs'?'stageMailStatus':'mailStatus',prefix=key==='stageMailJobs'?'단계 알림':'완료';
   // Re-read under a short row lock; never overwrite newer stage/history data.
   const mutate=async fn=>withTransaction(async c=>{
    const fresh=(await c.query('select payload from agent_portal.rpa_requests where id=$1 for update',[row.id])).rows[0];
    if(!fresh)return null;
    const payload=fresh.payload,jobs=payload[key]||[],job=jobs.find(j=>j.id===candidate.id);if(!job)return null;
    const result=fn(job,payload);if(!result)return null;
    payload[statusKey]=aggregate(jobs);
    if(result.event)payload.history=[...(payload.history||[]),result.event];
    await c.query('update agent_portal.rpa_requests set payload=$2 where id=$1',[row.id,payload]);
    return result.send?{...job.mail}:null;
   });
   const event=(status,reason='')=>({kind:'mail',label:prefix+' 메일 '+({sent:'발송 완료',pending:'재시도 대기',cancelled:'발송 취소',uncertain:'발송 확인 필요',failed:'발송 실패'}[status]||status),at:new Date().toISOString(),actor:'메일 시스템',reason,changes:{mailStatus:{before:'sending',after:status}}});
   const mail=await mutate((job,payload)=>{
    if(job.status==='sending'){job.status='uncertain';return {event:event('uncertain','중단된 발송은 중복 방지를 위해 자동 재발송하지 않습니다.')};}
    if(job.status!=='pending')return null;
    if(key==='stageMailJobs'&&job.token!==payload.workflowMailToken){job.status='cancelled';return {event:event('cancelled','이미 다음 단계로 이동했습니다.')};}
    if(Date.parse(job.availableAt||'1970-01-01')>Date.now())return null;
    job.status='sending';job.attempts++;return {send:true};
   });
   if(!mail)continue;
   let outcome;
   try{
    const recipient=env.PORTAL_MAIL_MODE==='test'?env.PORTAL_MAIL_TEST_RECIPIENT:mail.recipient;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))throw Error('Invalid recipient');
    const origin=env.PORTAL_APP_URL||env.NEXT_PUBLIC_APP_URL?mailAppOrigin(env):null;
    const htmlBody=mail.htmlBody+(origin?`<p><a href="${escapeHtml(origin)}/?rpaRequest=${encodeURIComponent(mail.requestId||row.id)}">${escapeHtml(mail.cta||'해당 요청 확인')} →</a></p><p>로그인 후 해당 요청의 진행 상황으로 연결됩니다. 접근 권한이 있는 계정으로 로그인해 주세요.</p>`:'');
    outcome=await send({...mail,recipient,htmlBody},env);
   }catch{outcome={status:'failed',code:'MAIL_CONFIGURATION_OR_AUTH_FAILED'};}
   await mutate(job=>{
    job.status=outcome.status;job.code=outcome.code;
    if(job.status==='pending'){if(job.attempts>=5)job.status='failed';else job.availableAt=new Date(Date.now()+60000*2**job.attempts).toISOString();}
    return {event:event(job.status,env.PORTAL_MAIL_MODE==='test'?'테스트 수신자 발송':mail.subject)};
   });
  }
 }finally{try{if(locked)await client.query('select pg_advisory_unlock(8291710)');}finally{client.release();}}
}
let started=false;
export function startRpaMailWorker(){
 if(started||!['live','test'].includes(process.env.PORTAL_MAIL_MODE))return;started=true;
 let busy=false;const tick=async()=>{if(busy)return;busy=true;try{await runRpaMailCycle();}catch{console.error('RPA mail cycle failed');}finally{busy=false;}};
 const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();
}
