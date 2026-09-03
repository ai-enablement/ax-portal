import {emailFromPartyLabel, isContactEmail, normalizeContactEmail} from '../shared/project-contacts.mjs';

export class ProjectContactError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
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
