import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeStoredStandardDocuments } from "../server/standard-documents.mjs";

test("normalized ARD current version overrides a stale workflow snapshot", () => {
  const state = {
    historicalDocuments: {
      "3": { schemaVersion: 2, status: "draft", documents: { ARD: { fields: {}, completedSections: [], status: "draft", messages: [] } } },
    },
  };
  const stored = {
    ARD: {
      schemaVersion: 2,
      documentType: "ARD",
      fields: { "overview.name": "DB 저장 Agent", "asIs.process": "DB 저장 프로세스" },
      completedSections: ["asIs"],
      status: "draft",
      messages: [],
    },
  };
  const merged = mergeStoredStandardDocuments(state, stored);
  assert.equal(merged.historicalDocuments["3"].documents.ARD.fields["overview.name"], "DB 저장 Agent");
  assert.deepEqual(merged.historicalDocuments["3"].documents.ARD.completedSections, ["asIs"]);
  assert.deepEqual(state.historicalDocuments["3"].documents.ARD.fields, {});
});

test("ARD section details render directly below the selected section tab", () => {
  const source = readFileSync(new URL("../app/standard-document-workspace.tsx", import.meta.url), "utf8");
  const database = readFileSync(new URL("../server/database-api.mjs", import.meta.url), "utf8");
  assert.match(source, /className="ard-section-item"/);
  assert.match(source, /active === index && <section className="standard-active-section"/);
  assert.match(source, /started \? "작성 중" : "입력 필요"/);
  assert.match(database, /jsonb_object_agg\(d\.document_type, dv\.structured_content\)/);
  assert.match(database, /mergeStoredStandardDocuments\(snapshot, row\.standardDocuments\)/);
});
