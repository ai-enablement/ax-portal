import {createHash} from 'node:crypto';
import {isContactEmail,normalizeContactEmail,historicalParties} from '../shared/project-contacts.mjs';
import {canEditProjectDeadline,validDeadline} from '../shared/project-deadline.mjs';
import {sharedAccountFields} from './shared-accounts.mjs';
const allowed = actor => actor?.is_active && actor.organization_id && ['admin','team_leader'].includes(actor.app_role);
const personSelect = `select u.id::text as id,u.display_name as name,coalesce(u.email,login.email,'') as email,
 coalesce(t.team_name,'') as department,u.app_role as role,u.is_active as active,u.updated_at as version
 from agent_portal.users u left join agent_portal.users login on login.id=u.shared_account_id
 left join agent_portal.teams t on t.id=u.team_id`;
export function validatePeopleChange(body) {
 const ids = value => Array.isArray(value) && value.length <= 30 && value.every(id=>/^\d+$/.test(String(id)) && Number(id)>0) && new Set(value.map(String)).size===value.length;
 if(!ids(body.ownerIds)||!body.ownerIds.length||!ids(body.developerIds))throw new Error('Owner를 한 명 이상 선택하고 중복되지 않는 담당 계정을 지정해 주세요.');
 if(!String(body.reason||'').trim()||String(body.reason).length>2000)throw new Error('변경 사유를 1~2000자로 입력해 주세요.');
 if(!body.version||!Number.isFinite(Date.parse(body.version)))throw new Error('최신 과제 정보를 다시 불러와 주세요.');
 return {ownerIds:body.ownerIds.map(String),developerIds:body.developerIds.map(String),reason:String(body.reason).trim()};
}
export function validateOwnerProfile(body){
 const name=String(body.name||'').trim(),department=String(body.department||'').trim(),email=normalizeContactEmail(body.email),reason=String(body.reason||'').trim();
 if(!name||name.length>200||department.length>200||!isContactEmail(email))throw new Error('Owner 이름과 올바른 회사 로그인 이메일을 입력해 주세요. 부서는 200자 이내로 입력할 수 있습니다.');
 if(!reason||reason.length>2000||!body.version||!Number.isFinite(Date.parse(body.version)))throw new Error('변경 사유와 최신 계정 정보를 확인해 주세요.');
 return {name,department,email,reason};
}
export async function saveGovernanceOwnerProfile(client,actor,code,userId,body){
 if(!allowed(actor))return {status:403,body:{error:'팀장과 Admin만 Owner 정보를 수정할 수 있습니다.'}};
 let change;try{change=validateOwnerProfile(body);}catch(error){return {status:400,body:{error:error.message}};}
 await client.query("select pg_advisory_xact_lock(hashtext('governance-account-write'))");
 const project=(await client.query(`select p.id from agent_portal.projects p where p.project_code=$1 and p.organization_id=$2 and p.deleted_at is null
 and (p.owner_id=$3 or exists(select 1 from agent_portal.project_members m where m.project_id=p.id and m.user_id=$3 and m.relationship='owner' and m.ended_at is null)) for update of p`,[code,actor.organization_id,userId])).rows[0];
 if(!project)return {status:404,body:{error:'해당 과제에 연결된 Owner만 수정할 수 있습니다.'}};
 const target=(await client.query('select * from agent_portal.users where id=$1 and organization_id=$2 and is_active=true for update',[userId,actor.organization_id])).rows[0];
 if(!target)return {status:404,body:{error:'활성 Owner 계정을 찾을 수 없습니다.'}};
 if(new Date(target.updated_at).toISOString()!==new Date(body.version).toISOString())return {status:409,body:{error:'계정 정보가 변경되었습니다. 새로고침 후 다시 수정해 주세요.'}};
 const oldEmail=target.email||(target.shared_account_id?(await client.query('select email from agent_portal.users where id=$1',[target.shared_account_id])).rows[0]?.email:'');
 const bootstrap=new Set(['PORTAL_BOOTSTRAP_ADMIN_EMAILS','PORTAL_ADMIN_EMAILS','PORTAL_BOOTSTRAP_LEADER_EMAILS','PORTAL_TEAM_LEADER_EMAILS'].flatMap(k=>String(process.env[k]||'').toLowerCase().split(/[;,\s]+/).filter(Boolean)));
 if(change.email!==normalizeContactEmail(oldEmail)&&(String(actor.id)===String(target.id)||bootstrap.has(normalizeContactEmail(oldEmail))||['admin','team_leader'].includes(target.app_role)))return {status:409,body:{error:'본인 및 팀장·Admin 인증 계정의 이메일은 이 화면에서 변경할 수 없습니다. 인증 설정에서 관리해 주세요.'}};
 const collision=(await client.query('select id,organization_id from agent_portal.users where lower(email)=lower($1) and id<>$2',[change.email,target.id])).rows[0];
 if(collision&&String(collision.organization_id)!==String(actor.organization_id))return {status:409,body:{error:'다른 조직에 연결된 계정 이메일은 사용할 수 없습니다.'}};
 let account;try{account=await sharedAccountFields(client,{email:change.email,role:target.app_role,target});}catch(error){return {status:error.status||409,body:{error:error.message}};}
 let teamId=null;
 if(change.department){
  const existing=(await client.query('select id from agent_portal.teams where organization_id=$1 and team_name=$2 and is_active=true order by id limit 1',[actor.organization_id,change.department])).rows[0];
  teamId=existing?.id;
  if(!teamId)teamId=(await client.query(`insert into agent_portal.teams(organization_id,team_code,team_name,team_type) values($1,$2,$3,'business')
   on conflict(organization_id,team_code) do update set is_active=true returning id`,[actor.organization_id,'owner-'+createHash('sha256').update(change.department).digest('hex').slice(0,24),change.department])).rows[0].id;
 }
 await client.query('update agent_portal.users set display_name=$2,email=$3,shared_account_id=$4,team_id=$5,updated_at=now() where id=$1',[target.id,change.name,account.email,account.sharedAccountId,teamId]);
 // Refresh live contact snapshots on every related project, never signed documents or approvals.
 const related=(await client.query(`select p.*,coalesce(ir.raw_answers->'portalState','{}'::jsonb) as state from agent_portal.projects p
 left join agent_portal.intake_requests ir on ir.project_id=p.id where p.deleted_at is null and p.organization_id=$2
 and (p.owner_id=$1 or p.requester_id=$1 or exists(select 1 from agent_portal.project_members m where m.project_id=p.id and m.user_id=$1 and m.ended_at is null and m.relationship in ('owner','developer')))
 order by p.id for update of p`,[target.id,actor.organization_id])).rows;
 for(const p of related){
  const members=(await client.query(`select u.id::text as id,u.display_name as name,coalesce(u.email,login.email,'') as email,coalesce(t.team_name,'') as department,m.relationship
   from agent_portal.project_members m join agent_portal.users u on u.id=m.user_id left join agent_portal.users login on login.id=u.shared_account_id left join agent_portal.teams t on t.id=u.team_id
   where m.project_id=$1 and m.ended_at is null and m.relationship in ('owner','developer') order by m.assigned_at,u.id`,[p.id])).rows;
  const owners=members.filter(m=>m.relationship==='owner'),devs=members.filter(m=>m.relationship==='developer');
  if(p.owner_id&&!owners.some(o=>o.id===String(p.owner_id))){const primary=(await client.query(`${personSelect} where u.id=$1`,[p.owner_id])).rows[0];if(primary)owners.unshift(primary);}
  owners.sort((a,b)=>(a.id===String(p.owner_id)?-1:b.id===String(p.owner_id)?1:0));
  const state={...p.state,projectOwners:owners,owner:owners.map(o=>o.name).join(' · '),projectOwner:owners.map(o=>o.name).join(' · '),projectOwnerEmail:owners[0]?.email||'',ownerId:String(p.owner_id||''),developerIds:devs.map(d=>d.id),developerNames:devs.map(d=>d.name),handler:devs.map(d=>d.name).join(' · ')};
  if(String(p.requester_id)===String(target.id))Object.assign(state,{requester:change.name,requesterEmail:change.email});
  await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[p.id,JSON.stringify(state)]);
  await client.query('update agent_portal.projects set updated_at=now() where id=$1',[p.id]);
 }
 await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,before_data,after_data) values($1,$2,'PROJECT_OWNER_PROFILE_CHANGED','user',$3,$4::jsonb,$5::jsonb)",[actor.id,project.id,String(target.id),JSON.stringify({name:target.display_name,email:oldEmail,teamId:target.team_id}),JSON.stringify({...change,affectedProjects:related.map(p=>p.project_code)})]);
 return {status:200,body:{saved:true,affectedProjects:related.map(p=>p.project_code)}};
}
export function governanceOwners(project,people){
 const ids=[...new Set([project.ownerId,...(project.ownerIds||[])].filter(Boolean).map(String))];
 const owners=ids.map(id=>people.find(p=>String(p.id)===id)).filter(Boolean).map(p=>({...p,id:String(p.id)}));
 for(const contact of historicalParties(project.state||{}).owners){
  if(!contact.name&&!contact.email)continue;
  if(owners.some(o=>(contact.id&&String(contact.id)===o.id)||(contact.email&&normalizeContactEmail(o.email)===contact.email)||(!contact.email&&o.name===contact.name)))continue;
  owners.push({name:contact.name,email:contact.email,department:contact.department||'',source:'import'});
 }
 return owners;
}
export async function listGovernanceProjectPeople(client,actor) {
 if(!allowed(actor))return {status:403,body:{error:'팀장과 Admin만 과제 담당 계정을 관리할 수 있습니다.'}};
 const people=(await client.query(`${personSelect} where u.organization_id=$1 order by u.display_name,u.id`,[actor.organization_id])).rows;
 const projects=(await client.query(`select p.id::text as id,p.project_code as no,p.project_name as name,
 p.current_stage_code as stage,p.updated_at as version,p.owner_id::text as "ownerId",
 to_char(p.committed_completion_date,'YYYY-MM-DD') as "committedDate",
 coalesce(ir.raw_answers->'portalState','{}'::jsonb) as state,
 coalesce((select jsonb_agg(m.user_id::text order by m.assigned_at,m.user_id) from agent_portal.project_members m
 where m.project_id=p.id and m.relationship='owner' and m.ended_at is null),'[]'::jsonb) as "ownerIds",
 coalesce((select jsonb_agg(m.user_id::text order by m.user_id) from agent_portal.project_members m
 where m.project_id=p.id and m.relationship='developer' and m.ended_at is null),'[]'::jsonb) as "developerIds"
 from agent_portal.projects p left join agent_portal.intake_requests ir on ir.project_id=p.id where p.deleted_at is null and p.organization_id=$1 order by p.project_code desc`,[actor.organization_id])).rows;
 return {status:200,body:{people,projects:projects.map(p=>{
  const {state={},...item}=p;
  const journeyStep={INT:0,FEA:1,G1:2,ARD:3,G2:4,DES:5,EVP:5,EVR:5,G3:6,PILOT:7,G4:8,OPS:9}[p.stage]??state.journeyStep;
  return {...item,ownerIds:[...new Set([p.ownerId,...p.ownerIds].filter(Boolean))],owners:governanceOwners(p,people),
   committedDate:validDeadline(p.committedDate)?p.committedDate:validDeadline(state.committedDate)?state.committedDate:'',
   canEditDeadline:canEditProjectDeadline({...state,journeyStep},actor),journeyStep};
 })}};
}
export async function saveGovernanceProjectPeople(client,actor,code,body) {
 if(!allowed(actor))return {status:403,body:{error:'팀장과 Admin만 과제 담당 계정을 관리할 수 있습니다.'}};
 if(body.owners===undefined)return saveProjectPeople(client,actor,code,body);
 // HTTP error results must not commit partially created/edited Owner accounts.
 await client.query('savepoint owner_input');
 try{
  const result=await saveProjectPeople(client,actor,code,body);
  if(result.status>=400)await client.query('rollback to savepoint owner_input');
  await client.query('release savepoint owner_input');return result;
 }catch(error){await client.query('rollback to savepoint owner_input');await client.query('release savepoint owner_input');throw error;}
}
async function saveProjectPeople(client,actor,code,body) {
 if(!allowed(actor))return {status:403,body:{error:'팀장과 Admin만 과제 담당 계정을 관리할 수 있습니다.'}};
 let change,ownerInputs;try{
  if(body.owners!==undefined){
   if(!Array.isArray(body.owners)||!body.owners.length||body.owners.length>30)throw new Error('Owner를 한 명 이상 입력해 주세요.');
   ownerInputs=body.owners.map(o=>({...validateOwnerProfile({...o,reason:body.reason,version:o.version||body.version}),id:o.id?String(o.id):null,version:o.version}));
   if(ownerInputs.some(o=>o.id&&!/^\d+$/.test(o.id)))throw new Error('올바른 Owner 계정 정보를 입력해 주세요.');
   if(new Set(ownerInputs.map(o=>o.email)).size!==ownerInputs.length)throw new Error('Owner 이메일을 중복 입력할 수 없습니다.');
  }
  change=validatePeopleChange({...body,ownerIds:ownerInputs?['1']:body.ownerIds});
 }catch(error){return {status:400,body:{error:error.message}};}
 if(ownerInputs)await client.query("select pg_advisory_xact_lock(hashtext('governance-account-write'))");
 const project=(await client.query(`select p.*,coalesce(ir.raw_answers->'portalState','{}'::jsonb) as state
 from agent_portal.projects p left join agent_portal.intake_requests ir on ir.project_id=p.id
 where p.project_code=$1 and p.deleted_at is null and p.organization_id=$2 for update of p`,[code,actor.organization_id])).rows[0];
 if(!project)return {status:404,body:{error:'과제를 찾을 수 없습니다.'}};
 if(new Date(project.updated_at).toISOString()!==new Date(body.version).toISOString())return {status:409,body:{error:'과제가 변경되었습니다. 새로고침 후 다시 저장해 주세요.'}};
 if(ownerInputs){
  change.ownerIds=[];
  for(const input of ownerInputs){
   let id=input.id;
   if(id){
    const target=(await client.query(`${personSelect} where u.id=$1 and u.organization_id=$2 and u.is_active=true`,[id,actor.organization_id])).rows[0];
    if(!target)return {status:400,body:{error:'활성 Owner 계정을 찾을 수 없습니다.'}};
    if(target.name!==input.name||target.department!==input.department||normalizeContactEmail(target.email)!==input.email){
     const edited=await saveGovernanceOwnerProfile(client,actor,code,id,{...input,reason:change.reason});
     if(edited.status!==200)return edited;
    }else{
     const linked=(await client.query(`select p.id from agent_portal.projects p where p.id=$1 and (p.owner_id=$2 or exists(select 1 from agent_portal.project_members m where m.project_id=p.id and m.user_id=$2 and m.relationship='owner' and m.ended_at is null))`,[project.id,id])).rows[0];
     if(!linked)return {status:400,body:{error:'해당 과제에 연결된 Owner만 직접 수정할 수 있습니다.'}};
    }
   }else{
    const existing=(await client.query(`${personSelect} where lower(u.email)=lower($1)`,[input.email])).rows[0];
    if(existing){
     const local=(await client.query('select id from agent_portal.users where id=$1 and organization_id=$2 and is_active=true',[existing.id,actor.organization_id])).rows[0];
     if(!local||existing.name!==input.name||existing.department!==input.department)return {status:409,body:{error:'이미 등록된 이메일입니다. 기존 계정의 이름·부서와 동일하게 입력해 주세요.'}};
     id=existing.id;
    }else{
     let teamId=null;
     if(input.department){
      teamId=(await client.query('select id from agent_portal.teams where organization_id=$1 and team_name=$2 and is_active=true order by id limit 1',[actor.organization_id,input.department])).rows[0]?.id;
      if(!teamId)teamId=(await client.query(`insert into agent_portal.teams(organization_id,team_code,team_name,team_type) values($1,$2,$3,'business') on conflict(organization_id,team_code) do update set is_active=true returning id`,[actor.organization_id,'owner-'+createHash('sha256').update(input.department).digest('hex').slice(0,24),input.department])).rows[0].id;
     }
     id=String((await client.query(`insert into agent_portal.users(organization_id,team_id,display_name,email,app_role,is_active) values($1,$2,$3,$4,'general_user',true) returning id`,[actor.organization_id,teamId,input.name,input.email])).rows[0].id);
    }
   }
   if(change.ownerIds.includes(String(id)))return {status:400,body:{error:'동일한 Owner 계정은 한 번만 등록해 주세요.'}};
   change.ownerIds.push(String(id));
  }
  project.state=(await client.query("select coalesce(raw_answers->'portalState','{}'::jsonb) as state from agent_portal.intake_requests where project_id=$1",[project.id])).rows[0]?.state||project.state;
 }
 const selected=(await client.query(`${personSelect} where u.id=any($1::bigint[]) and u.organization_id=$2 and u.is_active=true`,[[...change.ownerIds,...change.developerIds],actor.organization_id])).rows;
 const map=new Map(selected.map(p=>[p.id,p]));
 if([...change.ownerIds,...change.developerIds].some(id=>!map.has(id))||change.developerIds.some(id=>!['admin','team_leader','team_member','bts','bp_solution'].includes(map.get(id).role)))return {status:400,body:{error:'활성 Owner 계정과 개발 수행 역할의 계정을 선택해 주세요.'}};
 const before=(await client.query("select m.user_id::text as id,u.display_name as name,m.relationship from agent_portal.project_members m join agent_portal.users u on u.id=m.user_id where m.project_id=$1 and m.relationship in ('owner','developer') and m.ended_at is null",[project.id])).rows;
 for(const [relation,ids] of [['owner',change.ownerIds],['developer',change.developerIds]]){
  await client.query('update agent_portal.project_members set ended_at=now() where project_id=$1 and relationship=$2 and ended_at is null and not(user_id=any($3::bigint[]))',[project.id,relation,ids]);
  for(const id of ids)await client.query(`insert into agent_portal.project_members(project_id,user_id,relationship,assigned_by) values($1,$2,$3,$4)
   on conflict(project_id,user_id,relationship) do update set ended_at=null,assigned_by=excluded.assigned_by`,[project.id,id,relation,actor.id]);
 }
 const owners=change.ownerIds.map(id=>map.get(id)),developers=change.developerIds.map(id=>map.get(id));
 const at=new Date().toISOString(),entry={at,actorId:String(actor.id),actorName:actor.display_name,reason:change.reason,before,after:{owners,developers}};
 const state={...project.state,ownerId:owners[0].id,projectOwnerEmail:owners[0].email,projectOwners:owners,
  owner:owners.map(p=>p.name).join(' · '),projectOwner:owners.map(p=>p.name).join(' · '),developerIds:change.developerIds,
  developerNames:developers.map(p=>p.name),handler:developers.map(p=>p.name).join(' · '),
  contactManagementHistory:[...(project.state.contactManagementHistory||[]),entry]};
 const oldDevelopers=before.filter(p=>p.relationship==='developer').map(p=>({id:p.id,name:p.name}));
 if(JSON.stringify(oldDevelopers.map(p=>p.id).sort())!==JSON.stringify([...change.developerIds].sort()))state.developerAssignmentHistory=[...(project.state.developerAssignmentHistory||[]),{at,actorId:String(actor.id),actorName:actor.display_name,reason:change.reason,before:oldDevelopers,after:developers.map(p=>({id:p.id,name:p.name}))}];
 await client.query('update agent_portal.projects set owner_id=$2,updated_at=now() where id=$1',[project.id,owners[0].id]);
 await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[project.id,JSON.stringify(state)]);
 await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,before_data,after_data) values($1,$2,'PROJECT_PEOPLE_CHANGED','project',$3,$4::jsonb,$5::jsonb)",[actor.id,project.id,code,JSON.stringify(before),JSON.stringify(entry)]);
 return {status:200,body:{saved:true}};
}
