import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

// Opt in with PORTAL_TEST_POSTGRES=1 and the normal PG connection variables.
// Only writes to a session-local temporary table; always rolls back.
test("PostgreSQL accepts historical completed and active stage timestamps", {
  skip: process.env.PORTAL_TEST_POSTGRES !== "1",
}, async () => {
  const source = await readFile(new URL("../server/database-api.mjs", import.meta.url), "utf8");
  const query = source.match(/`(insert into agent_portal\.project_stage_history[\s\S]*?)`/)[1];
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`create temporary table portal_history_timestamp_test
      (like agent_portal.project_stage_history including defaults including identity including constraints)
      on commit drop`);
    const localQuery = query.replace("agent_portal.project_stage_history", "pg_temp.portal_history_timestamp_test");
    for (const state of ["completed", "active"]) {
      await client.query(localQuery, [1, "FEA", state, "2026-07-01", null, "timestamp regression test"]);
    }
    const { rows } = await client.query(`select stage_state,
      entered_at::date::text as entered_date,
      exited_at is null as exit_is_null,
      exited_at = entered_at as exit_matches_entry
      from pg_temp.portal_history_timestamp_test`);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.entered_date === "2026-07-01"));
    assert.equal(rows.find((row) => row.stage_state === "completed").exit_matches_entry, true);
    assert.equal(rows.find((row) => row.stage_state === "active").exit_is_null, true);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
});
