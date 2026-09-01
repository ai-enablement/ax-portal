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
  assert.doesNotMatch(route, /DATABASE_GATEWAY_TOKEN|CUSTOMER_HTTP/);
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
});

test("governance roles are stored in PostgreSQL and enforced by the server", async () => {
  const api = await readFile(new URL("../server/database-api.mjs", import.meta.url), "utf8");
  assert.match(api, /agent_portal\.user_role_history/);
  assert.match(api, /\/governance\/users/);
  assert.match(api, /\/governance\/role-history/);
  assert.match(api, /Team leaders can only manage general users and team members/);
  assert.match(api, /The last active admin cannot be demoted/);
  assert.match(api, /You cannot change your own role/);
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

test("Gallery prefers PostgreSQL and clearly exposes fallback state", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /fetch\("\/api\/database\/health"/);
  assert.match(page, /\/api\/database\/gallery\/applications/);
  assert.match(page, /PostgreSQL 연결/);
  assert.match(page, /브라우저 임시 저장/);
  assert.match(page, /setDatabaseStatus\("fallback"\)/);
});
