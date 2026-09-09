import {isProjectDeveloper,projectActorId} from './project-actors.mjs';
import {filterProjectList} from './work-notifications.mjs';
export const PROJECT_LIST_FILTERS=['내 진행 중 과제','내 과제(전체)','진행 중','전체'];
export const projectListFilters=isAiTeam=>isAiTeam?PROJECT_LIST_FILTERS:['진행 중','전체'];
export const PROJECT_LIST_SORTS=['최신 과제순','과제번호순','마감 임박순','이름순','진행률순'];
export function isOngoingProject(project){
  if(project.historicalImport&&!project.historicalImportFinalizedAt)return true;
  if(project.lowRoute?.enabled)return project.lowRoute.phase!=='operating';
  return Number(project.journeyStep)<9&&!['완료','운영 중','중단','종료'].includes(project.status);
}
export function homeProjectList(projects,filter,actor,sort='최신 과제순'){
  const mine=p=>isProjectDeveloper(p,actor);
  const filtered=filter==='내 진행 중 과제'?projects.filter(p=>mine(p)&&isOngoingProject(p)):
    filter==='내 과제(전체)'?projects.filter(mine):
    filter==='진행 중'?projects.filter(isOngoingProject):filterProjectList(projects,filter,projectActorId(actor));
  const byNo=(a,b)=>String(a.no).localeCompare(String(b.no),'en',{numeric:true});
  const deadline=p=>{
    for(const raw of [p.committedDate,p.dueDate,p.requestedDate]){
      const value=String(raw||'').trim().replaceAll('.','-');
      if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value)))return Date.parse(value);
    }
    return Infinity;
  };
  return [...filtered].sort((a,b)=>{
    if(sort==='과제번호순')return byNo(a,b);
    if(sort==='이름순')return String(a.name).localeCompare(String(b.name),'ko')||byNo(a,b);
    if(sort==='진행률순')return (Number(a.progress)||0)-(Number(b.progress)||0)||byNo(a,b);
    if(sort==='마감 임박순')return (deadline(a)-deadline(b))||byNo(a,b);
    return byNo(b,a);
  });
}
export const projectNumberBadge=no=>/^\d{4}-(\d+)$/.exec(String(no))?.[1]||String(no);
