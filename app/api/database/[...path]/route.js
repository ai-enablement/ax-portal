import { handleDatabaseRequest } from "../../../../server/database-api.mjs";
import { resolvePortalIdentity } from "../../../../server/auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function route(request, context) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const pathname = `/${path.join("/")}`;
  let body = {};

  if (!['GET', 'HEAD'].includes(request.method)) {
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  }

  try {
    const identity = resolvePortalIdentity(request.headers);
    if (pathname !== "/health" && !identity) {
      return Response.json(
        { error: "Authenticated Microsoft Entra identity is required." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const result = await handleDatabaseRequest({
      method: request.method,
      pathname,
      searchParams: url.searchParams,
      body: identity ? { ...body, actorEmail: identity.email } : body,
      identity,
    });
    return Response.json(result.body, {
      status: result.status,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Database API request failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Database request failed." }, { status: 500 });
  }
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
export const PUT = route;
