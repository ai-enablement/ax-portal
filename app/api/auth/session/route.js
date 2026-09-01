import { resolvePortalIdentity, UI_ROLES } from "../../../../server/auth.mjs";
import { getPool } from "../../../../server/db/pool.mjs";
import { ensurePortalUser } from "../../../../server/database-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const identity = resolvePortalIdentity(request.headers);
  if (!identity) {
    return Response.json(
      { error: "Authenticated Microsoft Entra identity is required." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const portalUser = await ensurePortalUser(getPool(), identity);
  if (!portalUser?.is_active) {
    return Response.json({ error: "Active portal account is required." }, { status: 403 });
  }
  const effectiveIdentity = {
    ...identity,
    email: portalUser.email,
    displayName: portalUser.display_name || identity.displayName,
    appRole: portalUser.app_role,
    accountRole: UI_ROLES[portalUser.app_role],
  };
  return Response.json(effectiveIdentity, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
