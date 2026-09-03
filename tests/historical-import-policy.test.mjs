import test from 'node:test';
import assert from 'node:assert/strict';
import {applyImportLifecycle,assertImportTransition,canBackfillDocument,isImportInProgress} from '../shared/historical-import-policy.mjs';

test('historical import stays at its registered stage until separately finalized',()=>{
  const previous={name:'이관 과제',historicalImport:true,historicalBaselineStep:7,journeyStep:7};
  assert.equal(isImportInProgress(previous),true);
  assert.throws(()=>applyImportLifecycle(previous,{journeyStep:8},7),/이관 완료/);
  const finalized=applyImportLifecycle(previous,{finalizeHistoricalImport:true},7,'2026-09-03T00:00:00.000Z');
  assert.equal(finalized.journeyStep,7);
  assert.equal(finalized.historicalResumeStep,7);
  assert.equal(finalized.historicalImportFinalizedAt,'2026-09-03T00:00:00.000Z');
  assert.equal('finalizeHistoricalImport' in finalized,false);
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
