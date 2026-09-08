// API lists are ordered by last update. Selection must never be an array offset.
export function selectedProjectNumber(projects, selectedNo) {
  return projects.some(project=>project.no===selectedNo)?selectedNo:(projects[0]?.no||'');
}
export function currentWorkflowTarget(project,target) {
  if(!target || target.projectNo!==project.no || target.journeyStep!==project.journeyStep)return null;
  if(target.deliveryPhase && target.deliveryPhase!==(project.deliveryPhase||'design'))return null;
  return target;
}
