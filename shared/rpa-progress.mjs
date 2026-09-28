import {RPA_STATUSES} from './rpa-policy.mjs';
export function progressFloor(request){return request.resumeStatus||request.status;}
export function canSelectProgress(current,target){return current!=='completed'&&(target==='held'||RPA_STATUSES.indexOf(target)>=RPA_STATUSES.indexOf(current));}
export const MAIL_LABELS={cancelled:'다음 단계 진행으로 취소',pending:'발송 대기',sending:'발송 중',sent:'발송 완료',failed:'발송 실패',uncertain:'발송 확인 필요',not_configured:'발송 설정 필요',not_requested:'완료 후 발송'};
export function completionMail(request,project,recipient,id){
 const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return {notificationId:id,recipient,subject:`[RPA Portal] 유지보수 요청 완료 · ${request.title}`,htmlBody:`<p>요청하신 RPA 유지보수 관련 요청을 완료했습니다.</p><p>${escape(project.code)} · ${escape(project.name)}</p>`+[['요청 제목',request.title],['요청 내용',request.description],['원인 분석 결과',request.analysis],['조치 내용 및 수정 내역',request.resolution]].map(([k,v])=>`<h3>${k}</h3><div style="white-space:pre-wrap">${escape(v)||'미등록'}</div>`).join('')};
}
