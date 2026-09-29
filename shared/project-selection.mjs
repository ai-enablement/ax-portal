// API lists are ordered by last update. Selection must never be an array offset.
import {documentComplete} from './workflow-v31.mjs';
import {ardPartiesApproved} from './final-document.mjs';
export function selectedProjectNumber(projects, selectedNo) {
  return projects.some(project=>project.no===selectedNo)?selectedNo:(projects[0]?.no||'');
}
export function currentWorkflowTarget(project,target) {
  if(!target || target.projectNo!==project.no)return null;
  // Existing G2 imports may still need ARD party review. Navigate to its final
  // document, while server-side approval authorization remains unchanged.
  if(project.journeyStep===4&&target.journeyStep===3&&!ardPartiesApproved(project)&&documentComplete(project,3,'ARD')&&!(project.historicalImport&&!project.historicalImportFinalizedAt))return target;
  if(target.journeyStep!==project.journeyStep)return null;
  if(target.deliveryPhase && target.deliveryPhase!==(project.deliveryPhase||'design'))return null;
  return target;
}

// PATCH returns the full workflow state, but not every read-model projection.
// Preserve display/identity projections only; removed approvals/UAT must stay removed.
export function savedProjectView(previous,saved) {
  if(saved.no&&saved.no!==previous.no)throw new Error('다른 과제의 저장 응답입니다.');
  const projectionKeys=['name','category','description','stage','progress','nextAction','requestedDate','receivedDate','owner','requester','projectOwner','requesterId','ownerId','projectOwnerEmail','requesterEmail','developerIds','developerNames','handler','updated','feaAuthor','journeyStep'];
  return {...Object.fromEntries(projectionKeys.filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]])),...saved,no:previous.no,source:previous.source};
}
