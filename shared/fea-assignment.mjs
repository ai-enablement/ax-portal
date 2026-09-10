import {isProjectParty,isProjectDeveloper} from './project-actors.mjs';
import {canManageAssessment} from './document-role-policy.mjs';
export const isFeaRequester=(project,actor)=>isProjectParty(project,actor,'requester');

export function canUseResumedFeaAgent(project,actor){
  return Boolean(actor?.is_active!==false&&project.historicalImport&&project.historicalImportFinalizedAt&&
    project.intakeDraftCompleted&&Number(project.journeyStep)===1&&!project.feaCompleted&&
    canManageAssessment(actor?.appRole??actor?.app_role));
}

export function canWriteResumedIntake(project,actor){
  return Boolean(actor?.is_active!==false&&project.historicalImport&&project.historicalImportFinalizedAt&&
    Number(project.journeyStep)<=1&&Number(project.journeyStep)>=0&&isFeaRequester(project,actor));
}

export function canWriteResumedFea(project,actor) {
  return Boolean(actor?.is_active!==false&&project.historicalImport&&project.historicalImportFinalizedAt&&
    ((Number(project.journeyStep)===1&&!project.feaCompleted)||
      (Number(project.journeyStep)===2&&(project.g1Resolution?.decision==='DROP'||(!project.g1Resolution&&!project.feaCompleted))))&&canManageAssessment(actor?.appRole??actor?.app_role));
}
