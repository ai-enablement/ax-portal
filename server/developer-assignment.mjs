const ids=values=>[...new Set((values||[]).map(String))].sort();
export const sameDeveloperIds=(a,b)=>JSON.stringify(ids(a))===JSON.stringify(ids(b));
export async function changeProjectDevelopers(client,project,actor,action){
 const fail=(status,error)=>({status,body:{error}});
 if(!['admin','team_leader'].includes(actor.app_role))return fail(403,'팀장과 Admin만 개발 담당자를 변경할 수 있습니다.');
 if(project.current_stage_code!=='G2')return fail(409,'개발 착수 승인(G2) 단계에서만 개발 담당자를 변경할 수 있습니다.');
 const reason=String(action?.reason||'').trim();
 if(!reason||reason.length>2000)return fail(400,'변경 사유를 1~2000자로 입력해 주세요.');
 if(!Array.isArray(action.developerIds)||!action.developerIds.length||action.developerIds.some(id=>!/^\d+$/.test(String(id))||Number(id)<=0))return fail(400,'개발 담당자를 한 명 이상 선택해 주세요.');
 const before=(await client.query("select u.id,u.display_name as name from agent_portal.project_members m join agent_portal.users u on u.id=m.user_id where m.project_id=$1 and m.relationship='developer' and m.ended_at is null order by u.id",[project.id])).rows;
 if(!Array.isArray(action.expectedIds)||!sameDeveloperIds(action.expectedIds,before.map(u=>u.id)))return fail(409,'개발 담당자가 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
 const targetIds=ids(action.developerIds);
 if(sameDeveloperIds(targetIds,before.map(u=>u.id)))return fail(400,'변경할 개발 담당자가 현재와 같습니다.');
 const after=(await client.query("select id,display_name as name from agent_portal.users where id=any($1::bigint[]) and is_active=true and app_role <> 'general_user' order by id",[targetIds])).rows;
 if(after.length!==targetIds.length)return fail(400,'활성화된 개발 담당 계정만 선택할 수 있습니다.');
 const at=(await client.query('select now() as at')).rows[0].at;
 const entry={at:new Date(at).toISOString(),actorId:String(actor.id),actorName:actor.display_name,reason,before:before.map(u=>({id:String(u.id),name:u.name})),after:after.map(u=>({id:String(u.id),name:u.name}))};
 await client.query("update agent_portal.project_members set ended_at=now() where project_id=$1 and relationship='developer' and ended_at is null and not(user_id=any($2::bigint[]))",[project.id,targetIds]);
 for(const user of after.filter(u=>!before.some(old=>String(old.id)===String(u.id))))await client.query("insert into agent_portal.project_members(project_id,user_id,relationship,assigned_by,assigned_at,ended_at) values($1,$2,'developer',$3,now(),null) on conflict(project_id,user_id,relationship) do update set assigned_by=excluded.assigned_by,assigned_at=now(),ended_at=null",[project.id,user.id,actor.id]);
 const previous=project.runtime_state||{};
 const state={...previous,developerIds:after.map(u=>String(u.id)),developerNames:after.map(u=>u.name),handler:after.map(u=>u.name).join(' · '),developerAssignmentHistory:[...(previous.developerAssignmentHistory||[]),entry]};
 await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[project.id,JSON.stringify(state)]);
 await client.query('update agent_portal.projects set updated_at=now() where id=$1',[project.id]);
 await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,before_data,after_data) values($1,$2,'PROJECT_DEVELOPER_CHANGE','project',$3,$4::jsonb,$5::jsonb)",[actor.id,project.id,project.project_code,JSON.stringify(entry.before),JSON.stringify(entry)]);
 return {status:200,body:{project:{...state,no:project.project_code,source:'database'}}};
}
