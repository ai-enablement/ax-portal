export function pilotEvidenceReady(project){
 const check=project.gateChecks?.G4;
 return check?.criteriaPassed===true&&Boolean(String(check.evidence||'').trim());
}
export function pilotEvidenceLocked(project){
 return pilotEvidenceReady(project)&&!Object.values(project.workflowApprovals?.G4||{}).some(v=>v?.decision==='REWORK');
}
