// Read through a runtime environment object: Next.js must not inline NEXT_PUBLIC_*.
export function mailAppOrigin(env=process.env) {
  const value=env.PORTAL_APP_URL || env.NEXT_PUBLIC_APP_URL;
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password) throw new Error('MAIL_APP_URL_INVALID');
  return url.origin;
}
