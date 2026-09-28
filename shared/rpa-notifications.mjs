import {formatKst} from './portal-time.mjs';
import {escapeHtml,detailHtml} from './notification-content.mjs';
export const requestCode=r=>r.code||`REQ-${new Date(r.createdAt||Date.now()).getUTCFullYear()}-${String(r.id).padStart(6,'0')}`;
export function rpaNotice(action,request,project){
 const kind=action==='verify'?(request.verification?.decision==='rejected'?'rework':'finalize'):action;
 const [title,instruction,cta]=({received:['신규 유지보수 접수','요청 내용을 확인하고 담당 개발자와 반영 예정 일시를 지정한 뒤, 완료 · 조치·개발중으로 이동을 눌러 주세요.','요청 확인 및 담당자 지정'],assign:['유지보수 조치 요청','담당 개발자로 배정되었습니다. 원인 분석 결과와 조치 내용 및 수정 내역을 작성한 뒤 현업 검증을 요청해 주세요.','원인 분석 및 조치 내용 작성'],resolve:['현업 검증 요청','조치 내용을 확인해 주세요. 요청대로 처리되었다면 검증 완료, 아니라면 반려 사유를 작성해 주세요.','조치 결과 검증'],rework:['현업 검증 반려 · 재조치 요청','반려 사유를 확인하고 조치 내용을 보완한 뒤 다시 검증을 요청해 주세요.','반려 사유 확인 및 재조치'],finalize:['개발자 최종 확인 요청','현업 검증이 완료되었습니다. 검증 결과를 확인하고 최종 조치 완료를 처리해 주세요.','검증 결과 확인 및 최종 완료'],completed:['유지보수 요청 완료','요청하신 RPA 유지보수 관련 요청을 완료했습니다. 아래 원인 분석과 조치 결과를 확인해 주세요.','완료 결과 확인']})[kind];
 return {title,instruction,cta,requestCode:requestCode(request),href:`/?rpaRequest=${encodeURIComponent(request.id)}`,projectName:project.name,projectCode:project.code};
}
export function stageMail(action,request,project,recipient,id){
 const n=rpaNotice(action,request,project);
 const fields=[['대상 과제',project.code+' · '+project.name],['요청 번호',n.requestCode],['요청 제목',request.title],['요청자',request.requester],['부서',project.department],['유형 / 우선순위',`${request.type||'미등록'} / ${request.priority==='urgent'?'긴급':'일반'}`],['접수 일시 (KST)',request.createdAt?formatKst(request.createdAt):null],['요청 내용',request.description],['담당 개발자',request.assignee||'미배정'],['반영 예정 일시 (KST)',request.expectedAt?formatKst(request.expectedAt):'미정'],['원인 분석 결과',request.analysis],['조치 내용 및 수정 내역',request.resolution],['현업 검증 코멘트',request.verification?.comment],['반려 사유',request.verification?.reason]];
 return {notificationId:id,recipient,requestId:String(request.id),cta:n.cta,subject:`[RPA · ${n.title}]${request.priority==='urgent'?'[긴급]':''} ${n.requestCode} | ${project.code} · ${request.title}`,htmlBody:`<h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.instruction)}</p>${detailHtml(fields)}<h3>지금 처리할 일</h3><p>${escapeHtml(n.instruction)}</p>`};
}
export function rpaNotifications(data){
 const projects=new Map([...data.projects,...(data.requestProjects||[])].map(p=>[p.id,p]));
 return data.requests.flatMap(r=>{
  const action=({assign:'received',resolve:r.verification?.decision==='rejected'?'rework':'assign',verify:'resolve',finalize:'finalize'})[r.allowedAction];
  if(!action)return [];
  const p=projects.get(r.projectId);if(!p)return [];
  return [{...rpaNotice(action,r,p),id:r.id,body:r.description,requestTitle:r.title}];
 });
}
