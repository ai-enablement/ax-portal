import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("ARD inherits INT and FEA classification as a reviewable draft without overwriting edits", () => {
  const project = {
    name: "회의 지원 Agent",
    requester: "박요구 · 경영지원팀",
    projectOwner: "김오너 · 경영지원팀",
    developerNames: ["이개발"],
    requestedDate: "2026-10-01",
    intakeAnswers: ["회의 일정 조율에 시간이 오래 걸림", "", "Outlook · Teams"],
    intakeDetails: { currentProcess: "캘린더를 열어 수동으로 비교", failureImpact: "일정 누락", countPerMonth: "20", asIsMinutes: "15", people: "2", quantityBasis: "최근 한 달 추정", timingReason: "분기 시작 전 적용" },
    feaDraft: { standardVersion: "3.0", summary: "일정 후보를 찾아 초안을 제안하는 Agent", expectedEffect: "조율 시간 단축", savedMinutes: "10", effectBasis: "파일럿 추정", writeExec: false, sensitive: false, businessIdentity: true, scope: "TEAM", damageFinancial: false, maximumDamage: "일정 재조정", track: "MEDIUM", agentType: "AI Agent (판단형)", autonomy: "L1" },
  };
  const draft = hydrateStandardDocuments(3, {}, project);
  assert.equal(draft.documents.ARD.fields["overview.agentType"], "AI Agent (판단형)");
  assert.equal(draft.documents.ARD.fields["autonomy.track"], "중");
  assert.equal(draft.documents.ARD.fields["autonomy.level"], "L1 초안 생성");
  assert.match(draft.documents.ARD.fields["asIs.baseline"], /월 20건/);
  assert.match(draft.documents.ARD.fields["knowledge.sources"], /Outlook/);
  draft.documents.ARD.fields["asIs.pain"] = "담당자가 확인한 수정 내용";
  assert.equal(hydrateStandardDocuments(3, draft, project).documents.ARD.fields["asIs.pain"], "담당자가 확인한 수정 내용");
});

test("ARD receives the risk-elevated track when a lower FEA selection conflicts with L2", () => {
  const draft = hydrateStandardDocuments(3, {}, { name: "실행 Agent", feaDraft: { standardVersion: "3.0", track: "LOW", autonomy: "L2", scope: "TEAM", writeExec: false, sensitive: false, businessIdentity: false, damageFinancial: false } });
  assert.equal(draft.documents.ARD.fields["autonomy.track"], "상");
});

test("direct design and pilot layouts retain the shared save path without changing ARD", () => {
  const workspace = readFileSync(new URL("../app/standard-document-workspace.tsx", import.meta.url), "utf8");
  const direct = readFileSync(new URL("../app/direct-stage-documents.tsx", import.meta.url), "utf8");
  assert.match(workspace, /stage === 5 \|\| stage === 7/);
  assert.match(workspace, /onSave=\{save\}/);
  assert.match(direct, /renderField\(field, section.id\)/);
  assert.match(direct, /releaseDialog.current\?\.showModal\(\)/);
  assert.doesNotMatch(direct, /standard-doc-chat/);
  const record = hydrateStandardDocuments(7);
  record.documents.DEP.fields["readiness.checks"] = [true, false, false, true];
  record.documents.DEP.fields["pilot.pilotAudience"] = "파일럿 대상";
  record.documents.DEP.fields["results.pilotSatisfaction"] = "4.6 / 5";
  record.documents.UG.fields["overview.intro"] = "사용자 안내";
  assert.deepEqual(hydrateStandardDocuments(7, record).documents, record.documents);
});

test("historical backfill saves incomplete standard documents as drafts", () => {
  const workspace = readFileSync(new URL("../app/standard-document-workspace.tsx", import.meta.url), "utf8");
  const direct = readFileSync(new URL("../app/direct-stage-documents.tsx", import.meta.url), "utf8");
  assert.match(workspace, /if \(allowPartialSave\) complete = false/);
  assert.match(workspace, /allowPartialSave && !allValid/);
  assert.match(direct, /props\.allowPartialSave \? "이관 내용 저장"/);
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
