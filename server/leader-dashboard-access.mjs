export async function leaderDashboardScope(actor, client) {
  const email=actor?.email?.trim().toLowerCase();
  if(!email)return 'all';
  const {rows}=await client.query('select id from agent_portal.d2b_dashboard_access where email=$1 and is_active=true',[email]);
  return rows.length?'D2B':'all';
}

const readers=new Set(['team_member','team_leader','admin']);
const managers=new Set(['team_leader','admin']);
const fields='id,display_name as "displayName",email,revision,updated_at as "updatedAt"';
export async function manageD2BAccess(client,actor,method,id,body={}) {
  const fail=(status,error)=>({status,body:{error}});
  if(!actor?.is_active||!readers.has(actor.app_role))return fail(403,'D2B 접근 관리 권한이 없습니다.');
  if(method==='GET'&&!id){
    const {rows}=await client.query(`select ${fields} from agent_portal.d2b_dashboard_access where is_active=true order by display_name,id`);
    return {status:200,body:{accounts:rows,canManage:managers.has(actor.app_role)}};
  }
  if(!managers.has(actor.app_role))return fail(403,'팀장 또는 Admin만 D2B 접근 지정을 변경할 수 있습니다.');
  if(!['POST','PATCH','DELETE'].includes(method)||(method==='POST'?Boolean(id):!/^\d+$/.test(id||'')))return fail(400,'잘못된 요청입니다.');
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const displayName=typeof body.displayName==='string'?body.displayName.trim():'';
  if(method!=='DELETE'&&(!displayName||displayName.length>100||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return fail(400,'이름과 올바른 MS 계정 이메일을 입력해 주세요.');
  await client.query("select pg_advisory_xact_lock(hashtext('d2b-dashboard-access-write'))");
  const before=(await client.query(`select * from agent_portal.d2b_dashboard_access where ${method==='POST'?'email=$1':'id=$1'} for update`,[method==='POST'?email:id])).rows[0];
  if(method==='POST'&&before?.is_active)return fail(409,'이미 D2B 접근 계정으로 등록되어 있습니다.');
  if(method!=='POST'&&(!before?.is_active))return fail(404,'D2B 접근 지정이 없습니다. 새로고침해 주세요.');
  if(method!=='POST'&&Number(body.revision)!==before.revision)return fail(409,'다른 관리자가 변경한 내용이 있습니다. 새로고침 후 다시 시도해 주세요.');
  if(method==='PATCH'){
    const duplicate=(await client.query('select id from agent_portal.d2b_dashboard_access where email=$1 and id<>$2',[email,id])).rows[0];
    if(duplicate)return fail(409,'이미 등록 이력이 있는 이메일입니다. 기존 지정을 삭제하고 해당 이메일을 추가해 주세요.');
  }
  let after;
  if(method==='DELETE')after=(await client.query(`update agent_portal.d2b_dashboard_access set is_active=false,revision=revision+1,updated_at=now() where id=$1 returning *`,[id])).rows[0];
  else if(before)after=(await client.query(`update agent_portal.d2b_dashboard_access set display_name=$2,email=$3,is_active=true,revision=revision+1,updated_at=now() where id=$1 returning *`,[before.id,displayName,email])).rows[0];
  else after=(await client.query(`insert into agent_portal.d2b_dashboard_access(display_name,email) values($1,$2) returning *`,[displayName,email])).rows[0];
  await client.query(`insert into agent_portal.audit_logs(actor_user_id,action_code,entity_type,entity_id,before_data,after_data) values($1,$2,'d2b_dashboard_access',$3,$4::jsonb,$5::jsonb)`,[actor.id,`D2B_ACCESS_${{POST:'ADDED',PATCH:'UPDATED',DELETE:'REMOVED'}[method]}`,String(after.id),JSON.stringify(before||null),JSON.stringify(after)]);
  return {status:method==='POST'?201:200,body:{ok:true}};
}
