export const RPA_ALL_ROLES=['admin','team_leader','team_member'];
export const RPA_STATUSES=['received','working','testing','completed'];
export const RPA_TYPES=['오류 수정','화면 변경','로직 변경','스케줄·계정','기능 개선'];
export const canReadAllRpa=role=>RPA_ALL_ROLES.includes(role);
export const canLinkRpaPic=role=>RPA_ALL_ROLES.includes(role);
export function canReadRpaProject(actor,links){return !!actor?.is_active&&(canReadAllRpa(actor.app_role)||links.some(l=>String(l.email).toLowerCase()===String(actor.email).toLowerCase()));}
export function validateRpaRequest(body){
 for(const key of ['projectId','title','description','notifyEmail','occurredDate'])if(!String(body[key]||'').trim())return '필수 항목을 입력해 주세요.';
 if(!RPA_TYPES.includes(body.type)||!['normal','urgent'].includes(body.priority))return '요청 유형 또는 긴급도를 확인해 주세요.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.notifyEmail))return '알림 이메일을 확인해 주세요.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(body.occurredDate)||!Number.isFinite(Date.parse(body.occurredDate)))return '발생 날짜를 확인해 주세요.';
 if(body.title.length>200||body.description.length>15000||String(body.log||'').length>15000)return '입력 길이를 초과했습니다.';
 if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.key||''))return '접수 키를 확인해 주세요.';
 return null;
}
