import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { hydrateStandardDocuments } from "../shared/standard-documents.mjs";
import { persistStandardDocuments } from "../server/standard-documents.mjs";

test("standard document values survive a PostgreSQL round trip without replacing legacy versions", { skip: process.env.PORTAL_TEST_POSTGRES !== "1" }, async () => {
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`create temporary table portal_docs_test (
      id bigint generated always as identity primary key,project_id bigint,document_type text,
      document_code text,document_title text,document_status text,current_version integer,author_id bigint,
      updated_at timestamptz,unique(project_id,document_type)) on commit drop`);
    await client.query(`create temporary table portal_versions_test (
      document_id bigint,version_number integer,structured_content jsonb,change_summary text,created_by bigint,
      unique(document_id,version_number)) on commit drop`);
    const adapter = { query: (sql, values) => client.query(sql.replaceAll("agent_portal.document_versions", "pg_temp.portal_versions_test").replaceAll("agent_portal.documents", "pg_temp.portal_docs_test"), values) };
    const project = { id: 1, project_code: "QA-ONLY" };
    const record = hydrateStandardDocuments(3, { values: ["기존 내용"], status: "draft" }, { name: "검증 과제" });
    record.documents.ARD.fields["functions.rows"] = [{ ID: "FR-01", 기능: "기능", "입력 → 에이전트 행동 → 출력": "구조화 값", 우선순위: "M" }];
    await persistStandardDocuments(adapter, project, 3, record, 1);
    await persistStandardDocuments(adapter, project, 3, record, 1);
    record.documents.ARD.fields["overview.background"] = "새 내용";
    await persistStandardDocuments(adapter, project, 3, record, 1);
    const { rows } = await client.query("select * from pg_temp.portal_versions_test order by version_number");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].structured_content.fields["overview.background"], undefined);
    assert.equal(rows[1].structured_content.fields["overview.background"], "새 내용");
    assert.deepEqual(rows[1].structured_content.legacyValues, ["기존 내용"]);
    assert.deepEqual(rows[1].structured_content.fields["functions.rows"], record.documents.ARD.fields["functions.rows"]);
    assert.equal((await client.query("select current_version from pg_temp.portal_docs_test")).rows[0].current_version, 2);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
});
