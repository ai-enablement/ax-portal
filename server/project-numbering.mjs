import {randomUUID,createHash} from 'node:crypto';
import {formatKst,kstDate} from '../shared/portal-time.mjs';
import {isDraftProjectCode} from '../shared/project-code.mjs';
export const draftProjectCode = () => 'DRAFT-'+randomUUID().replaceAll('-','');
export function repairIntDocumentNumber(markdown,code){
 if(!/^\d{4}-\d{3,}$/.test(code))return markdown;
 return String(markdown||'').replace(/^(#{1,6}\s+[^\n]*에이전트 요구 접수서\s*\()\d{4}-000-INT(\))/gm,`$1${code}-INT$2`);
}
export function replaceProjectCode(value,previous,next){
 if(typeof value==='string')return value.replaceAll(previous,next);
 if(Array.isArray(value))return value.map(item=>replaceProjectCode(item,previous,next));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replaceProjectCode(item,previous,next)]));
 return value;
}
// Caller holds the project row lock. Allocation and all reference changes commit together.
export async function assignCompletedIntNumber(client,projectId,code,state,payload,actorId){
 if(!isDraftProjectCode(code))return {code,state,payload};
 const year=Number(kstDate().slice(0,4));
 const next=(await client.query('select agent_portal.next_project_code($1) as code',[year])).rows[0].code;
 await client.query('update agent_portal.projects set project_code=$2,submitted_at=now(),updated_at=now() where id=$1',[projectId,next]);
 const documents=(await client.query('select id,markdown,original_name from agent_portal.native_agent_documents where project_id=$1',[projectId])).rows;
 for(const doc of documents){
  const markdown=repairIntDocumentNumber(replaceProjectCode(doc.markdown,code,next),next);
  await client.query('update agent_portal.native_agent_documents set markdown=$2,original_name=$3,content_sha256=$4 where id=$1',[doc.id,markdown,replaceProjectCode(doc.original_name,code,next),createHash('sha256').update(markdown).digest('hex')]);
 }
 await client.query('update agent_portal.documents set document_code=replace(document_code,$2,$3) where project_id=$1',[projectId,code,next]);
 await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,after_data) values($1,$2,'PROJECT_NUMBER_ASSIGNED','project',$3,$4::jsonb)",[actorId,projectId,next,JSON.stringify({previous:code,projectCode:next,reason:'INT 작성 및 검증 완료'})]);
 const nextPayload=replaceProjectCode(payload,code,next);
 if(nextPayload.int_md)nextPayload.int_md=repairIntDocumentNumber(nextPayload.int_md,next);
 return {code:next,state:{...replaceProjectCode(state,code,next),no:next,provisionalProjectCode:code,numberAssignedAt:new Date().toISOString()},payload:nextPayload};
}
