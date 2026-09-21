export const PORTAL_TIME_ZONE = 'Asia/Seoul';
function parts(value) {
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:PORTAL_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
}
export function kstDate(value=new Date()) {
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const p=parts(value);
 return p?`${p.year}-${p.month}-${p.day}`:String(value||'');
}
export function formatKst(value) {
 if(!value)return '—';
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const p=parts(value);
 return p?`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} KST`:String(value);
}
// Display legacy UTC metadata in KST without mutating original document bytes.
export function markdownTimesKst(text) {
 return String(text||'').replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g,formatKst);
}
