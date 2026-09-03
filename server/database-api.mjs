import { getPool, withTransaction } from "./db/pool.mjs";
import { completeHistoricalGateApprovals, persistHistoricalGateApprovals } from "./historical-gate-approvals.mjs";
import { persistStandardDocuments } from "./standard-documents.mjs";

const statusToDatabase = {
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  CHANGES_REQUESTED: "changes_requested",
  RECOMMENDED: "recommended",
  PUBLISHED: "published",
  REJECTED: "rejected",
};

const portalJourneyStageCodes = ["INT", "FEA", "G1", "ARD", "G2", "DES", "G3", "PILOT", "G4", "OPS"];
const portalProjectCategories = new Set(["개별 접수", "아이디어톤", "D2B", "RPA(기존 과제)", "기타"]);

function portalStageCode(journeyStep) {
  const index = Math.max(0, Math.min(portalJourneyStageCodes.length - 1, Number(journeyStep) || 0));
  return portalJourneyStageCodes[index];
}

function portalJourneyStep(stageCode) {
  if (["EVP", "EVR"].includes(stageCode)) return 5;
  const index = portalJourneyStageCodes.indexOf(stageCode);
  return index >= 0 ? index : 0;
}

function databaseProjectStatus(journeyStep, state = {}) {
  if (state.g2ReworkState === "editing") return "rework";
  if (Number(journeyStep) >= 9) return "operating";
  if ([2, 4, 6, 8].includes(Number(journeyStep))) return "in_review";
  if (Number(journeyStep) === 0) return "submitted";
  return "in_progress";
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;
}

