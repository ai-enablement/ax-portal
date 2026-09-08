import test from 'node:test';
import assert from 'node:assert/strict';
import {applyImportLifecycle,assertImportTransition,canBackfillDocument,isImportInProgress,isHistoricalDocumentComplete,needsImportCompletionRepair} from '../shared/historical-import-policy.mjs';
import {applyWorkflow} from '../server/workflow-v31.mjs';
import {completionGaps} from '../server/intake-standard.mjs';
import {gateGaps,designDocumentComplete,developmentEvdComplete} from '../shared/workflow-v31.mjs';

test('historical import stays at its registered stage until separately finalized',()=>{
  const previous={name:'이관 과제',historicalImport:true,historicalBaselineStep:7,journeyStep:7};
  assert.equal(isImportInProgress(previous),true);
  assert.throws(()=>applyImportLifecycle(previous,{journeyStep:8},7),/이관 완료/);
  const finalized=applyImportLifecycle(previous,{finalizeHistoricalImport:true},7,'2026-09-03T00:00:00.000Z');
  assert.equal(finalized.journeyStep,8);
  assert.equal(finalized.historicalResumeStep,8);
  assert.equal(finalized.historicalImportFinalizedAt,'2026-09-03T00:00:00.000Z');
  assert.equal('finalizeHistoricalImport' in finalized,false);
});

test('partial 2026-033 style INT finalization completes once and resumes FEA',()=>{
  const previous={historicalImport:true,historicalBaselineStep:0,historicalResumeStep:0,historicalImportFinalizedAt:'2026-09-08',journeyStep:0,intakeDraftCompleted:false,intakeAnswers:['입력 가능한 내용'],documentsDeferred:true,developerIds:['5']};
  assert.equal(needsImportCompletionRepair(previous),true);
  const changes={finalizeHistoricalImport:true};
  const merged=applyImportLifecycle(previous,changes,0);
  const next=applyWorkflow(previous,changes,merged,{id:5,app_role:'team_member'},{});
  assert.equal(next.journeyStep,1);assert.equal(next.intakeDraftCompleted,true);
  assert.equal(next.documentsDeferred,false);assert.equal(next.feaCompleted,undefined);
  assert.deepEqual(next.intakeAnswers,previous.intakeAnswers);
  assert.deepEqual(completionGaps(previous,changes,next),[]);
  assert.equal(isHistoricalDocumentComplete(next,0),true);
  assert.equal(isHistoricalDocumentComplete(next,1),false);
  assert.equal(needsImportCompletionRepair(next),false);
  assert.equal(applyImportLifecycle(next,changes,1).journeyStep,1);
  assert.throws(()=>applyImportLifecycle(next,{historicalCompletedThrough:{step:8}},1),/직접 변경/);
  assert.throws(()=>applyImportLifecycle(previous,{finalizeHistoricalImport:true,gateVote:{}},0),/별도로/);
  assert.throws(()=>applyWorkflow(previous,changes,merged,{id:99,app_role:'general_user'},{}),/담당자/);
});

test('all imported document phases advance without fabricating documents or gate votes',()=>{
  for(const [step,phase,nextStep,nextPhase] of [[0,undefined,1,undefined],[1,undefined,2,undefined],[3,undefined,4,undefined],[5,'design',5,'development'],[5,'development',6,'development'],[7,undefined,8,undefined]]) {
    const previous={historicalImport:true,historicalBaselineStep:step,journeyStep:step,deliveryPhase:phase};
    const changes={finalizeHistoricalImport:true};
    const merged=applyImportLifecycle(previous,changes,step);
    const next=applyWorkflow(previous,changes,merged,{id:1,app_role:'admin'},{});
    assert.equal(next.journeyStep,nextStep);assert.equal(next.deliveryPhase,nextPhase);
    assert.deepEqual(completionGaps(previous,changes,next),[]);
    assert.equal(next.workflowApprovals,undefined);assert.equal(next.markdownDocuments,undefined);
    if(step===5 && phase==='design'){assert.equal(designDocumentComplete(next),true);assert.equal(developmentEvdComplete(next),false);}
    if(step===1){assert.deepEqual(gateGaps('G1',next),[]);assert.equal(next.g1Resolution,undefined);}
  }
});

test('currently selected gates are not automatically approved on import completion',()=>{
  for(const step of [2,4,6,8]) {
    const previous={historicalImport:true,historicalBaselineStep:step,journeyStep:step};
    const next=applyImportLifecycle(previous,{finalizeHistoricalImport:true},step);
    assert.equal(next.journeyStep,step);assert.equal(next.workflowApprovals,undefined);
    assert.equal(isHistoricalDocumentComplete(next,step),false);
  }
});
test('historical completion boundary is immutable and allows old-stage backfill',()=>{
  const state={historicalImport:true,historicalBaselineStep:7,historicalResumeStep:7,historicalImportFinalizedAt:'2026-09-03',journeyStep:7};
  assert.equal(canBackfillDocument(state,6),true);
  assert.equal(canBackfillDocument(state,7),false);
  assert.throws(()=>applyImportLifecycle(state,{historicalResumeStep:0},7),/직접 변경/);
  assert.throws(()=>applyImportLifecycle(state,{historicalImportFinalizedAt:''},7),/직접 변경/);
});
test('normal sequence rejects skips after import completion',()=>{
  const state={historicalImport:true,historicalResumeStep:7,historicalImportFinalizedAt:'2026-09-03',journeyStep:7};
  assert.doesNotThrow(()=>assertImportTransition(state,state,7));
  assert.throws(()=>assertImportTransition(state,{...state,journeyStep:9},7),/현재 단계/);
  assert.throws(()=>assertImportTransition(state,{...state,journeyStep:8},7),/필수 문서/);
});

test('finalized intake advances only when complete; old-stage edits do not move it',()=>{
  const state={historicalImport:true,historicalResumeStep:0,historicalImportFinalizedAt:'2026-09-03',journeyStep:0};
  assert.throws(()=>assertImportTransition(state,{...state,journeyStep:1},0),/요구 접수/);
  assert.doesNotThrow(()=>assertImportTransition(state,{...state,journeyStep:1,intakeDraftCompleted:true},0));
  assert.throws(()=>applyImportLifecycle(state,{journeyStep:20},0),/유효한/);
});
