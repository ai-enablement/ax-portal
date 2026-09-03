import test from "node:test";
import assert from "node:assert/strict";
import { completeHistoricalGateApprovals, persistHistoricalGateApprovals } from "../server/historical-gate-approvals.mjs";

test("imports approve only gates strictly before the fixed baseline", () => {
  for (const [baseline, expected] of [[4, []], [5, ["4"]], [6, ["4"]], [7, ["4", "6"]], [8, ["4", "6"]], [9, ["4", "6", "8"]]]) {
    const result = completeHistoricalGateApprovals({ historicalImport: true, historicalBaselineStep: baseline });
    assert.deepEqual(Object.keys(result.historicalDocuments || {}), expected);
    if (baseline > 4) assert.equal(Object.values(result.g2Approvals).filter((vote) => vote.decision === "APPROVED").length, 3);
  }
});

test("does not auto approve normal projects, later progress, rework, or edited records", () => {
  const normal = { journeyStep: 9 };
  assert.equal(completeHistoricalGateApprovals(normal), normal);
  const imported = { historicalImport: true, historicalBaselineStep: 3, journeyStep: 9 };
  assert.equal(completeHistoricalGateApprovals(imported).g2Approvals, undefined);
  for (const record of [{ status: "complete", decision: "REJECTED" }, { status: "draft", decision: "PENDING" }]) {
    const state = { historicalImport: true, historicalBaselineStep: 7, historicalDocuments: { "4": record } };
    assert.deepEqual(completeHistoricalGateApprovals(state).historicalDocuments["4"], record);
    assert.equal(completeHistoricalGateApprovals(state).g2Approvals, undefined);
  }
  assert.equal(completeHistoricalGateApprovals({ historicalImport: true, historicalBaselineStep: 7, g2ReworkState: "editing" }).g2Approvals, undefined);
});

test("preserves G1 conditional decisions and evidence; repair is idempotent", () => {
  const input = { historicalImport: true, historicalBaselineStep: 7, historicalDocuments: {
    "2": { decision: "CONDITIONAL", reason: "original" },
    "6": { status: "complete", decision: "APPROVED", values: ["original evidence"], updatedAt: "2026-09-01" },
  } };
  const result = completeHistoricalGateApprovals(input, "2026-09-03");
  assert.deepEqual(result.historicalDocuments["2"], input.historicalDocuments["2"]);
  assert.deepEqual(result.historicalDocuments["6"].values, ["original evidence"]);
  assert.deepEqual(completeHistoricalGateApprovals(result), result);
  assert.equal(input.g2Approvals, undefined);
});

test("persists imported role approvals without fabricating a signer or overwriting votes", async () => {
  const writes = [];
  const client = { query: async (sql, args) => {
    if (sql.startsWith("select")) return { rows: [{ id: args[1] }] };
    writes.push({ sql, args }); return { rows: [] };
  } };
  await persistHistoricalGateApprovals(client, 3, completeHistoricalGateApprovals({ historicalImport: true, historicalBaselineStep: 7 }));
  assert.equal(writes.length, 5);
  assert.ok(writes.every(({ sql }) => sql.includes("null,null") && sql.includes("do nothing")));
});
