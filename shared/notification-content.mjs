export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detailHtml(fields){return '<table style="border-collapse:collapse;width:100%">'+fields.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`<tr><th style="text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #dde5ef">${escapeHtml(k)}</th><td style="padding:10px;border-bottom:1px solid #dde5ef;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`).join('')+'</table>';}
export function agentGuidance(item){
 const title=item.title||'',step=Number(item.journeyStep||0);
 const documents=step<=2?'INT 요구 접수서 · FEA 타당성 평가서':step<=4?'ARD 요구 정의서':step<=6?'DES 설계서 · EVD 평가 근거 · UAT 결과':'EVD 배포·확산 근거 · 파일럿 결과';
 const reason=/과거 과제/.test(title)?'과거 과제 이관을 완료하기 위해 누락 정보와 근거 보완이 필요합니다.':/보완|반려/.test(title)?'검토 결과 보완이 필요합니다. 아래 사유를 확인해 주세요.':/배정/.test(title)?'승인 절차를 진행하기 위해 담당자 지정이 필요합니다.':/승인|판정|확인/.test(title)?'현재 단계에서 본인의 검토 또는 확인이 필요합니다.':'현재 단계의 문서 작성 또는 업무 처리가 필요합니다.';
 const instructions={
  '과거 과제 이관 보완':'현재 단계까지의 필수 정보와 문서·승인 근거 중 누락된 항목을 보완하고 이관 완료를 처리해 주세요.',
  '요구 접수서 작성':'요청 배경·업무 문제·기대 효과·요구자와 Owner 정보를 입력하고 INT 검토 및 작성 완료를 진행해 주세요.',
  '타당성 평가서 작성':'INT의 업무 문제와 요구를 확인하고 대안·효과·위험을 검토해 FEA를 보완한 후 작성 완료해 주세요.',
  'G1 착수 판정':'INT·FEA와 에이전트 판정 권고를 검토하고 Go·Conditional Go·Drop을 선택해 주세요. 조건이나 보완이 필요하면 구체적인 사유를 남겨 주세요.',
  'ARD 요구 정의 승인':'ARD의 업무 범위·요구사항·완료 기준이 요청 내용에 맞는지 확인한 뒤 본인 역할의 승인을 처리해 주세요.',
  'G2 승인 요청':'ARD와 선행 승인, 개발 일정·담당자를 확인한 뒤 본인 역할의 승인 또는 보완 요청을 처리해 주세요.',
  'G3 승인 요청':'개발·평가 근거와 UAT 결과, 배포 준비 사항을 검토한 뒤 승인 또는 구체적인 보완 사유를 등록해 주세요.',
  'G4 승인 요청':'파일럿 결과와 배포·확산 근거를 확인한 뒤 확산 승인 또는 보완 요청을 처리해 주세요.',
  '요구자 UAT 확인':'실제 업무 케이스로 결과를 확인하고 UAT 확인 결과를 등록해 주세요. 충족하지 못한 요구사항은 구체적으로 남겨 주세요.',
 };
 return {reason,documents,instruction:instructions[title]||(/보완/.test(title)?`보완 사유: ${item.body} 관련 문서와 근거를 수정한 후 해당 단계에서 다시 작성 완료 또는 승인 요청을 진행해 주세요.`:item.body),cta:/배정/.test(title)?'담당자 지정하기':/보완/.test(title)?'보완 사유 확인 및 수정':/승인|판정/.test(title)?'근거 검토 및 승인':'해당 단계에서 업무 처리',stage:['요구 접수','타당성 평가','G1 착수 승인','요구 정의','G2 개발 착수 승인',item.deliveryPhase==='design'?'설계':'개발·평가','G3 배포 승인','배포·확산','G4 확산 승인'][step]||'과제 확인'};
}
