import { getPool, withTransaction } from "./db/pool.mjs";

const statusToDatabase = {
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  CHANGES_REQUESTED: "changes_requested",
  RECOMMENDED: "recommended",
  PUBLISHED: "published",
  REJECTED: "rejected",
};

async function ensurePortalCatalog(client) {
  const organization = await client.query(
    `insert into agent_portal.organizations (
       organization_code, organization_name, is_active
     ) values ($1, $2, true)
     on conflict (organization_code) do update set
       organization_name = excluded.organization_name,
       is_active = true,
       updated_at = now()
     returning id`,
    [
      process.env.PORTAL_ORGANIZATION_CODE || "CHANGSHIN_INC",
      process.env.PORTAL_ORGANIZATION_NAME || "창신INC",
    ],
  );
  const team = await client.query(
    `insert into agent_portal.teams (
       organization_id, team_code, team_name, team_type, is_active
     ) values ($1, $2, $3, 'ai_enablement', true)
     on conflict (organization_id, team_code) do update set
       team_name = excluded.team_name,
       team_type = 'ai_enablement',
       is_active = true,
       updated_at = now()
     returning id`,
    [
      organization.rows[0].id,
      process.env.PORTAL_AI_TEAM_CODE || "AI_ENABLEMENT",
      process.env.PORTAL_AI_TEAM_NAME || "AI 활성화팀",
    ],
  );
  return { organizationId: organization.rows[0].id, aiTeamId: team.rows[0].id };
}

export async function ensurePortalUser(client, identity) {
  if (!identity?.email) return null;
  const result = await client.query(
    `select id, email, display_name, app_role, is_active
       from agent_portal.users
      where lower(email) = lower($1) or ($2 <> '' and ms_account_id = $2)
      order by is_active desc, id
      limit 1`,
    [identity.email, identity.objectId || ""],
  );
  const user = result.rows[0] || null;
  const bootstrapRole = ["admin", "team_leader"].includes(identity.appRole)
    ? identity.appRole
    : null;

  if (user) {
    const synchronized = await client.query(
      `update agent_portal.users
          set ms_account_id = coalesce(nullif($2, ''), ms_account_id),
              email = $3,
              display_name = coalesce(nullif($4, ''), display_name),
              app_role = coalesce($5, app_role),
              is_active = true,
              last_login_at = now(),
              updated_at = now()
        where id = $1
        returning id, email, display_name, app_role, is_active`,
      [
        user.id,
        identity.objectId || "",
        identity.email,
        identity.displayName || "",
        bootstrapRole,
      ],
    );
    return synchronized.rows[0];
  }

  const catalog = await ensurePortalCatalog(client);
  const initialRole = bootstrapRole || "general_user";
  const teamId = ["team_member", "team_leader", "bts", "bp_solution", "admin"].includes(initialRole)
    ? catalog.aiTeamId
    : null;

  const created = await client.query(
    `insert into agent_portal.users (
       organization_id, team_id, ms_account_id, email, display_name,
       app_role, is_active, last_login_at
     ) values ($1,$2,nullif($3,''),$4,$5,$6,true,now())
     on conflict (lower(email)) where email is not null do update set
       team_id = excluded.team_id,
       ms_account_id = coalesce(excluded.ms_account_id, users.ms_account_id),
       display_name = excluded.display_name,
       app_role = case
         when excluded.app_role in ('admin', 'team_leader') then excluded.app_role
         else users.app_role
       end,
       is_active = true,
       last_login_at = now(),
       updated_at = now()
     returning id, email, display_name, app_role, is_active`,
    [
      catalog.organizationId,
      teamId,
      identity.objectId || "",
      identity.email,
      identity.displayName || identity.email.split("@")[0],
      initialRole,
    ],
  );
  return created.rows[0];
}

async function findUser(client, identity) {
  return ensurePortalUser(client, identity);
}

