import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePortalIdentity } from "../server/auth.mjs";

function headersFor({ email, name, roles = [], objectId = "entra-object-id" }) {
  const claims = [
    { typ: "preferred_username", val: email },
    { typ: "name", val: name },
    { typ: "oid", val: objectId },
    ...roles.map((role) => ({ typ: "roles", val: role })),
  ];
  const principal = Buffer.from(JSON.stringify({ auth_typ: "aad", claims })).toString(
    "base64",
  );
  return new Headers({ "x-ms-client-principal": principal });
}

test("uses only bootstrap accounts before the database role is loaded", () => {
  const base = {
    NODE_ENV: "production",
    PORTAL_BOOTSTRAP_LEADER_EMAILS: "leader@changshininc.com",
    PORTAL_BOOTSTRAP_ADMIN_EMAILS: "admin@changshininc.com",
  };
  assert.equal(
    resolvePortalIdentity(
      headersFor({ email: "leader@changshininc.com", name: "팀장" }),
      base,
    ).appRole,
    "team_leader",
  );
  assert.equal(
    resolvePortalIdentity(
      headersFor({ email: "member@changshininc.com", name: "팀원", roles: ["Portal.TeamMember"] }),
      base,
    ).appRole,
    "general_user",
  );
  assert.equal(
    resolvePortalIdentity(
      headersFor({ email: "admin@changshininc.com", name: "관리자", roles: ["Portal.Admin"] }),
      base,
    ).appRole,
    "admin",
  );
  assert.equal(
    resolvePortalIdentity(
      headersFor({ email: "user@changshininc.com", name: "현업 사용자" }),
      base,
    ).appRole,
    "general_user",
  );
});

test("supports comma-separated bootstrap lists without granting member role from email lists", () => {
  const env = {
    NODE_ENV: "production",
    PORTAL_BOOTSTRAP_LEADER_EMAILS: "choi.bd@changshininc.com",
  };
  assert.equal(
    resolvePortalIdentity(
      headersFor({ email: "park.hb@changshininc.com", name: "박혜빈" }),
      env,
    ).appRole,
    "general_user",
  );
  assert.equal(
    resolvePortalIdentity(
      headersFor({
        email: "choi.bd@changshininc.com",
        name: "최병두",
        roles: ["Portal.Admin"],
      }),
      env,
    ).appRole,
    "team_leader",
  );
});

test("fails closed without Easy Auth identity in production", () => {
  assert.equal(resolvePortalIdentity(new Headers(), { NODE_ENV: "production" }), null);
});

test("client and database routes use the server-authenticated identity", async () => {
  const [page, sessionRoute, databaseRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/database/[...path]/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /fetch\("\/api\/auth\/session"/);
  assert.match(page, /authenticated-account/);
  assert.match(sessionRoute, /resolvePortalIdentity/);
  assert.match(sessionRoute, /ensurePortalUser/);
  assert.match(sessionRoute, /portalUser\.app_role/);
  assert.match(databaseRoute, /resolvePortalIdentity\(request\.headers\)/);
  assert.match(databaseRoute, /actorEmail: identity\.email/);
});
