export const historicalGateRules = [
  { index: 4, code: "G2", roles: ["requester", "developer", "team_leader"] },
  { index: 6, code: "G3", roles: ["reviewer", "team_leader"] },
  { index: 8, code: "G4", roles: ["owner", "team_leader"] },
];

// Only the immutable import baseline grants historical approvals. Never use the
// current stage here: later workflow approvals must still be made normally.
export function completeHistoricalGateApprovals(input, now = new Date().toISOString()) {
  if (!input.historicalImport || !Number.isInteger(input.historicalBaselineStep)) return input;
  const state = structuredClone(input);
  for (const rule of historicalGateRules) {
    if (state.historicalBaselineStep <= rule.index) continue;
    const previous = state.historicalDocuments?.[String(rule.index)];
    // Do not override a subsequent human rejection, rework, or edited draft.
    if (previous && (previous.status !== "complete" || !["APPROVED", "CONDITIONAL"].includes(previous.decision))) continue;
    if (rule.code === "G2" && (state.g2ReworkState || Object.values(state.g2Approvals || {}).some((vote) => vote.decision === "REWORK"))) continue;
    const reason = `과거 과제 이관 기준 단계(${state.historicalBaselineStep}) 이전 ${rule.code} 자동 승인 · 개별 전자서명 아님`;
    const updatedAt = previous?.updatedAt || now;
    state.historicalDocuments ||= {};
    state.historicalDocuments[String(rule.index)] = {
      ...previous,
      values: previous?.values || [],
      status: "complete",
      decision: previous?.decision || "APPROVED",
      updatedAt,
      approvalSource: "historical_import",
      approvalRoles: rule.roles,
      reason: previous?.reason || reason,
    };
    if (rule.code === "G2") {
      state.g2Approvals ||= {};
      for (const role of rule.roles) {
        state.g2Approvals[role] ||= { decision: "APPROVED", reason, updatedAt, approvalSource: "historical_import" };
      }
    }
  }
  return state;
}

export async function persistHistoricalGateApprovals(client, projectId, state) {
  if (!state.historicalImport) return;
  for (const rule of historicalGateRules) {
    const record = state.historicalDocuments?.[String(rule.index)];
    if (state.historicalBaselineStep <= rule.index || record?.approvalSource !== "historical_import") continue;
    const gate = (await client.query(
      `select id from agent_portal.gates where project_id=$1 and gate_code=$2
       and gate_status in ('approved','conditional')`, [projectId, rule.code],
    )).rows[0];
    if (!gate) continue;
    for (const role of rule.roles) {
      // Unknown original signers remain NULL. Do not attribute imported decisions
      // to the currently signed-in administrator or fabricate signing dates.
      await client.query(
        `insert into agent_portal.gate_approvals
          (gate_id,approver_role,decision,decision_comment,approver_id,decided_at)
         values ($1,$2,'approved',$3,null,null)
         on conflict (gate_id,approver_role) do nothing`,
        [gate.id, role, "과거 과제 이관 기준 이전 단계 자동 승인 · 개별 승인자/서명 시각 미확인"],
      );
    }
  }
}
