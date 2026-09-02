import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("environment template keeps PostgreSQL secrets on the Azure server", async () => {
  const [example, gitignore, page, route] = await Promise.all([
    read(".env.example"),
    read(".gitignore"),
    read("app/page.tsx"),
    read("app/api/database/[...path]/route.js"),
  ]);

  assert.match(example, /PGSSLMODE=disable/);
  assert.match(example, /PGPASSWORD=CHANGE_ME/);
  assert.match(example, /NEXT_PUBLIC_APP_URL=/);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(page, /PGPASSWORD/);
  assert.doesNotMatch(route, /PGPASSWORD/);
});

test("Next.js Node route handles same-origin database calls", async () => {
  const route = await read("app/api/database/[...path]/route.js");

  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /handleDatabaseRequest/);
  assert.match(route, /cache-control/);
  assert.match(route, /export const DELETE = route/);
  assert.match(route, /export const PUT = route/);
  assert.doesNotMatch(route, /DATABASE_GATEWAY_TOKEN|CUSTOMER_HTTP/);
});

test("operational project actions use PostgreSQL transactions, normalized records, and audit logs", async () => {
  const [api, page, permissions] = await Promise.all([
    read("server/database-api.mjs"),
    read("app/page.tsx"),
    read("database/postgresql/20260902_grant_operational_app_permissions.sql"),
  ]);
  for (const route of [
    'pathname === "/projects"',
    'pathname.startsWith("/projects/")',
  ]) assert.match(api, new RegExp(route.replace(/[()/.]/g, "\\$&")));
  assert.match(api, /next_project_code\(\$1\)/);
  assert.match(api, /insert into agent_portal\.projects/);
  assert.match(api, /insert into agent_portal\.project_members/);
  assert.match(api, /insert into agent_portal\.project_stage_history/);
  assert.match(api, /insert into agent_portal\.intake_requests/);
  assert.match(api, /insert into agent_portal\.intake_messages/);
  assert.match(api, /insert into agent_portal\.documents/);
  assert.match(api, /insert into agent_portal\.gates/);
  assert.match(api, /insert into agent_portal\.gate_approvals/);
  assert.match(api, /insert into agent_portal\.audit_logs/);
  assert.match(api, /clientRequestId/);
  assert.match(api, /General users can only update their own intake content/);
  assert.match(page, /projectUpdateQueue/);
  assert.match(page, /feaDraft/);
  assert.match(page, /g2Approvals/);
  assert.match(page, /\/api\/database\/projects/);
  assert.doesNotMatch(page, /localStorage\.setItem\("agent-portal-submitted-projects"/);
  assert.match(permissions, /grant usage on schema agent_portal to ax_projects_app/);
  assert.match(permissions, /agent_portal\.audit_logs/);
  assert.match(permissions, /next_project_code\(integer\)/);
  assert.match(permissions, /change_project_stage\(bigint, text, bigint, text\)/);
});

test("PostgreSQL pool is bounded, timeout-protected, and SSL-disabled", async () => {
  const pool = await read("server/db/pool.mjs");

  assert.match(pool, /ssl: false/);
  assert.match(pool, /PGPOOL_MAX/);
  assert.match(pool, /PGIDLE_TIMEOUT_MS/);
  assert.match(pool, /PGCONNECTION_TIMEOUT_MS/);
  assert.match(pool, /PGSTATEMENT_TIMEOUT_MS/);
  assert.match(pool, /application_name: "agent-governance-portal-webapp"/);
});

test("gallery database API uses parameterized queries and enforces role boundaries", async () => {
  const databaseApi = await read("server/database-api.mjs");

  assert.match(databaseApi, /lower\(email\) = lower\(\$1\)/);
  assert.match(databaseApi, /insert into agent_portal\.users/);
  assert.match(databaseApi, /identity\.appRole/);
  assert.match(databaseApi, /active portal User or AI Enablement Team member/);
  assert.match(databaseApi, /Only the original applicant can resubmit/);
  assert.match(databaseApi, /AI Enablement Team review permission is required/);
  assert.match(databaseApi, /Only the AI Enablement Team leader can publish/);
  assert.match(databaseApi, /actor\.app_role !== "admin"/);
  assert.match(databaseApi, /delete from agent_portal\.gallery_entries/);
  assert.match(databaseApi, /GALLERY_DELETE/);
});

test("governance roles are stored in PostgreSQL and enforced by the server", async () => {
  const api = await readFile(new URL("../server/database-api.mjs", import.meta.url), "utf8");
  assert.match(api, /agent_portal\.user_role_history/);
  assert.match(api, /\/governance\/users/);
  assert.match(api, /\/governance\/role-history/);
  assert.match(api, /Team leaders can only manage general users, AI Enablement Team members, and BTS users/);
  assert.match(api, /The last active admin cannot be demoted/);
  assert.match(api, /You cannot change your own role/);
  assert.match(api, /PORTAL_BOOTSTRAP_LEADER_EMAILS/);
  assert.match(api, /bootstrap_leader/);
  assert.match(api, /from unnest\(\$3::text\[\]\) as configured\(email\)/);
  assert.match(api, /split_part\(configured\.email, '@', 1\)/);
  assert.match(api, /app_role = 'team_leader'/);
  assert.match(api, /app_role = 'admin'/);
});

test("governance users support protected per-account editing and soft deletion", async () => {
  const api = await read("server/database-api.mjs");
  assert.match(api, /email=nullif\(\$4,''\), display_name=\$5, is_active=true/);
  assert.match(api, /lower\(email\)=lower\(\$1\) and id<>\$2/);
  assert.match(api, /Bootstrap account email and role must be changed in Azure App Service settings/);
  assert.match(api, /method === "DELETE" && pathname\.startsWith\("\/governance\/users\/"\)/);
  assert.match(api, /You cannot delete your own account/);
  assert.match(api, /The last active admin cannot be deleted/);
  assert.match(api, /set app_role='general_user', team_id=null, is_active=false/);
  assert.match(api, /Admin & Governance 계정 삭제 · 이력 보존/);
});

test("BTS and BP Solution roster entries can be registered without email", async () => {
  const api = await read("server/database-api.mjs");
  assert.match(api, /const emailOptional = \["bts", "bp_solution"\]\.includes\(newRole\)/);
  assert.match(api, /const existing = email\s*\?/);
  assert.match(api, /nullif\(\$3,''\)/);
  assert.match(api, /email=nullif\(\$4,''\)/);
  assert.match(api, /coalesce\(u\.email, ''\) as email/);
});

test("non-user development roles and team workload are persisted and served from PostgreSQL", async () => {
  const [api, schema, btsMigration, bpMigration] = await Promise.all([
    read("server/database-api.mjs"),
    read("database/postgresql/agent_governance_portal_schema.sql"),
    read("database/postgresql/20260902_add_bts_role.sql"),
    read("database/postgresql/20260902_add_bp_solution_role.sql"),
  ]);
  assert.match(api, /const teamWorkspaceRoles = new Set\(\["team_member", "team_leader", "bts", "bp_solution", "admin"\]\)/);
  assert.match(api, /pathname === "\/team\/workload"/);
  assert.match(api, /assigned\.app_role in \('team_leader','team_member','bts','bp_solution','admin'\)/);
  assert.match(api, /where u\.app_role in \('team_leader','team_member','bts','bp_solution','admin'\)/);
  assert.match(api, /existing\.rows\[0\]\?\.app_role === "general_user"/);
  assert.match(api, /then \$2::bigint else null end/);
  assert.match(api, /then \$3::bigint else null end/);
  assert.match(api, /async function assignProjectDeveloper/);
  assert.match(api, /pathname\.endsWith\("\/developer"\)/);
  assert.match(api, /actor\.app_role !== "admin"/);
  assert.match(api, /Admin permission is required to assign a developer/);
  assert.match(api, /app_role <> 'general_user'/);
  assert.match(schema, /'team_leader', 'team_member', 'bts', 'bp_solution', 'general_user', 'admin'/);
  assert.match(schema, /\('bts',\s+'PROJECT_READ_ASSIGNED'/);
  assert.match(schema, /\('bp_solution',\s+'PROJECT_READ_ASSIGNED'/);
  assert.match(btsMigration, /create or replace view agent_portal\.v_member_workload/);
  assert.match(bpMigration, /add constraint users_app_role_check/);
  assert.match(bpMigration, /\('bp_solution', 'G2_APPROVE_DEVELOPER'/);
  assert.match(bpMigration, /create or replace view agent_portal\.v_member_workload/);
});

test("project categories are constrained and returned with team workload", async () => {
  const [api, schema, migration] = await Promise.all([
    read("server/database-api.mjs"),
    read("database/postgresql/agent_governance_portal_schema.sql"),
    read("database/postgresql/20260902_add_project_category.sql"),
  ]);
  for (const category of ["개별 접수", "아이디어톤", "D2B", "RPA(기존 과제)", "기타"]) {
    assert.match(schema, new RegExp(category.replace(/[()]/g, "\\$&")));
    assert.match(migration, new RegExp(category.replace(/[()]/g, "\\$&")));
  }
  assert.match(api, /p\.project_category as category/);
  assert.match(migration, /set project_category = '개별 접수'/);
  assert.match(migration, /projects_project_category_check/);
});

test("Azure Web App build and Hybrid Connection settings are present", async () => {
  const [packageJson, nextConfig, azureSettings, azureGuide, workflow] = await Promise.all([
    read("package.json"),
    read("next.config.ts"),
    read("azure/app-settings.example.json"),
    read("azure/README.md"),
    read(".github/workflows/main_ax-portal.yml"),
  ]);

  assert.match(packageJson, /"build": "next build"/);
  assert.match(packageJson, /"start": "next start --hostname 0\.0\.0\.0"/);
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(nextConfig, /serverExternalPackages: \["pg"\]/);
  assert.match(azureSettings, /"PGHOST"/);
  assert.match(azureSettings, /"PGSSLMODE"/);
  assert.match(azureGuide, /Hybrid Connection/);
  assert.match(azureGuide, /localhost.*127\.0\.0\.1/);
  assert.match(workflow, /\.next\/standalone/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /rm -f deployment\/\.env/);
  assert.match(workflow, /start:'node server\.js'/);
  assert.match(workflow, /package: deployment/);
});

test("Gallery requires PostgreSQL and never falls back to browser persistence", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /fetch\("\/api\/database\/health"/);
  assert.match(page, /\/api\/database\/gallery\/applications/);
  assert.match(page, /PostgreSQL 연결/);
  assert.match(page, /PostgreSQL 연결 불가/);
  assert.doesNotMatch(page, /Agent Gallery 등록 신청이 이 브라우저에 임시 저장/);
  assert.match(page, /setDatabaseStatus\("fallback"\)/);
});
