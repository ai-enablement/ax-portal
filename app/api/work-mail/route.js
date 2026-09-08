import {randomUUID} from 'node:crypto';
import {resolvePortalIdentity} from '../../../server/auth.mjs';
import {ensurePortalUser} from '../../../server/database-api.mjs';
import {getPool} from '../../../server/db/pool.mjs';
import {deliverMail,mailPayload} from '../../../server/work-mail.mjs';
import {mailAppOrigin} from '../../../server/mail-config.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function admin(request) {
  const identity=resolvePortalIdentity(request.headers);
  if(!identity)return null;
  const actor=await ensurePortalUser(getPool(),identity);
  return actor?.is_active && actor.app_role==='admin'?actor:null;
}
export async function GET(request) {
  if(!await admin(request))return Response.json({error:'Admin required'},{status:403});
  const result=await getPool().query('select status,count(*)::integer as count from agent_portal.work_mail_outbox group by status');
  return Response.json({mode:process.env.PORTAL_MAIL_MODE||'off',configured:Boolean(process.env.POWER_AUTOMATE_MAIL_URL),managedIdentity:Boolean(process.env.IDENTITY_ENDPOINT),counts:result.rows},{headers:{'cache-control':'no-store'}});
}
export async function POST(request) {
  const actor=await admin(request);
  if(!actor)return Response.json({error:'Admin required'},{status:403});
  let origin;
  try {origin=mailAppOrigin();} catch {return Response.json({error:'Configuration required: HTTPS portal URL'},{status:503});}
  if(request.headers.get('origin')!==origin)return Response.json({error:'Invalid origin'},{status:403});
  const body=await request.json().catch(()=>null);
  if(body?.action!=='send-self-test')return Response.json({error:'Unsupported action'},{status:400});
  // Never accept a browser supplied recipient, subject, HTML or token.
  const notificationId=randomUUID();
  try {
    const result=await deliverMail(mailPayload({projectNo:'TEST',projectName:'메일 연동 테스트',title:'업무 알림 연동 확인',body:'본인 계정으로 발송하는 연결 테스트입니다. 실제 과제는 변경하지 않습니다.'},actor.email,origin,notificationId));
    return Response.json({...result,notificationId},{status:result.status==='sent'?200:502});
  } catch {return Response.json({error:'Managed identity or flow configuration failed'},{status:503});}
}
