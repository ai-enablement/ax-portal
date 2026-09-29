// User-approved accounts; compare authenticated emails, never display names.
export const D2B_DASHBOARD_EMAILS=['shari.kim@changshininc.com','naomi.kim@changshininc.com'];
export function leaderDashboardScope(actor,configured=process.env.PORTAL_D2B_DASHBOARD_EMAILS??D2B_DASHBOARD_EMAILS.join(',')) {
 const emails=configured.split(/[,;\n]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
 return actor?.email&&emails.includes(actor.email.trim().toLowerCase())?'D2B':'all';
}
