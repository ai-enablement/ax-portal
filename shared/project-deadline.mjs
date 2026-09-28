import {isProjectDeveloper} from './project-actors.mjs';
export function isHistoricalDeadlineDeveloper(project,actor){
 return project.historicalImport===true&&!project.historicalImportFinalizedAt&&(actor?.app_role??actor?.appRole)!=='general_user'&&isProjectDeveloper(project,actor);
}
export function canEditProjectDeadline(project,actor){
 const step=Number(project.journeyStep);
 if(!Number.isFinite(step)||step<4)return false;
 if(isHistoricalDeadlineDeveloper(project,actor))return true;
 return (actor?.app_role??actor?.appRole)==='team_leader'&&(!project.historicalImport||Boolean(project.historicalImportFinalizedAt));
}
export function validDeadline(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function applyDeadlineChange(previous,change,actor,now=new Date().toISOString()){
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 if(actor.app_role!=='team_leader'&&!isHistoricalDeadlineDeveloper(previous,actor))fail(previous.historicalImport&&!previous.historicalImportFinalizedAt?'과거 이관 완료 전에는 배정된 개발 담당자만 마감일을 확정·변경할 수 있습니다.':'AI 활성화팀 팀장만 프로젝트 마감일을 확정·변경할 수 있습니다.',403);
 if(!canEditProjectDeadline(previous,actor))fail('G2 개발 착수 승인 단계부터 마감일을 확정할 수 있습니다. 팀장은 과거 이관 완료 후 지정할 수 있습니다.');
 if(!validDeadline(change?.date))fail('올바른 마감일을 선택해 주세요.');
 const before=validDeadline(previous.committedDate)?previous.committedDate:'';
 if(change.previousDate!==before)fail('마감일이 다른 화면에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.',409);
 if(before===change.date)fail('기존 마감일과 다른 날짜를 선택해 주세요.');
 const reason=String(change.reason||'').trim();
 if(!reason)fail('마감일 확정·변경 사유를 입력해 주세요.');
 return {committedDate:change.date,deadlineHistory:[...(previous.deadlineHistory||[]),{previousDate:before||null,date:change.date,reason,actorId:String(actor.id),actorName:actor.display_name,at:now}]};
}
