import test from "node:test";
import assert from "node:assert/strict";
import { hydrateStandardDocuments, standardDocuments, stageDocumentCodes, sectionHasContent } from "../shared/standard-documents.mjs";
import { persistStandardDocuments } from "../server/standard-documents.mjs";
import { syncProjectArtifacts } from "../server/database-api.mjs";

test("ARD restores all ten sections without sample answers", () => {
  assert.equal(standardDocuments.ARD.sections.length, 10);
  const legacy = { values: ["기존 업무 범위", "기존 자율성"], status: "draft" };
  const hydrated = hydrateStandardDocuments(3, legacy, { name: "실제 과제" });
  assert.deepEqual(hydrated.legacyValues, legacy.values);
  assert.deepEqual(hydrated.documents.ARD.fields, { "overview.name": "실제 과제" });
  assert.equal(legacy.schemaVersion, undefined);
  assert.deepEqual(hydrateStandardDocuments(3, hydrated).documents, hydrated.documents);
});

test("later stages keep every document separate and preserve fields", () => {
  assert.equal(standardDocuments.UG.sections.length, 6);
  assert.equal(sectionHasContent(standardDocuments.ARD.sections[4], { "functions.rows": [{}] }), false);
  for (const [stage, codes] of Object.entries(stageDocumentCodes)) {
    const record = hydrateStandardDocuments(stage);
    assert.deepEqual(Object.keys(record.documents), codes);
    for (const code of codes) {
      const keys = standardDocuments[code].sections.flatMap(s => s.fields.map(f => `${s.id}.${f.id}`));
      assert.equal(new Set(keys).size, keys.length);
      assert.equal(standardDocuments[code].sections.every(s => sectionHasContent(s, {})), false);
    }
  }
});

test("document persistence uses typed parameters, preserves previous versions, and is idempotent", async () => {
  const calls = [];
  let unchanged = false;
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("returning id")) return { rows: [{ id: 42 }] };
    if (sql.includes("select version_number")) return { rows: [{ version_number: 3, unchanged }] };
    return { rows: [] };
  }};
  const record = hydrateStandardDocuments(5);
  record.documents.DES.fields["architecture.body"] = "실제 설계";
  await persistStandardDocuments(client, { id: 1, project_code: "2026-001" }, 5, record, 9);
  const versions = calls.filter(c => c.sql.includes("insert into agent_portal.document_versions"));
  assert.equal(versions.length, 3);
  assert.ok(versions.every(c => c.params[1] === 4));
  assert.equal(JSON.parse(versions[0].params[2]).fields["architecture.body"], "실제 설계");
  assert.ok(calls.every(c => !c.sql.includes("gates")));
  calls.length = 0; unchanged = true;
  await persistStandardDocuments(client, { id: 1, project_code: "2026-001" }, 5, record, 9);
  assert.equal(calls.filter(c => c.sql.includes("insert into agent_portal.document_versions")).length, 0);
});

test("incomplete document cannot be marked complete on the server", async () => {
  const record = hydrateStandardDocuments(3);
  record.documents.ARD.status = "complete";
  await assert.rejects(() => persistStandardDocuments({ query: () => { throw new Error("SQL must not run"); } }, {}, 3, record, 1), /required document fields/);
});

test("saving a document leaves existing gate approval actors and timestamps untouched", async () => {
  const previous = { historicalDocuments: { "2": { status: "complete", decision: "APPROVED" }, "6": { status: "complete", decision: "APPROVED" } }, g1Resolution: { decision: "GO", assignee: "기존 담당자" } };
  const current = structuredClone(previous);
  current.historicalDocuments["3"] = hydrateStandardDocuments(3);
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); return { rows: sql.includes("returning id") ? [{ id: 1 }] : [] }; } };
  await syncProjectArtifacts(client, { id: 1, project_code: "QA" }, current, 9, previous);
  assert.ok(calls.some(sql => sql.includes("document_versions")));
  assert.ok(calls.every(sql => !sql.includes("agent_portal.gates")));
});
