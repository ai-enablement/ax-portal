import {emailFromPartyLabel, isContactEmail, normalizeContactEmail,historicalParties} from '../shared/project-contacts.mjs';

export class ProjectContactError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateHistoricalContactUpdate(state, update, actor) {
  const assigned=(state.developerIds||[]).map(String).some(id=>[String(actor.id),...(actor.sharedUserIds||[])].includes(id));
  if(!state.historicalImport || !(actor.app_role==='admin'||(actor.app_role!=='general_user'&&assigned)))throw new ProjectContactError('Admin 또는 지정 개발 담당자만 이관 연락처를 보완할 수 있습니다.',403);
  if(!update||typeof update!=='object'||Array.isArray(update))throw new ProjectContactError('연락처 입력을 확인해 주세요.');
  if('parties' in update){
    if(Object.keys(update).some(k=>!['parties','complete','removedOwnerEmails','removedOwnerNames'].includes(k)))throw new ProjectContactError('지원하지 않는 연락처 항목입니다.');
    const old=historicalParties(state),raw=update.parties;
    if(!raw||!Array.isArray(raw.owners)||!raw.owners.length||raw.owners.length>30)throw new ProjectContactError('Project Owner를 한 명 이상 입력해 주세요.');
    const clean=p=>({name:String(p?.name||'').trim(),email:normalizeContactEmail(p?.email)});
    const requester=clean(raw.requester),owners=raw.owners.map(clean);
    for(const p of [requester,...owners])if(!p.name||p.name.length>200||!isContactEmail(p.email))throw new ProjectContactError('모든 담당자의 이름과 올바른 이메일을 입력해 주세요.');
    if(new Set(owners.map(p=>p.email)).size!==owners.length)throw new ProjectContactError('Owner 이메일이 중복됩니다.');
    if(old.requester.email&&old.requester.email!==requester.email)throw new ProjectContactError('이미 연결된 요구자 이메일은 변경할 수 없습니다.',409);
    if(old.requester.name&&old.requester.name!==requester.name)throw new ProjectContactError('기존 요구자 이름은 유지해 주세요.',409);
    const removed=Array.isArray(update.removedOwnerEmails)?update.removedOwnerEmails.map(normalizeContactEmail):[];
    const removedNames=Array.isArray(update.removedOwnerNames)?update.removedOwnerNames.map(n=>String(n).trim()):[];
    for(const p of old.owners)if(!(p.email?removed.includes(p.email):removedNames.includes(p.name))&&!owners.some(n=>(!p.name||n.name===p.name)&&(!p.email||n.email===p.email)))throw new ProjectContactError('기존 Owner의 이름과 연결 이메일은 유지해 주세요.',409);
    return {parties:{requester,owners},complete:update.complete===true};
  }
  const result={};
  for(const key of Object.keys(update)) {
    if(!['requesterEmail','projectOwnerEmail'].includes(key))throw new ProjectContactError('지원하지 않는 연락처 항목입니다.');
    const value=normalizeContactEmail(update[key]);
    const old=normalizeContactEmail(state[key])||emailFromPartyLabel(key==='requesterEmail'?state.requester:state.projectOwner||state.owner);
    if(old&&old!==value)throw new ProjectContactError('이미 연결된 이메일은 이관 보완 화면에서 변경할 수 없습니다.',409);
    if(!value)continue;
    if(!isContactEmail(value))throw new ProjectContactError('올바른 MS 계정 이메일을 입력해 주세요.');
    result[key]=value;
  }
  return result;
}

