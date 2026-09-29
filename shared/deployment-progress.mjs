export function deploymentCompleted(project={}) {
 const phase=project.markdownDocuments?.EVD?.phases?.deployment_rollout;
 if(phase?.status==='complete'&&Number(phase.version)>0)return true;
 return !(project.historicalImport&&!project.historicalImportFinalizedAt)&&Number(project.journeyStep)>=8;
}
export function effectiveProgress(project) {return deploymentCompleted(project)?100:project.manualProgress;}
export function completeDeploymentProgress(state,actor,now=new Date().toISOString()) {
 if(!deploymentCompleted(state)||state.manualProgress===100)return null;
 const entry={percent:100,previousPercent:state.manualProgress??null,note:'배포·확산 단계 완료에 따른 자동 반영',source:'deployment_completion',actorId:String(actor.id),actorName:actor.display_name,at:now};
 Object.assign(state,{manualProgress:100,progressRevision:(state.progressRevision||0)+1,progressUpdatedAt:now,progressUpdatedBy:actor.display_name,progressHistory:[...(state.progressHistory||[]),entry]});
 return entry;
}
