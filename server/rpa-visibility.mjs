import {withTransaction} from './db/pool.mjs';
import {rpaActor} from './rpa-portal.mjs';
import {canReadAllRpa} from '../shared/rpa-policy.mjs';
import {isRpaHidden} from '../shared/rpa-visibility.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function setRpaVisibility(identity,body){
 if(typeof body.hidden!=='boolean'||!Array.isArray(body.items)||!body.items.length||body.items.length>100||body.items.some(x=>!x||typeof x.id!=='string'||!Number.isInteger(x.revision))||new Set(body.items.map(x=>x.id)).size!==body.items.length)fail(400,'변경할 과제를 1~100개 선택해 주세요.');
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);
  if(!canReadAllRpa(actor.app_role))fail(403,'AI 활성화팀 팀원·팀장 또는 Admin만 숨김을 변경할 수 있습니다.');
  await c.query("set local lock_timeout = '5s'");
  const rows=(await c.query('select id,payload from agent_portal.rpa_projects where id=any($1::text[]) order by id for update',[body.items.map(x=>x.id)])).rows;
  if(rows.length!==body.items.length||rows.some(r=>r.payload.deletedAt))fail(404,'변경할 과제를 찾을 수 없습니다.');
  if(rows.some(r=>(r.payload.revision??0)!==body.items.find(x=>x.id===r.id).revision))fail(409,'과제 정보가 변경되었습니다. 새로고침 후 다시 선택해 주세요.');
  const at=new Date().toISOString();let changed=0;
  for(const {id,payload:p} of rows){
   if(isRpaHidden(p)===body.hidden)continue;
   const event={kind:'visibility',label:body.hidden?'과제 숨김':'과제 숨김 해제',at,actor:actor.display_name,actorEmail:actor.email,changes:{'숨김 여부':{before:!body.hidden,after:body.hidden}}};
   const updated={...p,visibility:{hidden:body.hidden,at,actorEmail:actor.email},revision:(p.revision??0)+1,history:[...(p.history||[]),event]};
   await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[id,updated]);changed++;
  }
  return {saved:true,changed};
 });
}
