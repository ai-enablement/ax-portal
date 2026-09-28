# BTS / BP Solution shared login

Run `node --env-file=.env scripts/migrate-shared-accounts.mjs` before deploying this version to a new database. It adds an optional self-reference and check constraint; existing accounts are unchanged. Keep the unique login email and Entra object ID indexes.

Admin & Governance accepts repeated emails for active people with the same BTS or BP Solution role. One existing user owns the actual login identity; other roster rows retain their IDs, names and assignments and reference that user. Internal accounts and mixed roles cannot share. Connecting an existing person clears their previous Entra object ID, preventing the old login from resolving to that person after reassignment.

Server-resolved `sharedUserIds` contains only active, same-role linked people. It is never accepted from request payloads. Assignment authorization uses that set; audit actor ID remains the actual login principal, with a shared-account label. Public session data mirrors the set for UI controls only. Email notifications are queued for the principal, not each alias.

Removing/changing an alias immediately removes its assignments from the old group's authorization. A principal with linked people cannot be deleted or change email/role until those people are disconnected. Existing assignments and historical records are not merged or deleted.

Tests: `node --test tests/shared-accounts.test.mjs`; `node --env-file=.env scripts/test-shared-accounts-isolated.mjs` (TEMP tables only, no real mail).
