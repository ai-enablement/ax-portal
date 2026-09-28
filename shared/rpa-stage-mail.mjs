import {formatKst} from './portal-time.mjs';
export function stageMail(action,request,project,recipient,id){
 const kind=action==='verify'?(request.verification?.decision==='rejected'?'rework':'finalize'):action;
 const [title,instruction]=({assign:['유지보수 조치 요청','담당 개발자로 배정되었습니다. 원인 분석 결과와 조치 내용 및 수정 내역을 작성한 뒤 현업 검증을 요청해 주세요.'],resolve:['현업 검증 요청','조치 내용을 확인해 주세요. 요청대로 처리되었다면 검증 완료, 아니라면 반려 사유를 작성해 주세요.'],rework:['현업 검증 반려 · 재조치 요청','현업 검증에서 반려되었습니다. 반려 사유를 확인하고 조치 내용을 보완한 뒤 다시 검증을 요청해 주세요.'],finalize:['개발자 최종 확인 요청','현업 검증이 완료되었습니다. 검증 결과를 확인하고 최종 조치 완료를 처리해 주세요.']})[kind];
 const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields=[['과제',project.code+' · '+project.name],['요청 제목',request.title],['요청 내용',request.description],['담당 개발자',request.assignee],['반영 예정 일시 (KST)',request.expectedAt?formatKst(request.expectedAt):'미정'],['원인 분석 결과',request.analysis],['조치 내용 및 수정 내역',request.resolution],['현업 검증 코멘트',request.verification?.comment],['반려 사유',request.verification?.reason]];
 return {notificationId:id,recipient,subject:`[RPA Portal] ${title} · ${project.code} · ${request.title}`,htmlBody:`<h2>${title}</h2><p>${instruction}</p>`+fields.filter(([,v])=>v).map(([k,v])=>`<h3>${k}</h3><div style="white-space:pre-wrap">${escape(v)}</div>`).join('')+'<p>포털 로그인 후 RPA Portal의 해당 요청에서 처리해 주세요.</p>'};
}
