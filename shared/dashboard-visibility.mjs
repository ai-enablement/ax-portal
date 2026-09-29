export const dashboardInternalRoles=['team_member','team_leader','admin','bts','bp_solution'];
export function dashboardScopeFor(role,assignment){
 if(dashboardInternalRoles.includes(role))return 'all';
 return assignment==='D2B'?'D2B':'personal';
}
export function dashboardView(scope,selected='전체'){
 const tabs=scope==='personal'?['전체']:['전체','D2B'];
 const category=tabs.includes(selected)?selected:'전체';
 const personal=scope!=='all'&&category==='전체';
 return {tabs,category,personal,developerFilter:scope==='all'&&category==='전체',ending:!personal};
}
export function dashboardProjects(projects,scope,category){
 return projects.filter(p=>category==='D2B'?scope!=='personal'&&p.category==='D2B':scope==='all'||p.isPersonalProject===true);
}
