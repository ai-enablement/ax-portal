import {stageDocumentCodes,standardDocuments,sectionHasContent} from './standard-documents.mjs';

export function isImportInProgress(project = {}) {
  return project.historicalImport === true && !project.historicalImportFinalizedAt;
}
export function canBackfillDocument(project = {}, stage) {
  return project.historicalImport === true && (isImportInProgress(project) || isHistoricalDocumentComplete(project,stage) || Number(stage) < Number(project.historicalResumeStep ?? project.historicalBaselineStep ?? project.journeyStep));
}
export function isHistoricalDocumentComplete(project={},stage,code) {
  const boundary=project.historicalCompletedThrough;
  if(!project.historicalImport || !project.historicalImportFinalizedAt || !boundary) return false;
  if(Number(stage)<boundary.step)return true;
  if(Number(stage)!==boundary.step)return false;
  if(Number(stage)===5 && boundary.phase==='design')return code==='DES';
  return ![2,4,6,8].includes(Number(stage));
}
export function needsImportCompletionRepair(project={}) {
  return project.historicalImport===true && Boolean(project.historicalImportFinalizedAt) && !project.historicalCompletedThrough &&
    Number(project.journeyStep)===Number(project.historicalResumeStep) && Number(project.journeyStep)===Number(project.historicalBaselineStep);
}
export function applyImportLifecycle(previous, changes, currentStep, now = new Date().toISOString()) {
  for (const key of ['historicalImport','historicalBaselineStep','historicalImportFinalizedAt','historicalResumeStep','historicalCompletedThrough']) {
    if (key in changes && JSON.stringify(changes[key]) !== JSON.stringify(previous[key])) throw new Error('이관 기준과 완료 상태는 직접 변경할 수 없습니다.');
  }
  const merged={...previous,...changes};
  if (previous.historicalImport && (!Number.isInteger(Number(merged.journeyStep)) || Number(merged.journeyStep)<0 || Number(merged.journeyStep)>9)) throw new Error('유효한 진행 단계가 필요합니다.');
  delete merged.finalizeHistoricalImport;
  if (changes.finalizeHistoricalImport) {
    if(Object.keys(changes).some(key=>key!=='finalizeHistoricalImport'))throw new Error('문서를 먼저 저장한 뒤 이관 완료를 별도로 실행해 주세요.');
    if (!previous.historicalImport) throw new Error('과거 이관 과제만 이관 완료할 수 있습니다.');
    if (Number(merged.journeyStep) !== currentStep) throw new Error('이관 완료와 단계 이동을 동시에 처리할 수 없습니다.');
    if (isImportInProgress(previous) || needsImportCompletionRepair(previous)) {
      merged.historicalImportFinalizedAt=previous.historicalImportFinalizedAt||now;
      merged.historicalCompletedThrough={step:currentStep,phase:previous.deliveryPhase||'design',source:'historical_import',at:now};
      merged.intakeDraftCompleted=true;
      if(currentStep>=1)merged.feaCompleted=true;
      merged.documentsDeferred=false;
      if(currentStep===5 && previous.deliveryPhase!=='development')merged.deliveryPhase='development';
      else if([0,1,3,5,7].includes(currentStep))merged.journeyStep=currentStep+1;
      // A currently selected Gate still requires real approvals; no signatures are fabricated.
      merged.historicalResumeStep=merged.journeyStep;
      merged.workflowVersion='3.1';
      const titles=['요구 접수','타당성 평가','G1 착수 승인','요구 정의','G2 개발 착수 승인',merged.deliveryPhase==='development'?'개발·평가':'설계','G3 배포 승인','배포·확산','G4 확산 승인','운영·개선'];
      merged.status=`${titles[merged.journeyStep]} 진행 중`;
      merged.nextAction=merged.status;
      merged.progress=Math.round(merged.journeyStep/9*100);
    }
  }
  if (isImportInProgress(previous) && !changes.finalizeHistoricalImport && Number(merged.journeyStep) !== currentStep) throw new Error('과거 이관 완료 후 현재 단계부터 진행해 주세요.');
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
