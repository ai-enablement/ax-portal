import {randomUUID} from 'node:crypto';
import {rpaDeveloperRoster} from './rpa-developer-roster.mjs';
import {withSharedUsers} from './shared-accounts.mjs';
import {isRpaHidden} from '../shared/rpa-visibility.mjs';
import {workflowAction} from '../shared/rpa-workflow.mjs';
import {stageMail} from '../shared/rpa-notifications.mjs';
import {getPool,withTransaction} from './db/pool.mjs';
import {validateUpload} from './document-files.mjs';
import {canReadAllRpa,canLinkRpaPic,validateRpaRequest} from '../shared/rpa-policy.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function rpaActor(identity,client=getPool()){
 if(!identity?.email)fail(401,'로그인이 필요합니다.');
 const actor=(await client.query('select id,email,display_name,app_role,is_active from agent_portal.users where lower(email)=lower($1) and is_active=true',[identity.email])).rows[0];
 if(!actor)fail(403,'활성 포털 계정이 필요합니다.');
 // Only the server-resolved, explicitly enabled development switcher can override.
 // Entra/production callers always use the stored role, never a request-body role.
 if(process.env.NODE_ENV!=='production'&&identity.source==='development'&&identity.canSwitchRole&&['admin','team_leader','team_member','general_user','bts','bp_solution'].includes(identity.appRole))return {...actor,app_role:identity.appRole};
 return withSharedUsers(client,actor);
}
const scope=`(p.payload->>'deletedAt' is null and ($1::boolean or exists(select 1 from agent_portal.rpa_pic_links l where l.project_id=p.id and l.email=$2) or exists(select 1 from agent_portal.rpa_requests assigned where assigned.project_id=p.id and assigned.payload->>'deletedAt' is null and lower(assigned.payload->>'assigneeEmail')=$2)))`;
async function allowedProject(client,actor,id){
 const p=(await client.query(`select p.* from agent_portal.rpa_projects p where p.id=$3 and ${scope} for share`,[canReadAllRpa(actor.app_role),actor.email.toLowerCase(),id])).rows[0];
 if(!p)fail(404,'조회 가능한 RPA 과제가 아닙니다.');return p;
}
export async function listRpa(identity){
 const pool=getPool(),actor=await rpaActor(identity,pool),args=[canReadAllRpa(actor.app_role),actor.email.toLowerCase()];
 const projects=(await pool.query(`select p.payload from agent_portal.rpa_projects p where ${scope} order by p.project_code,p.id`,args)).rows.map(r=>r.payload);
 const tickets=(await pool.query(`select r.id::text,r.project_id,r.created_by,r.payload,r.status,r.created_at,r.updated_at,u.display_name as requester,u.email as requester_email from agent_portal.rpa_requests r join agent_portal.rpa_projects p on p.id=r.project_id join agent_portal.users u on u.id=r.created_by where r.payload->>'deletedAt' is null and ${scope} order by r.created_at desc`,args)).rows;
 const requests=tickets.map(r=>{const payload={...r.payload};delete payload.completionMailJobs;delete payload.stageMailJobs;delete payload.workflowMailToken;return {...payload,canDelete:canReadAllRpa(actor.app_role),allowedAction:workflowAction(r.status,payload,actor,r.created_by),id:r.id,projectId:r.project_id,code:`REQ-${new Date(r.created_at).getUTCFullYear()}-${r.id.padStart(6,'0')}`,resumeStatus:r.status,status:r.payload.onHold?'held':r.status,createdAt:r.created_at,updatedAt:r.updated_at,requester:r.requester,requesterEmail:r.requester_email};});
 const links=canLinkRpaPic(actor.app_role)?(await pool.query('select project_id as "projectId",pic,email from agent_portal.rpa_pic_links order by project_id,pic')).rows:[];
 const developerAccounts=canReadAllRpa(actor.app_role)?(await pool.query("select string_agg(u.display_name,' / ' order by u.display_name) as label,coalesce(u.email,login.email) as value from agent_portal.users u left join agent_portal.users login on login.id=u.shared_account_id where u.is_active=true and u.app_role in ('admin','team_leader','team_member') and (u.shared_account_id is null or (login.is_active and login.app_role=u.app_role)) and coalesce(u.email,login.email) is not null group by coalesce(u.email,login.email) order by label")).rows:[];
 const people=canReadAllRpa(actor.app_role)?(await pool.query('select display_name from agent_portal.users order by display_name')).rows.map(u=>u.display_name):[];
 const developerRoster=canReadAllRpa(actor.app_role)?await rpaDeveloperRoster(pool):[];
 const hiddenProjects=projects.filter(isRpaHidden),visibleProjects=projects.filter(p=>!isRpaHidden(p));
 return {developerRoster,projects:visibleProjects,hiddenProjects,requestProjects:hiddenProjects.filter(p=>requests.some(r=>r.projectId===p.id)),requests,links,people,developerAccounts,canReadAll:canReadAllRpa(actor.app_role),canLink:canLinkRpaPic(actor.app_role),actor:{name:actor.display_name,email:actor.email},mailEnabled:['live','test'].includes(process.env.PORTAL_MAIL_MODE)&&!!process.env.POWER_AUTOMATE_MAIL_URL};
}
export async function createRpaRequest(identity,body){
 const error=validateRpaRequest(body);if(error)fail(400,error);
 if(!Array.isArray(body.files)||body.files.length>5)fail(400,'첨부파일은 최대 5개입니다.');
 const files=body.files.map(f=>{const bytes=Buffer.from(String(f.base64||''),'base64');let mime;try{mime=validateUpload(String(f.name||''),bytes);}catch(e){fail(400,e.message);}return {id:randomUUID(),name:String(f.name).replace(/[\r\n\\/]/g,'_').slice(0,180),mime,size:bytes.length,bytes};});
 if(files.reduce((s,f)=>s+f.size,0)>10*1024*1024)fail(413,'첨부파일 총 용량은 10MB 이하입니다.');
 return withTransaction(async client=>{
  const actor=await rpaActor(identity,client);const project=await allowedProject(client,actor,body.projectId);
  if(isRpaHidden(project.payload))fail(409,'숨김 과제입니다. 관리자가 숨김을 해제한 후 요청을 등록해 주세요.');
  const existing=(await client.query('select id::text,created_by from agent_portal.rpa_requests where idempotency_key=$1',[body.key])).rows[0];
  if(existing){if(String(existing.created_by)!==String(actor.id))fail(409,'다른 접수에 사용된 키입니다.');return {id:existing.id};}
  const payload={title:body.title.trim(),description:body.description.trim(),type:body.type,priority:body.priority,occurredDate:body.occurredDate,notifyEmail:body.notifyEmail.trim().toLowerCase(),log:String(body.log||''),errorStep:String(body.errorStep||'').slice(0,1000),files:files.map(({id,name,size})=>({id,name,size})),history:[{kind:'created',at:new Date().toISOString(),label:'요청 접수',actor:actor.display_name}],mailStatus:'not_requested'};
  const row=(await client.query(`insert into agent_portal.rpa_requests(project_id,created_by,idempotency_key,payload) values($1,$2,$3,$4) returning id::text`,[body.projectId,actor.id,body.key,payload])).rows[0];
  for(const f of files)await client.query('insert into agent_portal.rpa_request_files(id,request_id,name,mime_type,byte_size,content) values($1,$2,$3,$4,$5,$6)',[f.id,row.id,f.name,f.mime,f.size,f.bytes]);
  const recipients=(await client.query("select distinct lower(email) as email from agent_portal.users where is_active=true and app_role in ('admin','team_leader','team_member')")).rows;
  payload.id=row.id;payload.createdAt=payload.history[0].at;payload.requester=actor.display_name;
  payload.workflowMailToken=randomUUID();
  payload.stageMailJobs=recipients.map(({email})=>{const id=randomUUID();return {id,token:payload.workflowMailToken,status:'pending',attempts:0,mail:stageMail('received',payload,project.payload,email,id)};});
  payload.stageMailStatus=recipients.length?'pending':'failed';
  await client.query('update agent_portal.rpa_requests set payload=$2 where id=$1',[row.id,payload]);
  return row;
 });
}
export async function linkRpaPic(identity,body){
 const email=String(body.email||'').trim().toLowerCase(),reason=String(body.reason||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!reason||reason.length>1000)fail(400,'연결할 이메일과 변경 사유를 입력해 주세요.');
 return withTransaction(async client=>{
  const actor=await rpaActor(identity,client);if(!canLinkRpaPic(actor.app_role))fail(403,'AI 활성화팀 팀원·팀장 또는 Admin만 PIC 계정을 연결할 수 있습니다.');
  const p=(await client.query('select payload from agent_portal.rpa_projects where id=$1 for update',[body.projectId])).rows[0];
  if(!p||p.payload.deletedAt||!(p.payload.pics.length?p.payload.pics:['PIC 미지정']).includes(body.pic))fail(400,'원본 PIC를 확인해 주세요.');
  const old=(await client.query('select email from agent_portal.rpa_pic_links where project_id=$1 and pic=$2',[body.projectId,body.pic])).rows[0];
  await client.query(`insert into agent_portal.rpa_pic_links(project_id,pic,email,changed_by) values($1,$2,$3,$4) on conflict(project_id,pic) do update set email=excluded.email,changed_by=excluded.changed_by,updated_at=now()`,[body.projectId,body.pic,email,actor.id]);
  await client.query('insert into agent_portal.rpa_pic_history(project_id,pic,previous_email,email,reason,changed_by) values($1,$2,$3,$4,$5,$6)',[body.projectId,body.pic,old?.email||null,email,reason,actor.id]);
  return {saved:true};
 });
}
export async function readRpaFile(identity,id){
 if(!/^[\da-f-]{36}$/i.test(id))fail(404,'파일을 찾을 수 없습니다.');
 const pool=getPool(),actor=await rpaActor(identity,pool);
 const f=(await pool.query("select f.*,r.project_id from agent_portal.rpa_request_files f join agent_portal.rpa_requests r on r.id=f.request_id where f.id=$1 and r.payload->>'deletedAt' is null",[id])).rows[0];
 if(!f)fail(404,'파일을 찾을 수 없습니다.');await allowedProject(pool,actor,f.project_id);return f;
}
export async function updateRpaPics(identity,body){
 return withTransaction(async client=>{
  const actor=await rpaActor(identity,client);
  if(!canLinkRpaPic(actor.app_role))fail(403,'AI 활성화팀 팀원·팀장 또는 Admin만 PIC 정보를 변경할 수 있습니다.');
  const row=(await client.query('select payload from agent_portal.rpa_projects where id=$1 for update',[body.projectId])).rows[0];
  if(!row)fail(404,'과제를 찾을 수 없습니다.');
  const p=row.payload;
  if(p.deletedAt)fail(404,'삭제된 과제입니다.');
  const links=(await client.query('select pic,email from agent_portal.rpa_pic_links where project_id=$1 order by pic',[body.projectId])).rows;
  const signature=items=>JSON.stringify(items.map(x=>[x.pic,x.email]).sort((a,b)=>a[0].localeCompare(b[0])));
  if(body.revision!==(p.revision??0)||!Array.isArray(body.previousLinks)||signature(body.previousLinks)!==signature(links))fail(409,'PIC 정보가 변경되었습니다. 닫고 새로고침한 뒤 다시 시도해 주세요.');
  if(!Array.isArray(body.pics)||body.pics.length>50)fail(400,'PIC는 최대 50명까지 등록할 수 있습니다.');
  const pics=body.pics.map(x=>({pic:String(x?.pic||'').trim(),email:String(x?.email||'').trim().toLowerCase()}));
  if(pics.some(x=>!x.pic||x.pic.length>100||/[/,;\n\r]/.test(x.pic)||x.email.length>254||(x.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)))||new Set(pics.map(x=>x.pic.toLowerCase())).size!==pics.length)fail(400,'중복되지 않는 PIC 이름과 올바른 이메일을 입력해 주세요.');
  const reason=String(body.reason||'').trim();if(!reason||reason.length>1000)fail(400,'변경 사유를 입력해 주세요.');
  const before=(p.pics||[]).map(pic=>({pic,email:links.find(l=>l.pic===pic)?.email||''}));
  const history={kind:'pic_updated',label:'PIC 정보 변경',at:new Date().toISOString(),actor:actor.display_name,actorEmail:actor.email,reason,changes:{PIC:{before,after:pics}}};
  await client.query('delete from agent_portal.rpa_pic_links where project_id=$1',[body.projectId]);
  for(const x of pics.filter(x=>x.email))await client.query('insert into agent_portal.rpa_pic_links(project_id,pic,email,changed_by) values($1,$2,$3,$4)',[body.projectId,x.pic,x.email,actor.id]);
  const updated={...p,pics:pics.map(x=>x.pic),fields:{...p.fields,PIC:pics.map(x=>x.pic).join('/'),'현업 이메일':pics.map(x=>x.email).filter(Boolean).join('; ')},revision:(p.revision??0)+1,history:[...(p.history||[]),history]};
  await client.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[body.projectId,updated]);
  return {saved:true};
 });
}
