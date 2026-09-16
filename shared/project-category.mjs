export const PROJECT_CATEGORY_OPTIONS=['개별 접수','아이디어톤','D2B','RPA(기존 과제)','기타'];
export function categoryChange(previous,change,actor,stage,now=new Date().toISOString()){
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 if(!['team_leader','admin'].includes(actor.app_role))fail('팀장과 Admin만 카테고리를 지정·변경할 수 있습니다.',403);
 if(!['G1','ARD','G2','DES','G3','PILOT','G4','OPS'].includes(stage))fail('G1 착수 승인 단계부터 카테고리를 지정할 수 있습니다.',409);
 if(!PROJECT_CATEGORY_OPTIONS.includes(change?.category))fail('과제 카테고리를 선택해 주세요.');
 if(change.previousCategory!==previous)fail('카테고리가 변경되었습니다. 새로고침 후 다시 시도해 주세요.',409);
 if(previous===change.category)fail('기존 카테고리와 같습니다.');
 return {before:previous,after:change.category,actorId:String(actor.id),actorName:actor.display_name,at:now};
}