function assertPortalProjectState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project state is required.");
  if (!String(value.name || "").trim()) throw new Error("Project name is required.");
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 1024 * 1024) throw new Error("Project state exceeds 1 MB.");
  return JSON.parse(serialized);
}

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
    `select u.id, coalesce(u.email, '') as email, u.display_name as "displayName", u.app_role as "appRole",
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
    roleSource: bootstrapAdmins.has(String(user.email || "").toLowerCase())
      ? "bootstrap_admin"
      : bootstrapLeaders.has(String(user.email || "").toLowerCase())
        ? "bootstrap_leader"
        : "portal_database",
  }));
  return { status: 200, body: { users, actorRole: actor.app_role } };
}

function allowedRoleChange(actorRole, newRole) {
  if (actorRole === "admin") return ["general_user", "team_member", "team_leader", "bts", "bp_solution", "admin"].includes(newRole);
  return actorRole === "team_leader" && ["general_user", "team_member", "bts", "bp_solution"].includes(newRole);
}

function bootstrapAccountSource(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const leaders = new Set(String(process.env.PORTAL_BOOTSTRAP_LEADER_EMAILS || process.env.PORTAL_TEAM_LEADER_EMAILS || "").toLowerCase().split(/[;,\s]+/).filter(Boolean));
  const admins = new Set(String(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAILS || process.env.PORTAL_ADMIN_EMAILS || "").toLowerCase().split(/[;,\s]+/).filter(Boolean));
  if (admins.has(normalized)) return "bootstrap_admin";
  if (leaders.has(normalized)) return "bootstrap_leader";
  return null;
}

async function registerGovernanceUser(body, identity) {
  const email = String(body.email || "").trim().toLowerCase();
  const displayName = String(body.displayName || "").trim();
  const newRole = String(body.appRole || "team_member");
  const emailOptional = ["bts", "bp_solution"].includes(newRole);
  if (!['team_member', 'team_leader', 'bts', 'bp_solution', 'admin'].includes(newRole)) {
    return { status: 400, body: { error: "Only AI Enablement Team accounts can be registered here." } };
  }
  if (!displayName || (!emailOptional && (!email || !email.includes("@"))) || (email && !email.includes("@"))) {
    return { status: 400, body: { error: emailOptional ? "Name and a valid MS account email, when provided, are required." : "Name and a valid MS account email are required." } };
  }
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    if (!actor || !allowedRoleChange(actor.app_role, newRole)) {
      return { status: 403, body: { error: "Role assignment permission is required." } };
    }
    const catalog = await ensurePortalCatalog(client);
    const existing = email
      ? await client.query(
          `select id, app_role from agent_portal.users where lower(email) = lower($1) limit 1 for update`,
          [email],
        )
      : { rows: [] };
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
         values ($1,case when $4 in ('team_member','team_leader','bts','bp_solution','admin') then $2::bigint else null end,nullif($3,''),$5,$4,true)
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
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    const target = (await client.query(
      `select id, email, display_name, app_role, is_active
         from agent_portal.users where id=$1 for update`, [userId],
    )).rows[0];
    if (!target) return { status: 404, body: { error: "User not found." } };
    const newRole = String(body.appRole || target.app_role);
    const email = String(body.email ?? target.email ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? target.display_name ?? "").trim();
    const emailOptional = ["bts", "bp_solution"].includes(newRole);
    if (!actor || !allowedRoleChange(actor.app_role, newRole)) {
      return { status: 403, body: { error: "Role assignment permission is required." } };
    }
    if (!displayName || (!emailOptional && (!email || !email.includes("@"))) || (email && !email.includes("@"))) {
      return { status: 400, body: { error: emailOptional ? "Name and a valid MS account email, when provided, are required." : "Name and a valid MS account email are required." } };
    }
    if (target.id === actor.id) return { status: 409, body: { error: "You cannot change your own role." } };
    if (bootstrapAccountSource(target.email) && (email !== String(target.email || "").toLowerCase() || newRole !== target.app_role)) {
      return { status: 409, body: { error: "Bootstrap account email and role must be changed in Azure App Service settings." } };
    }
    if (actor.app_role === "team_leader" && !["general_user", "team_member", "bts", "bp_solution"].includes(target.app_role)) {
      return { status: 403, body: { error: "Team leaders can only manage general users, AI Enablement Team members, and BTS users." } };
    }
    if (target.app_role === "admin" && newRole !== "admin") {
      const count = await client.query(`select count(*)::int as count from agent_portal.users where app_role='admin' and is_active=true`);
      if (count.rows[0].count <= 1) return { status: 409, body: { error: "The last active admin cannot be demoted." } };
    }
    const duplicate = email
      ? await client.query(
          `select id from agent_portal.users where lower(email)=lower($1) and id<>$2 limit 1`,
          [email, target.id],
        )
      : { rows: [] };
    if (duplicate.rows[0]) return { status: 409, body: { error: "This MS account email is already registered." } };
    const catalog = await ensurePortalCatalog(client);
    const updated = (await client.query(
      `update agent_portal.users set app_role=$2,
              team_id=case when $2 in ('team_member','team_leader','bts','bp_solution','admin') then $3::bigint else null end,
              email=nullif($4,''), display_name=$5, is_active=true,
              updated_at=now() where id=$1
       returning id, email, display_name as "displayName", app_role as "appRole", is_active as "isActive"`,
      [target.id, newRole, catalog.aiTeamId, email, displayName],
    )).rows[0];
    if (target.app_role !== newRole) await client.query(
      `insert into agent_portal.user_role_history (user_id, previous_role, new_role, changed_by, change_reason)
       values ($1,$2,$3,$4,$5)`,
      [target.id, target.app_role, newRole, actor.id, String(body.reason || "Admin & Governance 역할 변경")],
    );
    return { status: 200, body: { user: updated } };
  });
}

async function deleteGovernanceUser(userId, identity) {
  return withTransaction(async (client) => {
    const actor = await governanceActor(client, identity);
    if (!actor) return { status: 403, body: { error: "Account management permission is required." } };
    const target = (await client.query(
      `select id, email, app_role, is_active from agent_portal.users where id=$1 for update`,
      [userId],
    )).rows[0];
    if (!target) return { status: 404, body: { error: "User not found." } };
    if (target.id === actor.id) return { status: 409, body: { error: "You cannot delete your own account." } };
    if (bootstrapAccountSource(target.email)) {
      return { status: 409, body: { error: "Bootstrap accounts must be removed from Azure App Service settings first." } };
    }
    if (actor.app_role === "team_leader" && !["team_member", "bts", "bp_solution"].includes(target.app_role)) {
      return { status: 403, body: { error: "Team leaders can only delete team member, BTS, or BP Solution accounts." } };
    }
    if (actor.app_role !== "admin" && actor.app_role !== "team_leader") {
      return { status: 403, body: { error: "Admin or team leader permission is required." } };
    }
    if (target.app_role === "admin") {
      const count = await client.query(`select count(*)::int as count from agent_portal.users where app_role='admin' and is_active=true`);
      if (count.rows[0].count <= 1) return { status: 409, body: { error: "The last active admin cannot be deleted." } };
    }
    await client.query(
      `update agent_portal.users
          set app_role='general_user', team_id=null, is_active=false, updated_at=now()
        where id=$1`,
      [target.id],
    );
    await client.query(
      `insert into agent_portal.user_role_history
         (user_id, previous_role, new_role, changed_by, change_reason)
       values ($1,$2,'general_user',$3,$4)`,
      [target.id, target.app_role, actor.id, "Admin & Governance 계정 삭제 · 이력 보존"],
    );
    return { status: 200, body: { deleted: true, id: target.id } };
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

async function resolveProjectParty(client, label, actor, catalog) {
  const parts = String(label || "").split("·").map((part) => part.trim()).filter(Boolean);
  const email = parts.find((part) => part.includes("@"))?.toLowerCase();
  if (!email) return actor.id;
  const displayName = parts[0] || email.split("@")[0];
  const user = (await client.query(
    `insert into agent_portal.users
       (organization_id, team_id, email, display_name, app_role, is_active)
     values ($1,null,$2,$3,'general_user',true)
     on conflict (lower(email)) where email is not null do update set
       display_name=coalesce(nullif(excluded.display_name,''),users.display_name),
       is_active=true,
       updated_at=now()
     returning id`,
    [catalog.organizationId, email, displayName],
  )).rows[0];
  return user.id;
}

function portalProjectFromRow(row) {
  const runtime = row.runtimeState && typeof row.runtimeState === "object" && !Array.isArray(row.runtimeState)
    ? row.runtimeState
    : {};
  const journeyStep = portalJourneyStep(row.stageCode);
  const developers = Array.isArray(row.developers) ? row.developers : [];
  const receivedDate = row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : "";
  return {
    ...runtime,
    no: row.projectCode,
    name: row.projectName,
    category: row.projectCategory || "개별 접수",
    description: row.projectSummary || runtime.description || "",
    journeyStep,
    stage: Math.max(1, portalJourneyStageCodes.slice(0, journeyStep + 1).filter((code) => !code.startsWith("G")).length),
    progress: Number(row.progressPercent || 0),
    nextAction: row.nextAction || runtime.nextAction || "다음 작업 확인 필요",
    requestedDate: row.requestedCompletionDate ? new Date(row.requestedCompletionDate).toISOString().slice(0, 10) : runtime.requestedDate || "",
    receivedDate: runtime.receivedDate || receivedDate,
    owner: runtime.owner || row.ownerName || row.requesterName,
    requester: runtime.requester || row.requesterName,
    projectOwner: runtime.projectOwner || row.ownerName || row.requesterName,
    developerIds: developers.map((developer) => String(developer.id)),
    developerNames: developers.map((developer) => developer.name),
    handler: developers.length ? developers.map((developer) => developer.name).join(" · ") : "담당자 배정 필요",
    updated: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : receivedDate,
    source: "database",
  };
}

async function listOperationalProjects(identity) {
  const pool = getPool();
  const actor = await findUser(pool, identity);
  if (!actor || !actor.is_active) return { status: 403, body: { error: "Active portal account is required." } };
  const result = await pool.query(
    `select p.project_code as "projectCode", p.project_name as "projectName",
            p.project_category as "projectCategory", p.project_summary as "projectSummary",
            p.current_stage_code as "stageCode", p.project_status as "projectStatus",
            p.progress_percent as "progressPercent", p.next_action as "nextAction",
            p.requested_completion_date as "requestedCompletionDate",
            p.created_at as "createdAt", p.updated_at as "updatedAt",
            requester.display_name as "requesterName", owner_user.display_name as "ownerName",
            ir.raw_answers->'portalState' as "runtimeState",
            coalesce((
              select jsonb_agg(jsonb_build_object('id',u.id::text,'name',u.display_name) order by pm.assigned_at)
                from agent_portal.project_members pm
                join agent_portal.users u on u.id=pm.user_id
               where pm.project_id=p.id and pm.relationship='developer' and pm.ended_at is null
            ),'[]'::jsonb) as developers
       from agent_portal.projects p
       join agent_portal.users requester on requester.id=p.requester_id
       left join agent_portal.users owner_user on owner_user.id=p.owner_id
       left join agent_portal.intake_requests ir on ir.project_id=p.id
      where p.deleted_at is null
        and (
          $2 in ('admin','team_leader')
          or ($2='team_member' and (p.current_stage_code in ('INT','FEA') or p.requester_id=$1 or p.owner_id=$1 or exists (
            select 1 from agent_portal.project_members access_pm where access_pm.project_id=p.id and access_pm.user_id=$1 and access_pm.ended_at is null
          )))
          or ($2 in ('bts','bp_solution') and exists (
            select 1 from agent_portal.project_members access_pm where access_pm.project_id=p.id and access_pm.user_id=$1 and access_pm.ended_at is null
          ))
          or ($2='general_user' and (p.requester_id=$1 or p.owner_id=$1 or exists (
            select 1 from agent_portal.project_members access_pm where access_pm.project_id=p.id and access_pm.user_id=$1 and access_pm.ended_at is null
          )))
        )
      order by p.updated_at desc, p.project_code desc`,
    [actor.id, actor.app_role],
  );
  return { status: 200, body: { projects: result.rows.map(portalProjectFromRow) } };
}

async function syncProjectDevelopers(client, projectId, developerIds, actorId) {
  const numericIds = [...new Set((Array.isArray(developerIds) ? developerIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const valid = numericIds.length
    ? (await client.query(
        `select id, display_name as name from agent_portal.users
          where id=any($1::bigint[]) and is_active=true and app_role <> 'general_user'`,
        [numericIds],
      )).rows
    : [];
  const validIds = valid.map((user) => user.id);
  await client.query(
    `update agent_portal.project_members set ended_at=now()
      where project_id=$1 and relationship='developer' and ended_at is null
        and not (user_id=any($2::bigint[]))`,
    [projectId, validIds],
  );
  for (const user of valid) {
    await client.query(
      `insert into agent_portal.project_members
         (project_id,user_id,relationship,assigned_by,assigned_at,ended_at)
       values ($1,$2,'developer',$3,now(),null)
       on conflict (project_id,user_id,relationship) do update set
         assigned_by=excluded.assigned_by, assigned_at=now(), ended_at=null`,
      [projectId, user.id, actorId],
    );
  }
  return valid;
}

export async function syncProjectArtifacts(client, project, state, actorId, previousState = {}) {
  const documentMap = { 0: "INT", 1: "FEA", 3: "ARD", 5: "DES", 7: "DEP", 9: "OPS" };
  for (const [index, record] of Object.entries(state.historicalDocuments || {})) {
    if (JSON.stringify(record) === JSON.stringify(previousState.historicalDocuments?.[index])) continue;
    if (record?.schemaVersion === 2) {
      await persistStandardDocuments(client, project, Number(index), record, actorId);
      continue;
    }
    const documentType = documentMap[index];
    if (!documentType || !record || typeof record !== "object") continue;
    const document = (await client.query(
      `insert into agent_portal.documents
         (project_id,document_type,document_code,document_title,document_status,current_version,author_id)
       values ($1,$2,$3,$4,$5,1,$6)
       on conflict (project_id,document_type) do update set
         document_status=excluded.document_status, author_id=coalesce(excluded.author_id,documents.author_id), updated_at=now()
       returning id`,
      [project.id, documentType, `${project.project_code}-${documentType}`, `${project.project_name} ${documentType}`, record.status === "complete" ? "completed" : "draft", actorId],
    )).rows[0];
    await client.query(
      `insert into agent_portal.document_versions
         (document_id,version_number,structured_content,change_summary,created_by)
       values ($1,1,$2::jsonb,$3,$4)
       on conflict (document_id,version_number) do update set
         structured_content=excluded.structured_content,
         change_summary=excluded.change_summary,
         created_by=excluded.created_by,
         created_at=now()`,
      [document.id, JSON.stringify(record), "포털 화면 저장", actorId],
    );
  }
  const gateMap = { 2: "G1", 4: "G2", 6: "G3", 8: "G4" };
  for (const [index, record] of Object.entries(state.historicalDocuments || {})) {
    const gateCode = gateMap[index];
    if (!gateCode || !record || typeof record !== "object") continue;
    if (JSON.stringify(record) === JSON.stringify(previousState.historicalDocuments?.[index])) continue;
    const rawDecision = String(record.decision || "APPROVED").toLowerCase();
    const finalDecision = rawDecision === "conditional" ? "conditional_go" : rawDecision === "rejected" ? "rejected" : rawDecision === "drop" ? "drop" : gateCode === "G1" ? "go" : "approved";
    await client.query(
      `insert into agent_portal.gates
         (project_id,gate_code,gate_status,final_decision,decision_reason,opened_at,decided_at,decided_by)
       values ($1,$2,$3,$4,$5,now(),case when $3 in ('approved','conditional','rejected') then now() else null end,$6)
       on conflict (project_id,gate_code) do update set
         gate_status=excluded.gate_status, final_decision=excluded.final_decision,
         decision_reason=excluded.decision_reason, decided_at=excluded.decided_at, decided_by=excluded.decided_by`,
      [project.id, gateCode, finalDecision === "conditional_go" ? "conditional" : finalDecision === "rejected" || finalDecision === "drop" ? "rejected" : "approved", finalDecision, record.reason || null, actorId],
    );
  }
  if ((state.feaDraft || state.feaCompleted) && !state.historicalDocuments?.["1"] &&
    (JSON.stringify(state.feaDraft) !== JSON.stringify(previousState.feaDraft) || state.feaCompleted !== previousState.feaCompleted)) {
    const document = (await client.query(
      `insert into agent_portal.documents
         (project_id,document_type,document_code,document_title,document_status,current_version,author_id)
       values ($1,'FEA',$2,$3,$4,1,$5)
       on conflict (project_id,document_type) do update set document_status=excluded.document_status,author_id=excluded.author_id,updated_at=now()
       returning id`,
      [project.id, `${project.project_code}-FEA`, `${project.project_name} FEA`, state.feaCompleted ? "completed" : "draft", actorId],
    )).rows[0];
    await client.query(
      `insert into agent_portal.document_versions
         (document_id,version_number,structured_content,change_summary,created_by)
       values ($1,1,$2::jsonb,$3,$4)
       on conflict (document_id,version_number) do update set structured_content=excluded.structured_content,created_by=excluded.created_by,created_at=now()`,
      [document.id, JSON.stringify(state.feaDraft || { completed: true }), state.feaCompleted ? "FEA 작성 완료" : "FEA 임시 저장", actorId],
    );
  }
  if (state.g1Resolution && JSON.stringify(state.g1Resolution) !== JSON.stringify(previousState.g1Resolution)) {
    const decision = state.g1Resolution.decision === "CONDITIONAL" ? "conditional_go" : state.g1Resolution.decision === "DROP" ? "drop" : "go";
    await client.query(
      `insert into agent_portal.gates
         (project_id,gate_code,gate_status,final_decision,decision_reason,opened_at,decided_at,decided_by)
       values ($1,'G1',$2,$3,$4,now(),now(),$5)
       on conflict (project_id,gate_code) do update set gate_status=excluded.gate_status,final_decision=excluded.final_decision,decision_reason=excluded.decision_reason,decided_at=now(),decided_by=excluded.decided_by`,
      [project.id, decision === "conditional_go" ? "conditional" : decision === "drop" ? "rejected" : "approved", decision, state.g1Resolution.reason || null, actorId],
    );
  }
  if (state.g2ReworkState && state.g2ReworkState !== previousState.g2ReworkState && (!state.g2Approvals || Object.keys(state.g2Approvals).length === 0)) {
    await client.query(
      `insert into agent_portal.gates (project_id,gate_code,gate_status,opened_at)
       values ($1,'G2',$2,now())
       on conflict (project_id,gate_code) do update set gate_status=excluded.gate_status,updated_at=now()`,
      [project.id, state.g2ReworkState === "editing" ? "rework" : "pending"],
    );
  }
}

async function syncIntakeConversation(client, projectId, messages, actorId) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const intakeRequest = (await client.query(
    `select id from agent_portal.intake_requests where project_id=$1 limit 1`,
    [projectId],
  )).rows[0];
  if (!intakeRequest) return;
  let conversation = (await client.query(
    `select id from agent_portal.intake_conversations
      where intake_request_id=$1 order by id limit 1 for update`,
    [intakeRequest.id],
  )).rows[0];
  if (!conversation) {
    conversation = (await client.query(
      `insert into agent_portal.intake_conversations
         (intake_request_id,conversation_status,last_message_at)
       values ($1,'active',now()) returning id`,
      [intakeRequest.id],
    )).rows[0];
  }
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== "object" || !String(message.text || "").trim()) continue;
    const senderType = message.role === "agent" ? "agent" : message.role === "system" ? "system" : "user";
    await client.query(
      `insert into agent_portal.intake_messages
         (conversation_id,sender_type,sender_user_id,message_text,message_order,structured_payload)
       values ($1,$2,$3,$4,$5,$6::jsonb)
       on conflict (conversation_id,message_order) do update set
         sender_type=excluded.sender_type,
         sender_user_id=excluded.sender_user_id,
         message_text=excluded.message_text,
         structured_payload=excluded.structured_payload`,
      [conversation.id, senderType, senderType === "user" ? actorId : null, String(message.text).trim(), index + 1, JSON.stringify(message)],
    );
  }
  await client.query(
    `update agent_portal.intake_conversations
        set last_message_at=now(),updated_at=now()
      where id=$1`,
    [conversation.id],
  );
}

async function createOperationalProject(body, identity) {
  const submittedState = assertPortalProjectState(body.project || body);
  return withTransaction(async (client) => {
    const actor = await findUser(client, identity);
    if (!actor || !actor.is_active) return { status: 403, body: { error: "Project creation permission is required." } };
    if (submittedState.historicalImport && actor.app_role === "general_user") {
      return { status: 403, body: { error: "Historical project import requires an AI delivery role." } };
    }
    const clientRequestId = String(submittedState.clientRequestId || "").trim();
    if (clientRequestId) {
      const existing = (await client.query(
        `select p.project_code as "projectCode", ir.raw_answers->'portalState' as state
           from agent_portal.projects p
           join agent_portal.intake_requests ir on ir.project_id=p.id
          where p.deleted_at is null
            and ir.raw_answers->'portalState'->>'clientRequestId'=$1
            and ir.raw_answers->'portalState'->>'createdByUserId'=$2
          limit 1`,
        [clientRequestId, String(actor.id)],
      )).rows[0];
      if (existing) {
        return { status: 200, body: { project: { ...(existing.state || {}), no: existing.projectCode, source: "database" } } };
      }
    }
    const catalog = await ensurePortalCatalog(client);
    const receivedDate = validIsoDate(submittedState.receivedDate) || new Date().toISOString().slice(0, 10);
    const year = Number(receivedDate.slice(0, 4));
    const projectCode = (await client.query(`select agent_portal.next_project_code($1) as code`, [year])).rows[0].code;
    const requesterId = await resolveProjectParty(client, submittedState.requester, actor, catalog);
    const ownerId = await resolveProjectParty(client, submittedState.projectOwner || submittedState.owner, actor, catalog);
    const journeyStep = Math.max(0, Math.min(portalJourneyStageCodes.length - 1, Number(submittedState.journeyStep) || 0));
    const stageCode = portalStageCode(journeyStep);
    const category = actor.app_role === "general_user"
      ? "개별 접수"
      : portalProjectCategories.has(submittedState.category) ? submittedState.category : "개별 접수";
    const state = completeHistoricalGateApprovals({ ...submittedState, category, no: projectCode, source: "database", receivedDate, createdByUserId: String(actor.id), ...(submittedState.historicalImport ? { historicalBaselineStep: journeyStep } : {}) });
    const project = (await client.query(
      `insert into agent_portal.projects
         (organization_id,request_team_id,project_code,project_name,project_category,project_summary,
          requester_id,owner_id,current_stage_code,project_status,progress_percent,
          requested_completion_date,next_action,submitted_at,created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       returning id, project_code`,
      [catalog.organizationId, catalog.aiTeamId, projectCode, String(state.name).trim(), category, state.description || null, requesterId, ownerId, stageCode, databaseProjectStatus(journeyStep, state), Math.max(0, Math.min(100, Number(state.progress) || 0)), validIsoDate(state.requestedDate), state.nextAction || null, receivedDate],
    )).rows[0];
    for (const [userId, relationship] of [[requesterId, "requester"], [ownerId, "owner"]]) {
      await client.query(
        `insert into agent_portal.project_members (project_id,user_id,relationship,assigned_by)
         values ($1,$2,$3,$4) on conflict (project_id,user_id,relationship) do update set ended_at=null`,
        [project.id, userId, relationship, actor.id],
      );
    }
    const developers = await syncProjectDevelopers(client, project.id, state.developerIds, actor.id);
    state.developerIds = developers.map((user) => String(user.id));
    state.developerNames = developers.map((user) => user.name);
    for (let index = 0; index <= journeyStep; index += 1) {
      await client.query(
        `insert into agent_portal.project_stage_history
           (project_id,stage_code,stage_state,entered_at,exited_at,changed_by,note)
         values ($1,$2,$3,$4::timestamptz,case when $3='completed' then $4::timestamptz else null end,$5,$6)`,
        [project.id, portalJourneyStageCodes[index], index < journeyStep ? "completed" : "active", receivedDate, actor.id, state.historicalImport ? "과거 과제 이관" : "신규 과제 접수"],
      );
    }
    const answers = Array.isArray(state.intakeAnswers) ? state.intakeAnswers : [];
    await client.query(
      `insert into agent_portal.intake_requests
         (project_id,business_problem,input_sources,desired_outcome,raw_answers,completion_percent,intake_status,submitted_at,created_at)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8)`,
      [project.id, answers[0] || `과거 과제 이관: ${state.name}`, answers[2] || null, answers[3] || null, JSON.stringify({ answers, portalState: state }), Math.min(100, answers.filter((answer) => String(answer || "").trim()).length * 20), state.historicalImport || answers.length ? "submitted" : "draft", receivedDate],
    );
    await syncProjectArtifacts(client, { id: project.id, project_code: projectCode, project_name: state.name }, state, actor.id);
    await persistHistoricalGateApprovals(client, project.id, state);
    await syncIntakeConversation(client, project.id, state.intakeMessages, actor.id);
    await client.query(
      `insert into agent_portal.audit_logs
         (actor_user_id,project_id,action_code,entity_type,entity_id,after_data)
       values ($1,$2,$3,'project',$4,$5::jsonb)`,
      [actor.id, project.id, state.historicalImport ? "PROJECT_HISTORICAL_IMPORT" : "PROJECT_CREATE", projectCode, JSON.stringify(state)],
    );
    return { status: 201, body: { project: state } };
  });
}

async function updateOperationalProject(projectCode, body, identity) {
  const changes = body.changes && typeof body.changes === "object" ? body.changes : body;
  return withTransaction(async (client) => {
    const actor = await findUser(client, identity);
    if (!actor || !actor.is_active) return { status: 403, body: { error: "Project update permission is required." } };
    const project = (await client.query(
      `select p.*, coalesce(ir.raw_answers->'portalState','{}'::jsonb) as runtime_state
         from agent_portal.projects p
         left join agent_portal.intake_requests ir on ir.project_id=p.id
        where p.project_code=$1 and p.deleted_at is null for update of p`,
      [projectCode],
    )).rows[0];
    if (!project) return { status: 404, body: { error: "Project not found." } };
    const related = project.requester_id === actor.id || project.owner_id === actor.id || (await client.query(
      `select 1 from agent_portal.project_members where project_id=$1 and user_id=$2 and ended_at is null limit 1`,
      [project.id, actor.id],
    )).rows[0];
    if (!["admin", "team_leader"].includes(actor.app_role) && !related && !(actor.app_role === "team_member" && ["INT", "FEA"].includes(project.current_stage_code))) {
      return { status: 403, body: { error: "You are not assigned to update this project." } };
    }
    const previousState = project.runtime_state || {};
    const changedKeys = Object.keys(changes);
    const generalUserKeys = new Set(["intakeAnswers", "intakeMessages", "intakeDraftCompleted", "requestedDate", "g2Approval"]);
    if (actor.app_role === "general_user" && changedKeys.some((key) => !generalUserKeys.has(key))) {
      return { status: 403, body: { error: "General users can only update their own intake content." } };
    }
    if (Object.prototype.hasOwnProperty.call(changes, "developerIds") && actor.app_role !== "admin" && !previousState.historicalImport) {
      return { status: 403, body: { error: "Only an admin can assign project developers." } };
    }
    if (Object.prototype.hasOwnProperty.call(changes, "g1Resolution") && actor.app_role !== "team_leader") {
      const keepsExistingDecision = actor.app_role === "admin"
        && previousState.g1Resolution
        && changes.g1Resolution
        && previousState.g1Resolution.decision === changes.g1Resolution.decision
        && String(previousState.g1Resolution.reason || "") === String(changes.g1Resolution.reason || "");
      if (!keepsExistingDecision) return { status: 403, body: { error: "Only the AI Enablement Team leader can confirm G1." } };
    }
    if (changes.historicalDocuments && !["admin", "team_leader"].includes(actor.app_role)) {
      const changedGate = ["2", "4", "6", "8"].some((key) =>
        JSON.stringify(changes.historicalDocuments?.[key]) !== JSON.stringify(previousState.historicalDocuments?.[key]),
      );
      if (changedGate) return { status: 403, body: { error: "Gate decisions require team leader or admin permission." } };
    }
    const merged = assertPortalProjectState({ ...previousState, ...changes, no: projectCode, source: "database" });
    if (actor.app_role === "general_user") merged.category = "개별 접수";
    if (changes.g2ReworkState === "resubmitted") {
      const g2Gate = (await client.query(
        `select id from agent_portal.gates where project_id=$1 and gate_code='G2' limit 1`,
        [project.id],
      )).rows[0];
      if (g2Gate) await client.query(`delete from agent_portal.gate_approvals where gate_id=$1`, [g2Gate.id]);
      merged.g2Approvals = {};
    }
    if (changes.g2Approval) {
      const g2Decision = changes.g2Approval.decision === "REWORK" ? "rework" : changes.g2Approval.decision === "APPROVED" ? "approved" : null;
      if (!g2Decision || actor.app_role === "admin") {
        return { status: 403, body: { error: "G2 approval is limited to the requester, assigned developer, and AI Enablement Team leader." } };
      }
      const approverRole = actor.app_role === "general_user"
        ? "requester"
        : actor.app_role === "team_leader" ? "team_leader" : "developer";
      const gate = (await client.query(
        `insert into agent_portal.gates (project_id,gate_code,gate_status,opened_at)
         values ($1,'G2','pending',now())
         on conflict (project_id,gate_code) do update set updated_at=now()
         returning id`,
        [project.id],
      )).rows[0];
      await client.query(
        `insert into agent_portal.gate_approvals
           (gate_id,approver_id,approver_role,decision,decision_comment,decided_at)
         values ($1,$2,$3,$4,$5,now())
         on conflict (gate_id,approver_role) do update set
           approver_id=excluded.approver_id,
           decision=excluded.decision,
           decision_comment=excluded.decision_comment,
           decided_at=now(),updated_at=now()`,
        [gate.id, actor.id, approverRole, g2Decision, String(changes.g2Approval.reason || "") || null],
      );
      const approvalState = (await client.query(
        `select count(*) filter (where decision='approved')::int as approved_count,
                bool_or(decision in ('rejected','rework')) as has_rework
           from agent_portal.gate_approvals where gate_id=$1`,
        [gate.id],
      )).rows[0];
      const gateStatus = approvalState.has_rework ? "rework" : approvalState.approved_count >= 3 ? "approved" : "pending";
      await client.query(
        `update agent_portal.gates set
           gate_status=$2,
           final_decision=case when $2='approved' then 'approved' else null end,
           decided_at=case when $2='approved' then now() else null end,
           decided_by=case when $2='approved' then $3 else null end,
           updated_at=now()
         where id=$1`,
        [gate.id, gateStatus, actor.id],
      );
      merged.g2Approvals = {
        ...(previousState.g2Approvals || {}),
        [approverRole]: {
          decision: g2Decision === "rework" ? "REWORK" : "APPROVED",
          reason: String(changes.g2Approval.reason || ""),
          actorName: actor.display_name,
          updatedAt: new Date().toISOString(),
        },
      };
      delete merged.g2Approval;
    }
    const requestedStageCode = portalStageCode(merged.journeyStep);
    if (requestedStageCode !== project.current_stage_code) {
      await client.query(`select agent_portal.change_project_stage($1,$2,$3,$4)`, [project.id, requestedStageCode, actor.id, "포털 화면 진행 상태 저장"]);
    }
    if (Object.prototype.hasOwnProperty.call(changes, "developerIds")) {
      const developers = await syncProjectDevelopers(client, project.id, merged.developerIds, actor.id);
      merged.developerIds = developers.map((user) => String(user.id));
      merged.developerNames = developers.map((user) => user.name);
    }
    await client.query(
      `update agent_portal.projects set
         project_name=$2, project_category=$3, project_summary=$4,
         project_status=$5, progress_percent=$6,
         requested_completion_date=$7, next_action=$8, updated_at=now()
       where id=$1`,
      [project.id, String(merged.name).trim(), portalProjectCategories.has(merged.category) ? merged.category : "개별 접수", merged.description || null, databaseProjectStatus(merged.journeyStep, merged), Math.max(0, Math.min(100, Number(merged.progress) || 0)), validIsoDate(merged.requestedDate), merged.nextAction || null],
    );
    await client.query(
      `update agent_portal.intake_requests set
         business_problem=$2, input_sources=$3, desired_outcome=$4,
         raw_answers=coalesce(raw_answers,'{}'::jsonb) || jsonb_build_object('answers',$5::jsonb,'portalState',$6::jsonb),
         completion_percent=$7,
         intake_status=case when $8 then 'submitted' else intake_status end,
         submitted_at=case when $8 then coalesce(submitted_at,now()) else submitted_at end,
         updated_at=now()
       where project_id=$1`,
      [project.id, merged.intakeAnswers?.[0] || `과제: ${merged.name}`, merged.intakeAnswers?.[2] || null, merged.intakeAnswers?.[3] || null, JSON.stringify(merged.intakeAnswers || []), JSON.stringify(merged), Math.min(100, (merged.intakeAnswers || []).filter((answer) => String(answer || "").trim()).length * 20), Boolean(merged.intakeDraftCompleted || merged.historicalImport)],
    );
    await syncProjectArtifacts(client, project, merged, actor.id, previousState);
    if (Object.prototype.hasOwnProperty.call(changes, "intakeMessages")) {
      await syncIntakeConversation(client, project.id, merged.intakeMessages, actor.id);
    }
    await client.query(
      `insert into agent_portal.audit_logs
         (actor_user_id,project_id,action_code,entity_type,entity_id,before_data,after_data)
       values ($1,$2,'PROJECT_UPDATE','project',$3,$4::jsonb,$5::jsonb)`,
      [actor.id, project.id, projectCode, JSON.stringify(previousState), JSON.stringify(merged)],
    );
    return { status: 200, body: { project: merged } };
  });
}

async function deleteOperationalProject(projectCode, identity) {
  return withTransaction(async (client) => {
    const actor = await findUser(client, identity);
    if (!actor || !actor.is_active) return { status: 403, body: { error: "Project deletion permission is required." } };
    const project = (await client.query(
      `select id,requester_id,current_stage_code from agent_portal.projects
        where project_code=$1 and deleted_at is null for update`,
      [projectCode],
    )).rows[0];
    if (!project) return { status: 404, body: { error: "Project not found." } };
    const allowed = actor.app_role === "admin" || (actor.app_role === "general_user" && project.requester_id === actor.id && project.current_stage_code === "INT");
    if (!allowed) return { status: 403, body: { error: "Project deletion permission is required." } };
    await client.query(`update agent_portal.projects set deleted_at=now(),deleted_by=$2,updated_at=now() where id=$1`, [project.id, actor.id]);
    await client.query(
      `insert into agent_portal.audit_logs
         (actor_user_id,project_id,action_code,entity_type,entity_id,before_data)
       values ($1,$2,'PROJECT_DELETE','project',$3,jsonb_build_object('stageCode',$4))`,
      [actor.id, project.id, projectCode, project.current_stage_code],
    );
    return { status: 200, body: { deleted: true, projectCode } };
  });
}

async function listTeamWorkload(identity) {
  const pool = getPool();
  const actor = await findUser(pool, identity);
  if (!actor || !actor.is_active || !teamWorkspaceRoles.has(actor.app_role)) {
    return { status: 403, body: { error: "Team workspace permission is required." } };
  }

  const [memberResult, projectResult] = await Promise.all([
    pool.query(
      `select u.id::text as id, coalesce(u.email, '') as email, u.display_name as "displayName",
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
    const intake = (await client.query(
      `select raw_answers from agent_portal.intake_requests where project_id=$1 for update`,
      [project.id],
    )).rows[0];
    if (intake) {
      const rawAnswers = intake.raw_answers && typeof intake.raw_answers === "object" ? intake.raw_answers : {};
      const portalState = rawAnswers.portalState && typeof rawAnswers.portalState === "object" ? rawAnswers.portalState : {};
      portalState.developerIds = [String(assignee.id)];
      portalState.developerNames = [assignee.displayName];
      portalState.handler = assignee.displayName;
      await client.query(
        `update agent_portal.intake_requests
            set raw_answers=$2::jsonb,updated_at=now() where project_id=$1`,
        [project.id, JSON.stringify({ ...rawAnswers, portalState })],
      );
    }
    await client.query(
      `insert into agent_portal.audit_logs
         (actor_user_id,project_id,action_code,entity_type,entity_id,after_data)
       values ($1,$2,'PROJECT_DEVELOPER_ASSIGN','project',$3,$4::jsonb)`,
      [actor.id, project.id, projectCode, JSON.stringify({ developerId: String(assignee.id), developerName: assignee.displayName })],
    );
    return { status: 200, body: { projectCode, assignee } };
  });
}

export async function handleDatabaseRequest({ method, pathname, body = {}, identity }) {
  if (method === "GET" && pathname === "/health") return health();
  if (method === "GET" && pathname === "/projects") return listOperationalProjects(identity);
  if (method === "POST" && pathname === "/projects") return createOperationalProject(body, identity);
  if (method === "PATCH" && pathname.startsWith("/projects/")) {
    const projectCode = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!projectCode) return { status: 400, body: { error: "Project code is required." } };
    return updateOperationalProject(projectCode, body, identity);
  }
  if (method === "DELETE" && pathname.startsWith("/projects/")) {
    const projectCode = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!projectCode) return { status: 400, body: { error: "Project code is required." } };
    return deleteOperationalProject(projectCode, identity);
  }
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
  if (method === "DELETE" && pathname.startsWith("/governance/users/")) {
    const id = Number(pathname.split("/").filter(Boolean).at(-1));
    if (!Number.isInteger(id) || id <= 0) return { status: 400, body: { error: "Valid user id is required." } };
    return deleteGovernanceUser(id, identity);
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
