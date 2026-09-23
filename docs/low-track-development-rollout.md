# Low track development flow (2026-09-23)

Confirmed flow: INT → FEA → G1 → development/evaluation → G3 → deployment/rollout → G4 → operations.
ARD, G2 and design are excluded, without creating synthetic approval records.
G1 still requires the leader decision and assigned developer. EVD, requester UAT,
G3 team-leader approval and G4 Owner/team-leader approval remain mandatory.

## Existing project 2026-046

Read-only preflight confirmed legacy `journeyStep=9`, `lowRoute.phase=registration`.
Do not apply the state correction while the old UI/backend is still deployed.
After the new code is deployed, run:

```powershell
node --env-file=.env scripts/migrate-pending-low-track.mjs 2026-046
node --env-file=.env scripts/migrate-pending-low-track.mjs 2026-046 --apply
node --env-file=.env scripts/migrate-pending-low-track.mjs 2026-046
```

The explicit-project migration locks the project/intake rows, preserves document and
G1 records, records before/after state in the audit log, and is idempotent.
Already deployed/operating projects are never moved backwards. The mail cycle uses
the resulting development/evaluation task; the migration does not send mail itself.
Other legacy pending projects require explicit review before applying the script.
