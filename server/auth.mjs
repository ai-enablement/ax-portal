const UI_ROLES = {
  team_leader: "AI활성화팀 최병두 팀장",
  team_member: "AI활성화팀 허정환 담당자",
  general_user: "일반 User",
  admin: "admin",
};

function readHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function parsePrincipal(encoded) {
  if (!encoded) return null;
  try {
    const principal = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return principal && Array.isArray(principal.claims) ? principal : null;
  } catch {
    return null;
  }
}

function claimValues(principal, names) {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return (principal?.claims || [])
    .filter((claim) => accepted.has(String(claim.typ || "").toLowerCase()))
    .map((claim) => String(claim.val || "").trim())
    .filter(Boolean);
}

function configuredEmails(value) {
  return new Set(
    String(value || "")
      .split(/[;,\s]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function resolveBootstrapRole(email, env) {
  const normalizedEmail = email.toLowerCase();
  if (
    configuredEmails(
      env.PORTAL_BOOTSTRAP_ADMIN_EMAILS || env.PORTAL_ADMIN_EMAILS,
    ).has(normalizedEmail)
  ) {
    return "admin";
  }
  if (
    configuredEmails(
      env.PORTAL_BOOTSTRAP_LEADER_EMAILS || env.PORTAL_TEAM_LEADER_EMAILS,
    ).has(normalizedEmail)
  ) {
    return "team_leader";
  }
  return "general_user";
}

export function resolvePortalIdentity(headers, env = process.env) {
  const principal = parsePrincipal(readHeader(headers, "x-ms-client-principal"));
  const emailClaims = claimValues(principal, [
    "email",
    "preferred_username",
    "upn",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
  ]);
  const email = (
    readHeader(headers, "x-ms-client-principal-name") || emailClaims[0] || ""
  )
    .trim()
    .toLowerCase();
  const objectId = (
    readHeader(headers, "x-ms-client-principal-id") ||
    claimValues(principal, [
      "oid",
      "http://schemas.microsoft.com/identity/claims/objectidentifier",
    ])[0] ||
    ""
  ).trim();

  if (!email && !objectId) {
    if (env.NODE_ENV === "production") return null;
    const developmentEmail = (
      env.PORTAL_DEV_USER_EMAIL || "kim.hw@changshininc.com"
    ).toLowerCase();
    const developmentRole = resolveBootstrapRole(developmentEmail, env);
    return {
      email: developmentEmail,
      displayName: env.PORTAL_DEV_USER_NAME || "김현우",
      objectId: "development-user",
      appRole: developmentRole,
      accountRole: UI_ROLES[developmentRole],
      entraRoles: [],
      source: "development",
      canSwitchRole: env.PORTAL_DEV_ROLE_SWITCHER === "true",
    };
  }

  const appRole = resolveBootstrapRole(email, env);
  const displayName =
    claimValues(principal, ["name"])[0] ||
    email.split("@")[0] ||
    "MS 계정 사용자";

  return {
    email,
    displayName,
    objectId,
    appRole,
    accountRole: UI_ROLES[appRole],
    source: "entra",
    canSwitchRole: false,
  };
}

export { UI_ROLES };