const gallerySelect = `
  select
    gs.submission_number as "id",
    case gs.source_kind when 'lifecycle_project' then 'OPERATIONS' else 'PERSONAL' end as "source",
    p.project_code as "projectNo",
    gs.agent_name as "name",
    gs.summary as "description",
    case gs.platform
      when 'vibe_coding' then 'Vibe Coding'
      when 'copilot_studio' then 'Copilot Studio'
      when 'power_automate' then 'Power Automate'
      when 'power_apps' then 'Power Apps'
      else '기타'
    end as "platform",
    case gs.artifact_kind
      when 'agent' then 'Agent'
      when 'app' then '업무 App'
      when 'flow' then '자동화 Flow'
      when 'automation' then '자동화 Flow'
      else '기타'
    end as "artifactType",
    gs.category as "category",
    gs.access_url as "accessUrl",
    gs.target_users as "targetUsers",
    case gs.data_classification
      when 'public' then '공개'
      when 'internal' then '사내'
      when 'confidential' then '기밀'
      else '개인정보 포함'
    end as "dataClass",
    gs.support_owner as "supportOwner",
    u.display_name || ' · ' ||
      case u.app_role
        when 'general_user' then '일반 User'
        when 'team_member' then 'AI 활성화팀 팀원'
        when 'team_leader' then 'AI 활성화팀 팀장'
        when 'bts' then 'BTS'
        when 'bp_solution' then '비피 솔루션'
        else 'admin'
      end as "applicant",
    to_char(gs.submitted_at at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI') as "submittedAt",
    upper(gs.submission_status) as "status",
    gs.evidence as "evidence",
    gs.reviewer_note as "reviewerNote"
  from agent_portal.gallery_submissions gs
  join agent_portal.users u on u.id = gs.submitted_by
  left join agent_portal.projects p on p.id = gs.project_id`;

async function listGalleryApplications(identity) {
  const pool = getPool();
  const user = await findUser(pool, identity);
  if (!user) return { status: 404, body: { error: "Active portal user not found." } };
  const canReview = ["team_member", "team_leader", "admin"].includes(user.app_role);
  const result = await pool.query(
    `${gallerySelect}
      ${canReview ? "" : "where gs.submitted_by = $1"}
      order by gs.submitted_at desc`,
    canReview ? [] : [user.id],
  );
  return { status: 200, body: { applications: result.rows } };
}

function normalizePlatform(value) {
  return {
    "Vibe Coding": "vibe_coding",
    "Copilot Studio": "copilot_studio",
    "Power Automate": "power_automate",
    "Power Apps": "power_apps",
  }[value] || "other";
}

function normalizeArtifact(value) {
  return {
    Agent: "agent",
    "업무 App": "app",
    "자동화 Flow": "flow",
  }[value] || "other";
}

function normalizeDataClass(value) {
  return {
    공개: "public",
    사내: "internal",
    기밀: "confidential",
    "개인정보 포함": "personal_data",
  }[value] || "internal";
}

function assertSubmission(body) {
  const required = [
    "id",
    "source",
    "name",
    "description",
    "platform",
    "artifactType",
    "category",
    "accessUrl",
    "targetUsers",
    "dataClass",
    "supportOwner",
  ];
  const missing = required.filter((key) => !String(body[key] || "").trim());
  if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);
  if (body.source === "OPERATIONS" && !body.projectNo) {
    throw new Error("projectNo is required for an operations submission.");
  }
}