export async function linkHistoricalContacts(client, project, state, contacts, actorId) {
  if(contacts.parties){
    const {requester,owners}=contacts.parties;
    const requesterId=await resolveContactUser(client,requester.name,requester.email,project.organization_id);
    const linked=[];
    for(const p of owners)linked.push({...p,id:String(await resolveContactUser(client,p.name,p.email,project.organization_id))});
    await client.query('update agent_portal.projects set requester_id=$2,owner_id=$3 where id=$1',[project.id,requesterId,linked[0].id]);
    for(const [relation,ids] of [['requester',[String(requesterId)]],['owner',linked.map(p=>p.id)]]){
      await client.query('update agent_portal.project_members set ended_at=now() where project_id=$1 and relationship=$2 and not(user_id=any($3::bigint[])) and ended_at is null',[project.id,relation,ids]);
      for(const id of ids)await client.query('insert into agent_portal.project_members(project_id,user_id,relationship,assigned_by) values($1,$2,$3,$4) on conflict(project_id,user_id,relationship) do update set ended_at=null,assigned_by=excluded.assigned_by',[project.id,id,relation,actorId]);
    }
    Object.assign(state,{requester:requester.name,requesterEmail:requester.email,requesterId:String(requesterId),projectOwners:linked,projectOwner:linked.map(p=>p.name).join(' · '),owner:linked.map(p=>p.name).join(' · '),ownerId:linked[0].id,projectOwnerEmail:linked[0].email,historicalContactsCompleted:contacts.complete===true});
    return;
  }
  for(const [key,email] of Object.entries(contacts)) {
    const requester=key==='requesterEmail';
    const label=requester?state.requester:state.projectOwner||state.owner;
    const userId=await resolveContactUser(client,label,email,project.organization_id);
    const relation=requester?'requester':'owner';
    await client.query(`update agent_portal.projects set ${requester?'requester_id':'owner_id'}=$2 where id=$1`,[project.id,userId]);
    await client.query('update agent_portal.project_members set ended_at=now() where project_id=$1 and relationship=$2 and user_id<>$3 and ended_at is null',[project.id,relation,userId]);
    await client.query(`insert into agent_portal.project_members(project_id,user_id,relationship,assigned_by) values($1,$2,$3,$4) on conflict(project_id,user_id,relationship) do update set ended_at=null,assigned_by=excluded.assigned_by`,[project.id,userId,relation,actorId]);
    state[key]=email;
    state[requester?'requesterId':'ownerId']=String(userId);
  }
}

export function registrationContacts(state, actor) {
  if (state.registrationEntry === 'INT_AGENT' && !state.historicalImport) {
    const requesterEmail = normalizeContactEmail(actor.email);
    if (!isContactEmail(requesterEmail)) throw new ProjectContactError('로그인한 MS 계정 이메일을 확인해 주세요.');
    const projectOwnerEmail=state.ownerMode==='SELF'?requesterEmail:normalizeContactEmail(state.projectOwnerEmail);
    if(state.ownerMode!=='SELF'&&!String(state.projectOwner||state.owner||'').trim())throw new ProjectContactError('Project Owner 이름을 입력해 주세요.');
    if(!isContactEmail(projectOwnerEmail))throw new ProjectContactError('Project Owner의 올바른 MS 계정 이메일을 입력해 주세요.');
    return {requesterEmail, projectOwnerEmail};
  }
  const requesterEmail = actor.app_role === 'general_user'
    ? normalizeContactEmail(actor.email)
    : normalizeContactEmail(state.requesterEmail) || emailFromPartyLabel(state.requester);
  const projectOwnerEmail = state.ownerMode === 'SELF'
    ? requesterEmail
    : normalizeContactEmail(state.projectOwnerEmail) || emailFromPartyLabel(state.projectOwner || state.owner);
  for (const [label, email] of [['요구자', requesterEmail], ['Project Owner', projectOwnerEmail]]) {
    if (!isContactEmail(email)) {
      throw new ProjectContactError(`${label}의 올바른 MS 계정 이메일을 입력해 주세요.`);
    }
  }
  return {requesterEmail, projectOwnerEmail};
}

// Reuse existing identities without renaming them, changing roles or reactivating accounts.
export async function resolveContactUser(client, label, email, organizationId) {
  if (!email) return null;
  if (!isContactEmail(email)) throw new ProjectContactError('올바른 MS 계정 이메일을 입력해 주세요.');
  const displayName = String(label || '').split('·')[0].trim() || email.split('@')[0];
  const result = await client.query(
    `insert into agent_portal.users
       (organization_id, team_id, email, display_name, app_role, is_active)
     values ($1,null,$2,$3,'general_user',true)
     on conflict (lower(email)) where email is not null do update set email=users.email
       where users.is_active=true and users.organization_id=excluded.organization_id
     returning id`,
    [organizationId, normalizeContactEmail(email), displayName],
  );
  if (!result.rows[0]) throw new ProjectContactError('비활성 계정 또는 다른 조직의 계정은 담당자로 지정할 수 없습니다. 관리자에게 확인해 주세요.', 409);
  return result.rows[0].id;
}
