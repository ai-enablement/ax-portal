export function exclusionStatus(project){
 const raw=project.status||project.fields?.['진행 상태']||project.fields?.['진행\n상태']||'';
 const normalized=String(raw).replace(/\s/g,'');
 return ['7.제외(미개발)','8.제외(개발완료)'].includes(normalized)?String(raw):'';
}
export function isRpaHidden(project){
 return typeof project.visibility?.hidden==='boolean'?project.visibility.hidden:!!exclusionStatus(project);
}
