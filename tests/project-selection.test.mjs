import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectedProjectNumber,currentWorkflowTarget} from '../shared/project-selection.mjs';
const regular={no:'2026-033',journeyStep:5,deliveryPhase:'design'};
const fast={no:'FAST',journeyStep:5,fastTrack:{requested:true}};
test('upload, completion, approval and interview refreshes cannot switch to a Fast Track project',()=>{
  let list=[fast,regular];let selected=regular.no;
  for(const step of [5,6,7,8]) {
    list=[{...regular,journeyStep:step},fast];
    selected=selectedProjectNumber(list,selected);assert.equal(selected,regular.no);
    list=[fast,...list.filter(p=>p.no!==fast.no)];
    assert.equal(selectedProjectNumber(list,selected),regular.no);
  }
});
test('adding and removing other projects preserves selection; selected removal has a defined fallback',()=>{
  assert.equal(selectedProjectNumber([{no:'NEW'},fast,regular],regular.no),regular.no);
  assert.equal(selectedProjectNumber([regular],regular.no),regular.no);
  assert.equal(selectedProjectNumber([fast],regular.no),fast.no);
  assert.equal(selectedProjectNumber([],regular.no),'');
});
test('old notification targets cannot return to a completed stage or design phase',()=>{
  const target={projectNo:regular.no,journeyStep:5,deliveryPhase:'design',nonce:1};
  assert.equal(currentWorkflowTarget(regular,target),target);
  assert.equal(currentWorkflowTarget({...regular,deliveryPhase:'development'},target),null);
  assert.equal(currentWorkflowTarget({...regular,journeyStep:6},target),null);
  assert.equal(currentWorkflowTarget(fast,target),null);
});
test('home detail uses project keys and does not reset selection when list size changes',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/projectItems\[selected\]/);
  assert.doesNotMatch(source,/\[isAiTeam, role, projectNo, projectItems\.length\]/);
  assert.match(source,/const requestedAction = currentWorkflowTarget\(current,workflowActionTarget\)/);
  assert.match(source,/onClick=\{\(\) => selectProject\(project\)\}/);
});
