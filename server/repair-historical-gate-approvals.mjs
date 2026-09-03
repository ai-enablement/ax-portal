import pg from "pg";
import { completeHistoricalGateApprovals, historicalGateRules, persistHistoricalGateApprovals } from "./historical-gate-approvals.mjs";

// Explicit single-project target. Defaults to a dry run; never changes stages.
const projectCode = process.argv.find((arg) => arg.startsWith("--project="))?.slice(10);
if (!projectCode) throw new Error("Specify --project=YYYY-NNN; use --apply only after reviewing the dry run.");
const apply = process.argv.includes("--apply");
const client = new pg.Client({ connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("begin");
  const row = (await client.query(
    `select p.id,p.current_stage_code,i.id as intake_id,i.raw_answers
     from agent_portal.projects p join agent_portal.intake_requests i on i.project_id=p.id
     where p.project_code=$1 and p.deleted_at is null for update of p,i`, [projectCode],
  )).rows[0];
  if (!row) throw new Error("Project not found");
  const before = row.raw_answers?.portalState;
  if (!before?.historicalImport || !Number.isInteger(before.historicalBaselineStep)) throw new Error("Not a historical import with a known baseline");
  const after = completeHistoricalGateApprovals(before);
  const gates = (await client.query("select gate_code,gate_status from agent_portal.gates where project_id=$1 for update", [row.id])).rows;
  const eligible = historicalGateRules.filter((rule) => after.historicalDocuments?.[rule.index]?.approvalSource === "historical_import");
  for (const rule of eligible) {
    if (!gates.some((gate) => gate.gate_code === rule.code && ["approved", "conditional"].includes(gate.gate_status))) throw new Error(`${rule.code} no longer approved; manual review required`);
  }
  console.log(JSON.stringify({ projectCode, stage: row.current_stage_code, baseline: before.historicalBaselineStep, gates: eligible.map((gate) => gate.code), mode: apply ? "apply" : "dry-run" }));
  if (apply) {
    await persistHistoricalGateApprovals(client, row.id, after);
    await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState}',$2::jsonb),updated_at=now() where id=$1", [row.intake_id, JSON.stringify(after)]);
    await client.query(
      `insert into agent_portal.audit_logs (project_id,action_code,entity_type,entity_id,before_data,after_data)
       values ($1,'HISTORICAL_APPROVAL_REPAIR','project',$2,$3::jsonb,$4::jsonb)`,
      [row.id, projectCode, JSON.stringify(before), JSON.stringify(after)],
    );
    const approvals = (await client.query(`select g.gate_code,a.approver_role,a.decision
      from agent_portal.gates g join agent_portal.gate_approvals a on a.gate_id=g.id
      where g.project_id=$1 order by g.gate_code,a.approver_role`, [row.id])).rows;
    for (const rule of eligible) for (const role of rule.roles) {
      if (!approvals.some((approval) => approval.gate_code === rule.code && approval.approver_role === role && approval.decision === "approved")) throw new Error("Existing approval conflicts with import; changes rolled back");
    }
    await client.query("commit");
    console.log(JSON.stringify({ committed: true, approvals }));
  } else await client.query("rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
