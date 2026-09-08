import {emailFromPartyLabel, isContactEmail, normalizeContactEmail} from '../shared/project-contacts.mjs';

export class ProjectContactError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateHistoricalContactUpdate(state, update, actor) {
  const assigned=(state.developerIds||[]).map(String).includes(String(actor.id));
  if(!state.historicalImport || !(actor.app_role==='admin'||(actor.app_role!=='general_user'&&assigned)))throw new ProjectContactError('Admin 또는 지정 개발 담당자만 이관 연락처를 보완할 수 있습니다.',403);
  if(!update||typeof update!=='object'||Array.isArray(update))throw new ProjectContactError('연락처 입력을 확인해 주세요.');
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
  const requesterEmail = actor.app_role === 'general_user'
    ? normalizeContactEmail(actor.email)
    : normalizeContactEmail(state.requesterEmail) || emailFromPartyLabel(state.requester);
  const projectOwnerEmail = state.ownerMode === 'SELF'
    ? requesterEmail
    : normalizeContactEmail(state.projectOwnerEmail) || emailFromPartyLabel(state.projectOwner || state.owner);
  for (const [label, email] of [['요구자', requesterEmail], ['Project Owner', projectOwnerEmail]]) {
    if ((email || !state.historicalImport) && !isContactEmail(email)) {
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
