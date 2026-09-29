import {randomUUID} from 'node:crypto';
import {resolveRpaDevelopers} from './rpa-developer-roster.mjs';
import {validatePics,picFields} from '../shared/rpa-pics.mjs';
import {syncRpaPics} from './rpa-pics.mjs';
import {stageMail} from '../shared/rpa-notifications.mjs';
import {workflowAction,workflowTransition} from '../shared/rpa-workflow.mjs';
import {withTransaction} from './db/pool.mjs';
import {rpaActor} from './rpa-portal.mjs';
import {canReadAllRpa} from '../shared/rpa-policy.mjs';
import {RPA_DAYS,timeKey,validTimes} from '../shared/rpa-schedule.mjs';
function checkTimes(f){for(const d of RPA_DAYS)if(Object.hasOwn(f,timeKey(d))&&!validTimes(f[timeKey(d)]))fail(400,'요일별 실행 시간은 HH:MM 형식으로 입력해 주세요.');}
const fail=(s,m)=>{throw Object.assign(new Error(m),{status:s});};
function manager(actor){if(!canReadAllRpa(actor.app_role))fail(403,'AI 활성화팀 팀원·팀장 또는 Admin만 변경할 수 있습니다.');}
export async function updateRpaRequest(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);
  const row=(await c.query('select * from agent_portal.rpa_requests where id=$1 for update',[body.id])).rows[0];
  if(!row||row.payload.deletedAt)fail(404,'요청을 찾을 수 없습니다.');
  const project=(await c.query('select payload from agent_portal.rpa_projects where id=$1',[row.project_id])).rows[0]?.payload;
  if(!project||project.deletedAt)fail(404,'과제를 찾을 수 없습니다.');
  if(!body.version||new Date(row.updated_at).toISOString()!==new Date(body.version).toISOString())fail(409,'다른 사용자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
  const old=row.payload,action=workflowAction(row.status,old,actor,row.created_by);
  if(!action||body.operation!==action)fail(403,'현재 단계의 담당자만 해당 작업을 완료할 수 있습니다.');
  const result=workflowTransition(row.status,old,action,body),now=new Date().toISOString();
  if(action==='assign'){
   const user=(await c.query('select email,display_name from agent_portal.users where lower(email)=$1 and is_active=true and app_role in (\'admin\',\'team_leader\',\'team_member\')',[result.values.assigneeEmail])).rows[0];
   if(!user)fail(400,'AI 활성화팀 팀원·팀장 또는 Admin의 활성 계정을 선택해 주세요.');
   result.values.assignee=user.display_name;
  }
  if(result.values.verification)Object.assign(result.values.verification,{at:now,actor:actor.display_name,actorEmail:actor.email});
  const payload={...old,...result.values,onHold:false};
  payload.id=String(row.id);payload.createdAt=new Date(row.created_at).toISOString();
  if(!payload.requester)payload.requester=(await c.query('select display_name from agent_portal.users where id=$1',[row.created_by])).rows[0]?.display_name;
  if(action==='finalize')payload.completedAt=now;
  const snapshot={stage:row.status,status:result.status,assignee:payload.assignee,assigneeEmail:payload.assigneeEmail,expectedAt:payload.expectedAt,analysis:payload.analysis||'',resolution:payload.resolution||'',comment:payload.verification?.comment||'',decision:payload.verification?.decision||'',reason:payload.verification?.reason||''};
  const label=({assign:'접수 완료 · 담당 개발자 및 반영 일정 지정',resolve:'조치·개발 완료 · 현업 검증 요청',verify:body.decision==='rejected'?'현업 검증 반려 · 조치·개발중으로 복귀':'현업 검증 완료 · 개발자 최종 확인 대기',finalize:'개발자 최종 확인 · 조치 완료'})[action];
  payload.history=[...(old.history||[]),{kind:action==='finalize'?'completed':action,label,at:now,actor:actor.display_name,actorEmail:actor.email,snapshot}];
  payload.workflowMailToken=randomUUID();
  payload.stageMailJobs=(old.stageMailJobs||[]).map(j=>j.status==='pending'?{...j,status:'cancelled'}:j);
  if(action==='finalize'&&old.stageMailStatus==='pending')payload.stageMailStatus='cancelled';
  if(action!=='finalize'){
   const requester=(await c.query('select email from agent_portal.users where id=$1 and is_active=true',[row.created_by])).rows[0];
   const recipient=action==='resolve'?requester?.email:payload.assigneeEmail;
   if(!recipient)fail(400,'다음 담당자의 활성 계정 이메일을 확인해 주세요.');
   const id=randomUUID();
   payload.stageMailJobs.push({id,token:payload.workflowMailToken,status:'pending',attempts:0,mail:stageMail(action,payload,project,recipient,id)});
   payload.stageMailStatus='pending';
  }
  if(action==='finalize'){
   const links=(await c.query('select email from agent_portal.rpa_pic_links where project_id=$1',[row.project_id])).rows;
   const recipients=[...new Set((links.length?links.map(l=>l.email):[old.notifyEmail]).map(v=>String(v||'').trim().toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
   payload.completionMailJobs=recipients.map(email=>({id:randomUUID(),status:'pending',attempts:0,mail:stageMail('completed',payload,project,email,randomUUID())}));
   payload.mailStatus=recipients.length?'pending':'failed';
  }
  await c.query('update agent_portal.rpa_requests set payload=$2,status=$3,updated_at=now() where id=$1',[body.id,payload,result.status]);
  return {saved:true};
 });
}
export async function deleteRpaRequest(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const row=(await c.query('select * from agent_portal.rpa_requests where id=$1 for update',[body.id])).rows[0];
  if(!row||row.payload.deletedAt)fail(404,'요청을 찾을 수 없습니다.');
  if(!body.version||new Date(row.updated_at).toISOString()!==new Date(body.version).toISOString())fail(409,'다른 사용자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
  const code=`REQ-${new Date(row.created_at).getUTCFullYear()}-${String(row.id).padStart(6,'0')}`;
  const reason=String(body.reason||'').trim();
  if(body.confirmCode!==code||!reason||reason.length>1000)fail(400,'요청 번호와 삭제 사유를 확인해 주세요.');
  const old=row.payload;
  if(['stageMailJobs','completionMailJobs'].some(key=>(old[key]||[]).some(j=>j.status==='sending')))fail(409,'알림 메일 발송 중입니다. 잠시 후 다시 삭제해 주세요.');
  const at=new Date().toISOString(),payload={...old,deletedAt:at,deletedBy:actor.email,deletionReason:reason,workflowMailToken:randomUUID(),history:[...(old.history||[]),{kind:'deleted',label:'유지보수 요청 삭제 (보관)',actor:actor.display_name,actorEmail:actor.email,at,reason}]};
  for(const key of ['stageMailJobs','completionMailJobs'])payload[key]=(old[key]||[]).map(j=>j.status==='pending'?{...j,status:'cancelled'}:j);
  await c.query('update agent_portal.rpa_requests set payload=$2,updated_at=now() where id=$1',[body.id,payload]);
  return {saved:true};
 });
}
export async function createRpaMaster(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  let f=body.fields;if(!f||typeof f!=='object'||Array.isArray(f))fail(400,'과제 정보를 확인해 주세요.');
  const developers=await resolveRpaDevelopers(c,body.developerIds);
  f={...f,'개발자':developers.map(u=>u.name).join(' / ')};
  const pairs=body.pics===undefined?null:validatePics(body.pics);if(pairs)f={...f,...picFields(pairs)};
  for(const k of ['과제번호','과제명','부서','PIC','개발자','운영 PC'])if(!String(f[k]||'').trim())fail(400,`${k} 항목을 입력해 주세요.`);
  for(const v of Object.values(f))if(typeof v!=='string'||v.length>10000)fail(400,'입력 길이를 확인해 주세요.');
  checkTimes(f);
  const code=f['과제번호'].trim();if(!/^[A-Za-z0-9-]{2,40}$/.test(code))fail(400,'과제번호 형식을 확인해 주세요.');
  await c.query('select pg_advisory_xact_lock(hashtext($1))',['rpa-master:'+code]);
  if((await c.query('select id from agent_portal.rpa_projects where project_code=$1',[code])).rowCount)fail(409,'이미 등록된 과제번호입니다.');
  const id='portal:'+randomUUID(),now=new Date().toISOString();
  const p={developerIds:developers.map(u=>u.id),developers,id,code,name:f['과제명'].trim(),company:f['법인']||'',department:f['부서'],pics:f.PIC.split(/[/,;\n]/).map(s=>s.trim()).filter(Boolean),developer:f['개발자'],status:f['진행 상태']||'',fields:f,sourceSheet:'포털 직접 등록',sourceRow:'—',history:[{kind:'master',at:now,label:'RPA 과제 마스터 등록',actor:actor.display_name,actorEmail:actor.email}]};
  await c.query('insert into agent_portal.rpa_projects(id,project_code,payload,source_hash) values($1,$2,$3,$4)',[id,code,p,'portal']);
  if(pairs){const synced=await syncRpaPics(c,p,pairs,actor,'과제 등록');await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[id,synced]);}
  return {id};
 });
}
export async function deleteRpaMaster(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const row=(await c.query('select payload from agent_portal.rpa_projects where id=$1 for update',[body.id])).rows[0];
  if(!row||row.payload.deletedAt)fail(404,'과제를 찾을 수 없습니다.');
  const old=row.payload;
  if(body.revision!==(old.revision??0))fail(409,'과제 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  if(body.confirmCode!==old.code)fail(400,'삭제할 과제번호를 정확히 입력해 주세요.');
  const reason=String(body.reason||'').trim();if(!reason||reason.length>1000)fail(400,'삭제 사유를 입력해 주세요.');
  const open=(await c.query("select id from agent_portal.rpa_requests where project_id=$1 and payload->>'deletedAt' is null and (status<>'completed' or payload->>'completedAt' is null) limit 1",[body.id])).rows;
  if(open.length)fail(409,'진행 중인 유지보수 요청이 있어 삭제할 수 없습니다. 요청을 먼저 완료해 주세요.');
  const at=new Date().toISOString();
  const payload={...old,deletedAt:at,deletedBy:actor.email,deletionReason:reason,revision:(old.revision??0)+1,history:[...(old.history||[]),{kind:'master_deleted',label:'RPA 과제 삭제 (보관)',actor:actor.display_name,actorEmail:actor.email,at,reason}]};
  await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[body.id,payload]);
  return {saved:true,archived:true};
 });
}
export async function updateRpaMaster(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const row=(await c.query('select * from agent_portal.rpa_projects where id=$1 for update',[body.id])).rows[0];
  if(!row)fail(404,'과제를 찾을 수 없습니다.');
  const old=row.payload;
  if(old.deletedAt)fail(404,'삭제된 과제입니다.');
  if((body.revision??0)!==(old.revision??0))fail(409,'다른 사용자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
  let input=body.fields;
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'과제 정보를 확인해 주세요.');
  const developers=body.developerIds!==undefined?await resolveRpaDevelopers(c,body.developerIds):null;
  if(developers)input={...input,'개발자':developers.map(u=>u.name).join(' / ')};
  else if(input['개발자']!==undefined&&input['개발자']!==old.fields?.['개발자'])fail(400,'등록된 계정 목록에서 담당 개발자를 선택해 주세요.');
  const pairs=body.pics===undefined?null:validatePics(body.pics);if(pairs)input={...input,...picFields(pairs)};
  const allowed=['과제번호','과제명','법인','본부','부서','접수타입','PIC','현업 이메일','개발자','운영 PC','진행 상태','현업배포일자','사용 화면','주기','실행 방법','실행일','실행 시간','개발공수(DAY)','월 작업 MH (25일)','비고','월','화','수','목','금','토','일',...RPA_DAYS.map(timeKey)];
  for(const [k,v] of Object.entries(input))if(!allowed.includes(k)||typeof v!=='string'||v.length>10000)fail(400,'입력 내용을 확인해 주세요.');
  const f={...old.fields,...input};
  checkTimes(f);
  if(f['과제번호']!==old.code)fail(400,'과제번호는 변경할 수 없습니다.');
  for(const k of ['과제명','부서','PIC','개발자','운영 PC'])if(!String(f[k]||'').trim())fail(400,`${k} 항목을 입력해 주세요.`);
  if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail(400,'변경 사유를 입력해 주세요.');
  const pics=f.PIC.split(/[/,;\n]/).map(s=>s.trim()).filter(Boolean);
  const links=(await c.query('select pic from agent_portal.rpa_pic_links where project_id=$1',[body.id])).rows;
  if(!pairs&&links.some(l=>!pics.includes(l.pic)))fail(409,'계정 연결된 PIC는 PIC 이름·이메일 목록에서 변경해 주세요.');
  const changes=Object.fromEntries(Object.entries(input).filter(([k,v])=>String(old.fields?.[k]??'')!==v).map(([k,v])=>[k,{before:old.fields?.[k]??'',after:v}]));
  if(developers)changes['담당 개발자 계정']={before:old.developers||[],after:developers};
  if(!Object.keys(changes).length&&!pairs)return {saved:true,id:old.id};
  const p={...old,...(developers?{developerIds:developers.map(u=>u.id),developers}:{}),name:f['과제명'].trim(),company:f['법인']||'',department:f['부서'],pics,developer:f['개발자'],status:f['진행 상태']||'',fields:f,revision:(old.revision??0)+1,history:[...(old.history||[]),{kind:'master_updated',label:'RPA 과제 정보 수정',at:new Date().toISOString(),actor:actor.display_name,actorEmail:actor.email,reason:body.reason.trim(),changes}]};
  const synced=pairs?await syncRpaPics(c,{...p,pics:old.pics},pairs,actor,body.reason.trim()):p;
  await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[body.id,synced]);
  return {saved:true,id:old.id};
 });
}
