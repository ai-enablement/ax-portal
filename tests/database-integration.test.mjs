import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("environment template keeps PostgreSQL secrets on the gateway", async () => {
  const [example, gitignore, page, worker] = await Promise.all([
    read(".env.example"),
    read(".gitignore"),
    read("app/page.tsx"),
    read("worker/index.ts"),
  ]);

  assert.match(example, /PGSSLMODE=disable/);
  assert.match(example, /PGPASSWORD=CHANGE_ME/);
  assert.match(example, /PORTAL_GATEWAY_TOKEN=/);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(page, /PGPASSWORD|DATABASE_GATEWAY_TOKEN/);
  assert.doesNotMatch(worker, /PGPASSWORD/);
});

test("worker proxies database calls without exposing the gateway token", async () => {
  const worker = await read("worker/index.ts");

  assert.match(worker, /url\.pathname\.startsWith\("\/api\/database"\)/);
  assert.match(worker, /CUSTOMER_HTTP_POSTGRES_GATEWAY/);
  assert.match(worker, /headers\.set\("x-portal-token", env\.DATABASE_GATEWAY_TOKEN\)/);
  assert.match(worker, /Database gateway is not configured/);
});

test("PostgreSQL pool is bounded, timeout-protected, and SSL-disabled", async () => {
  const pool = await read("server/db/pool.mjs");

  assert.match(pool, /ssl: false/);
  assert.match(pool, /PGPOOL_MAX/);
  assert.match(pool, /PGIDLE_TIMEOUT_MS/);
  assert.match(pool, /PGCONNECTION_TIMEOUT_MS/);
  assert.match(pool, /PGSTATEMENT_TIMEOUT_MS/);
  assert.match(pool, /application_name: "agent-governance-portal-gateway"/);
});

test("gallery gateway uses parameterized queries and enforces role boundaries", async () => {
  const gateway = await read("server/postgres-gateway.mjs");

  assert.match(gateway, /where lower\(email\) = lower\(\$1\)/);
  assert.match(gateway, /Only an active general User can submit/);
  assert.match(gateway, /Only the original applicant can resubmit/);
  assert.match(gateway, /AI Enablement Team review permission is required/);
  assert.match(gateway, /Only the AI Enablement Team leader can publish/);
  assert.match(gateway, /timingSafeEqual/);
});

test("Gallery prefers PostgreSQL and clearly exposes fallback state", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /fetch\("\/api\/database\/health"/);
  assert.match(page, /\/api\/database\/gallery\/applications/);
  assert.match(page, /PostgreSQL 연결/);
  assert.match(page, /목업 데이터/);
  assert.match(page, /setDatabaseStatus\("fallback"\)/);
});
