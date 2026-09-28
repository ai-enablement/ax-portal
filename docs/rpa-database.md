# RPA service database

Run `node --env-file=.env scripts/setup-rpa-db.mjs` against the intended environment.
It creates missing structures and refreshes read views in one transaction, with a lock timeout. It never reimports the workbook or deletes records.

| Storage | Purpose |
|---|---|
| rpa_projects | Master project and source fields, schedule, weekday flags, PC, deployment date |
| rpa_pic_links | Explicit per-project PIC to MS email authorization |
| rpa_pic_history | PIC link changes: before/after email, reason, actor, time |
| rpa_requests | Request, current workflow state, assignee, root cause, solution, expected/completed time and append-only application history in JSONB |
| rpa_request_files | Validated attachments with request FK |
| rpa_master_sheet (view) | Master table columns exposed as named fields |
| rpa_request_history (view) | Each request history event exposed as a row |

The application authorizes every read/write using the stored active user and explicit PIC links. Admin, team_leader and team_member can manage all. General users can access only linked projects and cannot alter processing state. Views do not replace the API authorization layer and are not granted public access.

Request changes and history are committed atomically with row locking and optimistic version checking. Timestamps are stored as UTC instants and shown in KST. The history is not an independent tamper-proof audit archive against a database administrator.

The Excel contains master data, not historical error tickets. Missing request events are not fabricated. Completion email transport is not yet wired; no successful delivery is recorded without sending.
