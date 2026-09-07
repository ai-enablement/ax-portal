function firstHeaderValue(value) { return String(value || '').split(',')[0].trim(); }
function normalizedOrigin(value) {
  try { return new URL(value).origin.toLowerCase(); }
  catch { return ''; }
}

export function isSameOriginRequest(request, env=process.env) {
  const rawOrigin=request.headers.get('origin');
  if(!rawOrigin)return true;
  const supplied=normalizedOrigin(rawOrigin);
  if(!supplied)return false;
  const internal=new URL(request.url);
  const protocol=firstHeaderValue(request.headers.get('x-forwarded-proto')) || internal.protocol.replace(':','');
  const forwardedHost=firstHeaderValue(request.headers.get('x-forwarded-host'));
  const host=firstHeaderValue(request.headers.get('host'));
  const candidates=new Set([internal.origin]);
  if(forwardedHost)candidates.add(`${protocol}://${forwardedHost}`);
  if(host)candidates.add(`${protocol}://${host}`);
  if(env.NEXT_PUBLIC_APP_URL)candidates.add(env.NEXT_PUBLIC_APP_URL);
  return [...candidates].some(candidate=>normalizedOrigin(candidate)===supplied);
}
