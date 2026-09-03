import {stageDocumentCodes,standardDocuments,sectionHasContent} from './standard-documents.mjs';

export function isImportInProgress(project = {}) {
  return project.historicalImport === true && !project.historicalImportFinalizedAt;
}
export function canBackfillDocument(project = {}, stage) {
  return project.historicalImport === true && (isImportInProgress(project) || Number(stage) < Number(project.historicalResumeStep ?? project.historicalBaselineStep ?? project.journeyStep));
}
export function applyImportLifecycle(previous, changes, currentStep, now = new Date().toISOString()) {
  for (const key of ['historicalImport','historicalBaselineStep','historicalImportFinalizedAt','historicalResumeStep']) {
    if (key in changes && JSON.stringify(changes[key]) !== JSON.stringify(previous[key])) throw new Error('이관 기준과 완료 상태는 직접 변경할 수 없습니다.');
  }
  const merged={...previous,...changes};
  if (previous.historicalImport && (!Number.isInteger(Number(merged.journeyStep)) || Number(merged.journeyStep)<0 || Number(merged.journeyStep)>9)) throw new Error('유효한 진행 단계가 필요합니다.');
  delete merged.finalizeHistoricalImport;
  if (changes.finalizeHistoricalImport) {
    if (!previous.historicalImport) throw new Error('과거 이관 과제만 이관 완료할 수 있습니다.');
    if (Number(merged.journeyStep) !== currentStep) throw new Error('이관 완료와 단계 이동을 동시에 처리할 수 없습니다.');
    if (!previous.historicalImportFinalizedAt) {
      merged.historicalImportFinalizedAt=now;
      merged.historicalResumeStep=currentStep;
    }
  }
  if (isImportInProgress(previous) && Number(merged.journeyStep) !== currentStep) throw new Error('과거 이관 완료 후 현재 단계부터 진행해 주세요.');
  return merged;
}
export function assertImportTransition(previous, merged, currentStep) {
  if (!previous.historicalImport || isImportInProgress(previous)) return;
  const next=Number(merged.journeyStep);
  if (next === currentStep) return;
  if (currentStep===4 && next===3 && merged.g2ReworkState==='editing') return;
  if (next !== currentStep+1) throw new Error('현재 단계를 완료한 뒤 다음 단계로 진행해 주세요.');
  const codes=stageDocumentCodes[currentStep];
  if (codes && !codes.every(code=>{
    const doc=merged.historicalDocuments?.[currentStep]?.documents?.[code];
    return doc?.status==='complete' && standardDocuments[code].sections.every(section=>sectionHasContent(section,doc.fields));
  })) throw new Error('현재 단계의 필수 문서를 작성 완료해 주세요.');
  if (currentStep===0 && !merged.intakeDraftCompleted) throw new Error('요구 접수를 완료해 주세요.');
  if (currentStep===1 && !merged.feaCompleted) throw new Error('타당성 평가를 완료해 주세요.');
  if ([2,4,6,8].includes(currentStep)) {
    if (currentStep===2 && !merged.developerIds?.length) throw new Error('개발 담당자를 배정해 주세요.');
    const gate=merged.historicalDocuments?.[currentStep];
    const approved=gate?.status==='complete' && ['APPROVED','GO','CONDITIONAL'].includes(gate.decision);
    const g1=currentStep===2 && ['GO','CONDITIONAL'].includes(merged.g1Resolution?.decision) && merged.developerIds?.length;
    const g2=currentStep===4 && ['requester','developer','team_leader'].every(role=>merged.g2Approvals?.[role]?.decision==='APPROVED');
    if (!approved && !g1 && !g2) throw new Error('현재 단계의 승인을 완료해 주세요.');
  }
}
