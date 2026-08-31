import { getPool, withTransaction } from "./db/pool.mjs";

const statusToDatabase = {
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  CHANGES_REQUESTED: "changes_requested",
  RECOMMENDED: "recommended",
  PUBLISHED: "published",
  REJECTED: "rejected",
};

async function findUser(client, email) {
  if (!email) return null;
  const result = await client.query(
    `select id, email, display_name, app_role
       from agent_portal.users
      where lower(email) = lower($1) and is_active = true`,
    [email],
  );
  return result.rows[0] || null;
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
        else 'admin'
      end as "applicant",
    to_char(gs.submitted_at at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI') as "submittedAt",
    upper(gs.submission_status) as "status",
    gs.evidence as "evidence",
    gs.reviewer_note as "reviewerNote"
  from agent_portal.gallery_submissions gs
  join agent_portal.users u on u.id = gs.submitted_by
  left join agent_portal.projects p on p.id = gs.project_id`;

async function listGalleryApplications(searchParams) {
  const email = searchParams.get("email");
  const pool = getPool();
  const user = await findUser(pool, email);
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
    "actorEmail",
  ];
  const missing = required.filter((key) => !String(body[key] || "").trim());
  if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);
  if (body.source === "OPERATIONS" && !body.projectNo) {
    throw new Error("projectNo is required for an operations submission.");
  }
}

async function createGalleryApplication(body) {
  assertSubmission(body);
  return withTransaction(async (client) => {
    const actor = await findUser(client, body.actorEmail);
    if (!actor || !["general_user", "team_member", "team_leader"].includes(actor.app_role)) {
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
        [body.projectNo, actor.id, ["team_member", "team_leader"].includes(actor.app_role)],
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

async function updateGalleryApplication(submissionNumber, body) {
  const databaseStatus = statusToDatabase[body.status];
  if (!databaseStatus) throw new Error("Invalid review status.");
  return withTransaction(async (client) => {
    const existing = await client.query(
      `select id, agent_name, submitted_by from agent_portal.gallery_submissions
        where submission_number = $1 for update`,
      [submissionNumber],
    );
    if (!existing.rows[0]) return { status: 404, body: { error: "Submission not found." } };
    const actor = await findUser(client, body.actorEmail);
    if (!actor) return { status: 403, body: { error: "Active portal user not found." } };

    if (databaseStatus === "submitted") {
      if (actor.app_role !== "general_user" || actor.id !== existing.rows[0].submitted_by) {
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
      if (!["team_member", "team_leader"].includes(actor.app_role)) {
        return { status: 403, body: { error: "AI Enablement Team review permission is required." } };
      }
      if (databaseStatus === "published" && actor.app_role !== "team_leader") {
        return { status: 403, body: { error: "Only the AI Enablement Team leader can publish." } };
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
            actor.app_role,
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

async function health() {
  const result = await getPool().query(
    `select current_database() as database,
            current_user as database_user,
            to_regclass('agent_portal.projects') is not null as schema_ready,
            now() as checked_at`,
  );
  return { status: 200, body: { ok: true, ...result.rows[0] } };
}

export async function handleDatabaseRequest({ method, pathname, searchParams, body = {} }) {
  if (method === "GET" && pathname === "/health") return health();
  if (method === "GET" && pathname === "/gallery/applications") {
    return listGalleryApplications(searchParams);
  }
  if (method === "POST" && pathname === "/gallery/applications") {
    return createGalleryApplication(body);
  }
  if (method === "PATCH" && pathname.startsWith("/gallery/applications/")) {
    const id = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!id) throw new Error("Submission number is required.");
    return updateGalleryApplication(id, body);
  }
  return { status: 404, body: { error: "Route not found." } };
}