async function createGalleryApplication(body, identity) {
  assertSubmission(body);
  return withTransaction(async (client) => {
    const actor = await findUser(client, identity);
    if (!actor || !["general_user", "team_member", "team_leader", "admin"].includes(actor.app_role)) {
      return { status: 403, body: { error: "An active portal User or AI Enablement Team member is required." } };
    }
    let projectId = null;
    if (body.source === "OPERATIONS") {
      const project = await client.query(
        `select p.id
           from agent_portal.projects p
          where p.project_code = $1
            and p.current_stage_code = 'OPS'
            and p.project_status = 'operating'
            and ($3 = true or p.owner_id = $2 or p.requester_id = $2 or exists (
              select 1 from agent_portal.project_members pm
               where pm.project_id = p.id and pm.user_id = $2
                 and pm.relationship in ('owner', 'requester') and pm.ended_at is null
            ))`,
        [body.projectNo, actor.id, ["team_member", "team_leader", "admin"].includes(actor.app_role)],
      );
      if (!project.rows[0]) {
        return { status: 409, body: { error: "The project is not eligible for Gallery submission." } };
      }
      projectId = project.rows[0].id;
    }
    await client.query(
      `insert into agent_portal.gallery_submissions (
        submission_number, source_kind, project_id, submitted_by,
        agent_name, summary, platform, artifact_kind, category, access_url,
        target_users, data_classification, support_owner, evidence, submission_status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,'submitted')`,
      [
        body.id,
        body.source === "OPERATIONS" ? "lifecycle_project" : "personal_build",
        projectId,
        actor.id,
        body.name,
        body.description,
        normalizePlatform(body.platform),
        normalizeArtifact(body.artifactType),
        body.category,
        body.accessUrl,
        body.targetUsers,
        normalizeDataClass(body.dataClass),
        body.supportOwner,
        JSON.stringify(Array.isArray(body.evidence) ? body.evidence : []),
      ],
    );
    const created = await client.query(
      `${gallerySelect} where gs.submission_number = $1`,
      [body.id],
    );
    return { status: 201, body: { application: created.rows[0] } };
  });
}

