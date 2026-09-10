# Original INT / FEA / ARD integration

Source: https://github.com/torebang/intake-feasibility-agent at e4d1e180fa30fe25c5ae77bb9b7123e1bd6f9a30 (snapshot imported 2026-09-10).
The Python app, rules and HTML are retained under `server/vendor/intake-agent`.
Only standalone filesystem directory creation is disabled in embedded mode.
`portal_bridge.py` replaces filesystem persistence, identity and Azure HTTP transport (portal v1 endpoint), not interviews, prompts or document renderers.

## Runtime prerequisites

1. `database/postgresql/20260910_native_agent.sql` was applied to the configured DB on 2026-09-10. It is idempotent for other environments; no existing records are changed.
2. Provide Python 3.10+ on the deployment host. Set `PORTAL_AGENT_PYTHON` to its executable (default `python3`).
3. Install `server/vendor/intake-agent/requirements.txt` into that Python environment, or set `PYTHONPATH` to an isolated dependency directory.
4. Continue using the existing server-only `AZURE_OPENAI_*` configuration. No credentials are sent to the iframe.
5. Include `server/vendor/intake-agent` in the standalone deployment (Next output tracing configured).

Do not deploy the new UI without both database and Python readiness checks. A Node-only Azure runtime is not sufficient.
The build uses Webpack: verified standalone tracing includes the vendor engine without sweeping workspace artifacts into the deployment package. The Azure workflow already strips root `.env` files; Docker build also excludes them.
`Dockerfile.native-agent` supplies a Node 22 + Python/Flask container alternative. It has not been built on this Windows machine or deployed. Existing Azure GitHub ZIP deployment has NOT been converted to a container deployment; production requires a verified Python runtime first.

## Data and workflow

- Project identity is always from the portal URL and authenticated actor; the source's new-project, delete, settings and file browser routes are not exposed.
- INT, FEA and ARD screens are bound to the currently selected project and document stage.
- Session/form/chat snapshots are project-scoped JSONB; generated Markdown is immutable text with SHA-256, version, author and timestamp.
- Optimistic revisions reject overlapping writes. LLM execution occurs outside database transactions.
- Original document generation does not grant approvals. Explicit completion checks original readiness, then reaches FEA/G1/G2 respectively. Existing G1/G2 approver checks remain separate.
- Fast Track INT completion does not skip ARD-Lite/GF.
- Old structured documents are not removed. Initial INT/FEA and matching ARD values are seeded from existing portal fields; nonmatching old fields remain in the original records.
- Historical backfill keeps its original completion boundary, accepts missing fields and never moves an already completed stage backwards.
- Original application settings, document library archive/delete and system-wide audit administration remain managed by the portal, not a second unauthenticated standalone service.

## Validation before production

- Run native engine tests with `PORTAL_AGENT_PYTHON` and Flask configured.
- Run TypeScript, Next build, workflow regression tests.
- Original Azure INT interview passed a real synthetic-data AI call (not fallback). Transactional DB test passed Markdown versions, revision conflicts, unauthorized access, missing-field completion denial, INT→FEA, FEA→G1 and ARD→G2; all project changes were rolled back.
- Automated author-policy tests cover requester, Owner, assigned developer, unassigned user/team member, team leader and Admin across all three stages and the historical-import boundary.
- Full browser MS role matrix and Azure-host Python readiness remain production acceptance checks.
- Confirm existing ARD structured documents, rework and Fast Track handoffs before enabling production UI.
