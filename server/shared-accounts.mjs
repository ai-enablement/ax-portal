export const sharedRoles=['bts','bp_solution'];
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
// Never trust group IDs from an HTTP request. Resolve active, same-role members from DB.
export async function withSharedUsers(client,actor){
 if(!actor||!sharedRoles.includes(actor.app_role)||!actor.is_active)return actor;
 const rows=(await client.query('select id from agent_portal.users where shared_account_id=$1 and app_role=$2 and is_active=true order by id',[actor.id,actor.app_role])).rows;
 return {...actor,sharedUserIds:[String(actor.id),...rows.map(r=>String(r.id))],...(rows.length?{display_name:`${actor.email} (공용 계정)`}:{})};
}
export async function sharedAccountFields(client,{email,role,target}){
 // Serialize same-email registration; uniqueness of the actual login email remains intact.
 await client.query('select pg_advisory_xact_lock(hashtext($1))',['shared-account:'+email]);
 if(target){
  const children=(await client.query('select id from agent_portal.users where shared_account_id=$1 limit 1',[target.id])).rows;
  if(children.length&&(email!==String(target.email||'').toLowerCase()||role!==target.app_role))fail('공용 계정에 연결된 인원이 있습니다. 해당 인원들의 이메일 연결을 먼저 변경해 주세요.');
 }
 const existing=email?(await client.query('select id,app_role,is_active from agent_portal.users where lower(email)=lower($1) and id<>$2 for update',[email,target?.id||0])).rows[0]:null;
 if(existing){
  if(!sharedRoles.includes(role)||existing.app_role!==role||!existing.is_active)fail('같은 역할의 활성 BTS 또는 비피솔루션 인원끼리만 공용 이메일을 사용할 수 있습니다. 내부 계정 및 다른 역할과는 공유할 수 없습니다.');
  return {email:null,sharedAccountId:existing.id};
 }
 return {email:email||null,sharedAccountId:null};
}
