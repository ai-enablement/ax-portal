import {validateProgressChange} from '../shared/leader-dashboard.mjs';
import {deploymentCompleted} from '../shared/deployment-progress.mjs';
export async function saveProjectProgress(client,project,actor,change) {
  const fail=(status,error)=>({status,body:{error}});
  const assigned=(await client.query("select 1 from agent_portal.project_members where project_id=$1 and user_id=any($2::bigint[]) and relationship='developer' and ended_at is null",[project.id,[String(actor.id),...(actor.sharedUserIds||[])]] )).rows.length>0;
  if(actor.app_role==='general_user'||!assigned)return fail(403,'배정된 개발 담당자만 진척률을 입력할 수 있습니다.');
  let value;
  try{value=validateProgressChange(change);}catch(e){return fail(400,e.message);}
  const previous=project.runtime_state||{};
  if(deploymentCompleted(previous))return fail(409,'배포·확산이 완료된 과제의 진척률은 자동으로 100%로 관리됩니다.');
  if(change.expectedRevision!==(previous.progressRevision||0))return fail(409,'다른 담당자가 진척률을 변경했습니다. 새로고침 후 다시 확인해 주세요.');
  const entry={...value,previousPercent:previous.manualProgress??null,actorId:String(actor.id),actorName:actor.display_name,at:new Date().toISOString()};
  const state={...previous,manualProgress:value.percent,progressRevision:(previous.progressRevision||0)+1,progressUpdatedAt:entry.at,progressUpdatedBy:entry.actorName,progressHistory:[...(previous.progressHistory||[]),entry]};
  const result=await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[project.id,JSON.stringify(state)]);
  if(!result.rowCount)throw Error('Project intake record missing');
  await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,before_data,after_data) values($1,$2,'PROJECT_MANUAL_PROGRESS','project',$3,$4::jsonb,$5::jsonb)",[actor.id,project.id,project.project_code,JSON.stringify({manualProgress:previous.manualProgress??null}),JSON.stringify(entry)]);
  return {status:200,body:{project:{...state,no:project.project_code,source:'database'}}};
}