async function updateGalleryApplication(submissionNumber, body, identity) {
  const databaseStatus = statusToDatabase[body.status];
  if (!databaseStatus) throw new Error("Invalid review status.");
  return withTransaction(async (client) => {
    const existing = await client.query(
      `select id, agent_name, submitted_by from agent_portal.gallery_submissions
        where submission_number = $1 for update`,
      [submissionNumber],
    );
    if (!existing.rows[0]) return { status: 404, body: { error: "Submission not found." } };
    const actor = await findUser(client, identity);
    if (!actor) return { status: 403, body: { error: "Active portal user not found." } };

    if (databaseStatus === "submitted") {
      if (actor.app_role !== "admin" && (actor.app_role !== "general_user" || actor.id !== existing.rows[0].submitted_by)) {
        return { status: 403, body: { error: "Only the original applicant can resubmit." } };
      }
      await client.query(
        `update agent_portal.gallery_submissions
            set submission_status = 'submitted',
                agent_name = coalesce(nullif($2, ''), agent_name),
                summary = coalesce(nullif($3, ''), summary),
                platform = coalesce($4, platform),
                artifact_kind = coalesce($5, artifact_kind),
                category = coalesce(nullif($6, ''), category),
                access_url = coalesce(nullif($7, ''), access_url),
                target_users = coalesce(nullif($8, ''), target_users),
                data_classification = coalesce($9, data_classification),
                support_owner = coalesce(nullif($10, ''), support_owner),
                evidence = coalesce($11::jsonb, evidence),
                reviewer_note = null,
                submitted_at = now()
          where submission_number = $1`,
        [
          submissionNumber,
          body.name || "",
          body.description || "",
          body.platform ? normalizePlatform(body.platform) : null,
          body.artifactType ? normalizeArtifact(body.artifactType) : null,
          body.category || "",
          body.accessUrl || "",
          body.targetUsers || "",
          body.dataClass ? normalizeDataClass(body.dataClass) : null,
          body.supportOwner || "",
          Array.isArray(body.evidence) ? JSON.stringify(body.evidence) : null,
        ],
      );
    } else {
      if (!["team_member", "team_leader", "admin"].includes(actor.app_role)) {
        return { status: 403, body: { error: "AI Enablement Team review permission is required." } };
      }
      if (databaseStatus === "published" && !["team_leader", "admin"].includes(actor.app_role)) {
        return { status: 403, body: { error: "Only the AI Enablement Team leader can publish." } };
      }
      if (actor.app_role === "admin") {
        await client.query(
          `update agent_portal.gallery_submissions
              set agent_name = coalesce(nullif($2, ''), agent_name),
                  summary = coalesce(nullif($3, ''), summary),
                  platform = coalesce($4, platform),
                  artifact_kind = coalesce($5, artifact_kind),
                  category = coalesce(nullif($6, ''), category),
                  access_url = coalesce(nullif($7, ''), access_url),
                  target_users = coalesce(nullif($8, ''), target_users),
                  data_classification = coalesce($9, data_classification),
                  support_owner = coalesce(nullif($10, ''), support_owner),
                  evidence = coalesce($11::jsonb, evidence),
                  updated_at = now()
            where submission_number = $1`,
          [
            submissionNumber,
            body.name || "",
            body.description || "",
            body.platform ? normalizePlatform(body.platform) : null,
            body.artifactType ? normalizeArtifact(body.artifactType) : null,
            body.category || "",
            body.accessUrl || "",
            body.targetUsers || "",
            body.dataClass ? normalizeDataClass(body.dataClass) : null,
            body.supportOwner || "",
            Array.isArray(body.evidence) ? JSON.stringify(body.evidence) : null,
          ],
        );
      }
      const decision = {
        changes_requested: "changes_requested",
        recommended: "recommended",
        published: "published",
        rejected: "rejected",
      }[databaseStatus];
      if (decision) {
        await client.query(
          `insert into agent_portal.gallery_reviews (
            gallery_submission_id, reviewer_id, review_role, decision,
            access_verified, data_policy_verified, safety_notice_verified,
            operation_owner_verified, review_note
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            existing.rows[0].id,
            actor.id,
            actor.app_role === "admin" ? "team_leader" : actor.app_role,
            decision,
            Boolean(body.checks?.access),
            Boolean(body.checks?.dataPolicy),
            Boolean(body.checks?.safetyNotice),
            Boolean(body.checks?.operationOwner),
            body.reviewerNote || null,
          ],
        );
      }
      await client.query(
        `update agent_portal.gallery_submissions
            set submission_status = $2, reviewer_note = $3
          where submission_number = $1`,
        [submissionNumber, databaseStatus, body.reviewerNote || null],
      );
      if (databaseStatus === "published") {
        const slug = `agent-${submissionNumber.toLowerCase()}`;
        await client.query(
          `insert into agent_portal.gallery_entries (
            gallery_submission_id, slug, published_by, visibility
          ) values ($1,$2,$3,'company')
          on conflict (gallery_submission_id) do update set
            published_by = excluded.published_by,
            retired_at = null,
            updated_at = now()`,
          [existing.rows[0].id, slug, actor.id],
        );
      }
    }

    const updated = await client.query(
      `${gallerySelect} where gs.submission_number = $1`,
      [submissionNumber],
    );
    return { status: 200, body: { application: updated.rows[0] } };
  });
}

async function deleteGalleryApplication(submissionNumber, identity) {
  return withTransaction(async (client) => {
    const actor = await findUser(client, identity);
    if (!actor || actor.app_role !== "admin") {
      return { status: 403, body: { error: "Admin permission is required." } };
    }
    const existing = (await client.query(
      `select id, agent_name from agent_portal.gallery_submissions
        where submission_number=$1 for update`, [submissionNumber],
    )).rows[0];
    if (!existing) return { status: 404, body: { error: "Submission not found." } };
    await client.query(`delete from agent_portal.gallery_entries where gallery_submission_id=$1`, [existing.id]);
    await client.query(`delete from agent_portal.gallery_submissions where id=$1`, [existing.id]);
    await client.query(
      `insert into agent_portal.audit_logs (actor_user_id, action_code, entity_type, entity_id, before_data)
       values ($1,'GALLERY_DELETE','gallery_submission',$2,$3::jsonb)`,
      [actor.id, submissionNumber, JSON.stringify({ name: existing.agent_name })],
    );
    return { status: 200, body: { deleted: true, id: submissionNumber } };
  });
}

async function health() {
  const result = await getPool().query(
    `select current_database() as database,
            current_user as database_user,
            to_regclass('agent_portal.projects') is not null as schema_ready,
            now() as checked_at`,
  );
  return { status: 200, body: { ok: true, ...result.rows[0] } };
}

const governanceRoles = new Set(["team_member", "team_leader", "admin"]);
const teamWorkspaceRoles = new Set(["team_member", "team_leader", "bts", "bp_solution", "admin"]);

async function governanceActor(client, identity) {
  const actor = await findUser(client, identity);
  if (!actor || !actor.is_active || !governanceRoles.has(actor.app_role)) return null;
  return actor;
}

async function listGovernanceUsers(identity) {
  const pool = getPool();
  const actor = await governanceActor(pool, identity);
  if (!actor) return { status: 403, body: { error: "AI Enablement Team permission is required." } };
  const bootstrapLeaders = new Set(String(process.env.PORTAL_BOOTSTRAP_LEADER_EMAILS || process.env.PORTAL_TEAM_LEADER_EMAILS || "").toLowerCase().split(/[;,\s]+/).filter(Boolean));
  const bootstrapAdmins = new Set(String(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAILS || process.env.PORTAL_ADMIN_EMAILS || "").toLowerCase().split(/[;,\s]+/).filter(Boolean));
  const catalog = await ensurePortalCatalog(pool);
  const leaderEmails = [...bootstrapLeaders].filter((email) => !bootstrapAdmins.has(email));
  if (leaderEmails.length) {
    await pool.query(
      `insert into agent_portal.users
         (organization_id, team_id, email, display_name, app_role, is_active)
       select $1, $2, configured.email, split_part(configured.email, '@', 1),
              'team_leader', true
         from unnest($3::text[]) as configured(email)
       on conflict (lower(email)) where email is not null do update set
         team_id = excluded.team_id,
         app_role = 'team_leader',
         is_active = true,
         updated_at = now()`,
      [catalog.organizationId, catalog.aiTeamId, leaderEmails],
    );
  }
  if (bootstrapAdmins.size) {
    await pool.query(
      `insert into agent_portal.users
         (organization_id, team_id, email, display_name, app_role, is_active)
       select $1, $2, configured.email, split_part(configured.email, '@', 1),
              'admin', true
         from unnest($3::text[]) as configured(email)
       on conflict (lower(email)) where email is not null do update set
         team_id = excluded.team_id,
         app_role = 'admin',
         is_active = true,
         updated_at = now()`,
      [catalog.organizationId, catalog.aiTeamId, [...bootstrapAdmins]],
    );
  }
  const result = await pool.query(
    `select u.id, u.email, u.display_name as "displayName", u.app_role as "appRole",
            u.is_active as "isActive", u.last_login_at as "lastLoginAt",
            t.team_name as "teamName"
       from agent_portal.users u
       left join agent_portal.teams t on t.id = u.team_id
      where u.app_role in ('team_leader','team_member','bts','bp_solution','admin')
      order by case u.app_role when 'admin' then 1 when 'team_leader' then 2
                 when 'team_member' then 3 when 'bts' then 4 when 'bp_solution' then 5 else 6 end,
               u.display_name, u.email`,
  );
  const users = result.rows.map((user) => ({
    ...user,
    roleSource: bootstrapAdmins.has(user.email.toLowerCase())
      ? "bootstrap_admin"
      : bootstrapLeaders.has(user.email.toLowerCase())
        ? "bootstrap_leader"
        : "portal_database",
  }));
  return { status: 200, body: { users, actorRole: actor.app_role } };
}

function allowedRoleChange(actorRole, newRole) {
  if (actorRole === "admin") return ["general_user", "team_member", "team_leader", "bts", "bp_solution", "admin"].includes(newRole);
  return actorRole === "team_leader" && ["general_user", "team_member", "bts", "bp_solution"].includes(newRole);
}

async function registerGovernanceUser(body, identity) {
  const email = String(body.email || "").trim().toLowerCase();
  const displayName = String(body.displayName || "").trim();
  const newRole = String(body.appRole || "team_member");
  if (!['team_member', 'team_leader', 'bts', 'bp_solution', 'admin'].includes(newRole)) {
    return { status: 400, body: { error: "Only AI Enablement Team accounts can be registered here." } };
  }
  if (!email || !email.includes("@") || !displayName) {
    return { status: 400, body: { error: "Name and a valid MS account email are required." } };
  }
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    if (!actor || !allowedRoleChange(actor.app_role, newRole)) {
      return { status: 403, body: { error: "Role assignment permission is required." } };
    }
    const catalog = await ensurePortalCatalog(client);
    const existing = await client.query(
      `select id, app_role from agent_portal.users where lower(email) = lower($1) limit 1 for update`,
      [email],
    );
    let user;
    if (existing.rows[0]?.app_role === "general_user") {
      user = (await client.query(
        `update agent_portal.users
            set app_role=$2, team_id=$3, display_name=$4, is_active=true, updated_at=now()
          where id=$1
          returning id, email, display_name as "displayName", app_role as "appRole", is_active as "isActive"`,
        [existing.rows[0].id, newRole, catalog.aiTeamId, displayName],
      )).rows[0];
      await client.query(
        `insert into agent_portal.user_role_history (user_id, previous_role, new_role, changed_by, change_reason)
         values ($1,'general_user',$2,$3,$4)`,
        [user.id, newRole, actor.id, "Admin & Governance 수행 계정 등록"],
      );
    } else if (existing.rows[0]) {
      return { status: 409, body: { error: "This MS account is already registered in the project roster." } };
    } else {
      user = (await client.query(
        `insert into agent_portal.users (organization_id, team_id, email, display_name, app_role, is_active)
         values ($1,case when $4 in ('team_member','team_leader','bts','bp_solution','admin') then $2 else null end,$3,$5,$4,true)
         returning id, email, display_name as "displayName", app_role as "appRole", is_active as "isActive"`,
        [catalog.organizationId, catalog.aiTeamId, email, newRole, displayName],
      )).rows[0];
      await client.query(
        `insert into agent_portal.user_role_history (user_id, previous_role, new_role, changed_by, change_reason)
         values ($1,null,$2,$3,$4)`,
        [user.id, newRole, actor.id, "Admin & Governance 사전 등록"],
      );
    }
    return { status: 201, body: { user } };
  });
}

async function updateGovernanceUser(userId, body, identity) {
  const newRole = String(body.appRole || "");
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    if (!actor || !allowedRoleChange(actor.app_role, newRole)) {
      return { status: 403, body: { error: "Role assignment permission is required." } };
    }
    const target = (await client.query(
      `select id, app_role, is_active from agent_portal.users where id=$1 for update`, [userId],
    )).rows[0];
    if (!target) return { status: 404, body: { error: "User not found." } };
    if (target.id === actor.id) return { status: 409, body: { error: "You cannot change your own role." } };
    if (actor.app_role === "team_leader" && !["general_user", "team_member", "bts", "bp_solution"].includes(target.app_role)) {
      return { status: 403, body: { error: "Team leaders can only manage general users, AI Enablement Team members, and BTS users." } };
    }
    if (target.app_role === "admin" && newRole !== "admin") {
      const count = await client.query(`select count(*)::int as count from agent_portal.users where app_role='admin' and is_active=true`);
      if (count.rows[0].count <= 1) return { status: 409, body: { error: "The last active admin cannot be demoted." } };
    }
    const catalog = await ensurePortalCatalog(client);
    const updated = (await client.query(
      `update agent_portal.users set app_role=$2,
              team_id=case when $2 in ('team_member','team_leader','bts','bp_solution','admin') then $3 else null end,
              updated_at=now() where id=$1
       returning id, email, display_name as "displayName", app_role as "appRole", is_active as "isActive"`,
      [target.id, newRole, catalog.aiTeamId],
    )).rows[0];
    if (target.app_role !== newRole) await client.query(
      `insert into agent_portal.user_role_history (user_id, previous_role, new_role, changed_by, change_reason)
       values ($1,$2,$3,$4,$5)`,
      [target.id, target.app_role, newRole, actor.id, String(body.reason || "Admin & Governance 역할 변경")],
    );
    return { status: 200, body: { user: updated } };
  });
}

async function listRoleHistory(identity) {
  const pool = getPool();
  const actor = await governanceActor(pool, identity);
  if (!actor) return { status: 403, body: { error: "AI Enablement Team permission is required." } };
  const result = await pool.query(
    `select h.id, u.display_name as "userName", u.email, h.previous_role as "previousRole",
            h.new_role as "newRole", a.display_name as "changedBy", h.change_reason as reason,
            h.changed_at as "changedAt"
       from agent_portal.user_role_history h
       join agent_portal.users u on u.id=h.user_id
       left join agent_portal.users a on a.id=h.changed_by
      order by h.changed_at desc limit 200`,
  );
  return { status: 200, body: { history: result.rows } };
}

async function listTeamWorkload(identity) {
  const pool = getPool();
  const actor = await findUser(pool, identity);
  if (!actor || !actor.is_active || !teamWorkspaceRoles.has(actor.app_role)) {
    return { status: 403, body: { error: "Team workspace permission is required." } };
  }

  const [memberResult, projectResult] = await Promise.all([
    pool.query(
      `select u.id::text as id, u.email, u.display_name as "displayName",
              u.app_role as "appRole", u.job_title as "jobTitle"
         from agent_portal.users u
        where u.is_active = true
          and u.app_role in ('team_leader','team_member','bts','bp_solution','admin')
        order by case u.app_role when 'team_leader' then 1 when 'team_member' then 2
                   when 'bts' then 3 when 'bp_solution' then 4 else 5 end,
                 u.display_name, u.email`,
    ),
    pool.query(
      `select p.project_code as id, p.project_name as title,
              p.project_category as category,
              coalesce(rt.team_name, '미지정') as "requestTeam",
              requester.display_name as requester,
              p.project_status as "projectStatus", p.current_stage_code as "stageCode",
              ls.stage_name as stage, p.progress_percent as progress,
              p.priority, p.risk_level as "riskLevel", p.next_action as "nextAction",
              coalesce(p.committed_completion_date, p.requested_completion_date) as "dueDate",
              p.created_at as "createdAt",
              coalesce(
                array_agg(distinct assigned.id::text)
                  filter (where assigned.id is not null),
                array[]::text[]
              ) as "assignedUserIds",
              coalesce(
                string_agg(distinct assigned.display_name, ' · ')
                  filter (where assigned.id is not null),
                '미배정'
              ) as assignee
         from agent_portal.projects p
         join agent_portal.lifecycle_stages ls on ls.stage_code = p.current_stage_code
         join agent_portal.users requester on requester.id = p.requester_id
         left join agent_portal.teams rt on rt.id = p.request_team_id
         left join agent_portal.project_members pm
           on pm.project_id = p.id and pm.ended_at is null
          and pm.relationship in ('developer','reviewer','operator','security_reviewer','observer')
         left join agent_portal.users assigned
           on assigned.id = pm.user_id and assigned.is_active = true
          and assigned.app_role in ('team_leader','team_member','bts','bp_solution','admin')
        where p.deleted_at is null
        group by p.id, rt.team_name, requester.display_name, ls.stage_name
        order by p.updated_at desc, p.project_code desc`,
    ),
  ]);

  const statusLabel = (status) => {
    if (["operating", "retired"].includes(status)) return "완료";
    if (["draft", "submitted"].includes(status)) return "신규 접수";
    return "진행 중";
  };
  const riskLabel = (risk) => ({
    normal: "정상",
    attention: "확인 필요",
    delayed: "지연 위험",
    blocked: "지연 위험",
  })[risk] || "정상";
  const priorityLabel = (priority) => ({
    low: "보통",
    normal: "보통",
    high: "높음",
    urgent: "높음",
  })[priority] || "보통";

  const projects = projectResult.rows.map((project) => ({
    ...project,
    status: statusLabel(project.projectStatus),
    risk: riskLabel(project.riskLevel),
    priority: priorityLabel(project.priority),
    progress: Number(project.progress || 0),
    nextAction: project.nextAction || "다음 작업 확인 필요",
    dueDate: project.dueDate
      ? new Date(project.dueDate).toISOString().slice(0, 10)
      : "",
    received: new Date(project.createdAt).toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    }).replace(/\. /g, ".").replace(/\.$/, ""),
  }));
  return { status: 200, body: { members: memberResult.rows, projects } };
}

async function assignProjectDeveloper(projectCode, body, identity) {
  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { status: 400, body: { error: "A valid project assignee is required." } };
  }
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    if (!actor || actor.app_role !== "admin") {
      return { status: 403, body: { error: "Admin permission is required to assign a developer." } };
    }
    const project = (await client.query(
      `select id from agent_portal.projects
        where project_code=$1 and deleted_at is null
        limit 1 for update`,
      [projectCode],
    )).rows[0];
    if (!project) return { status: 404, body: { error: "Project not found." } };
    const assignee = (await client.query(
      `select id, display_name as "displayName", app_role as "appRole"
         from agent_portal.users
        where id=$1 and is_active=true and app_role <> 'general_user'
        limit 1`,
      [userId],
    )).rows[0];
    if (!assignee) {
      return { status: 400, body: { error: "Select an active non-general-user account." } };
    }
    await client.query(
      `update agent_portal.project_members
          set ended_at=now()
        where project_id=$1 and relationship='developer' and ended_at is null and user_id<>$2`,
      [project.id, assignee.id],
    );
    await client.query(
      `insert into agent_portal.project_members
         (project_id, user_id, relationship, assigned_by, assigned_at, ended_at)
       values ($1,$2,'developer',$3,now(),null)
       on conflict (project_id,user_id,relationship)
       do update set assigned_by=excluded.assigned_by, assigned_at=now(), ended_at=null`,
      [project.id, assignee.id, actor.id],
    );
    return { status: 200, body: { projectCode, assignee } };
  });
}

export async function handleDatabaseRequest({ method, pathname, body = {}, identity }) {
  if (method === "GET" && pathname === "/health") return health();
  if (method === "GET" && pathname === "/gallery/applications") {
    return listGalleryApplications(identity);
  }
  if (method === "POST" && pathname === "/gallery/applications") {
    return createGalleryApplication(body, identity);
  }
  if (method === "PATCH" && pathname.startsWith("/gallery/applications/")) {
    const id = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!id) throw new Error("Submission number is required.");
    return updateGalleryApplication(id, body, identity);
  }
  if (method === "DELETE" && pathname.startsWith("/gallery/applications/")) {
    const id = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!id) return { status: 400, body: { error: "Submission number is required." } };
    return deleteGalleryApplication(id, identity);
  }
  if (method === "GET" && pathname === "/governance/users") return listGovernanceUsers(identity);
  if (method === "POST" && pathname === "/governance/users") return registerGovernanceUser(body, identity);
  if (method === "PATCH" && pathname.startsWith("/governance/users/")) {
    const id = Number(pathname.split("/").filter(Boolean).at(-1));
    if (!Number.isInteger(id) || id <= 0) return { status: 400, body: { error: "Valid user id is required." } };
    return updateGovernanceUser(id, body, identity);
  }
  if (method === "GET" && pathname === "/governance/role-history") return listRoleHistory(identity);
  if (method === "GET" && pathname === "/team/workload") return listTeamWorkload(identity);
  if (method === "PUT" && pathname.startsWith("/team/projects/") && pathname.endsWith("/developer")) {
    const parts = pathname.split("/").filter(Boolean);
    const projectCode = decodeURIComponent(parts.at(-2) || "");
    if (!projectCode) return { status: 400, body: { error: "Project code is required." } };
    return assignProjectDeveloper(projectCode, body, identity);
  }
  return { status: 404, body: { error: "Route not found." } };
}
