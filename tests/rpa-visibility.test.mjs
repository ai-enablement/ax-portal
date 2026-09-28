import test from 'node:test';
import assert from 'node:assert/strict';
import {isRpaHidden,exclusionStatus} from '../shared/rpa-visibility.mjs';
test('source exclusion defaults and explicit overrides',()=>{
 for(const status of ['7. 제외(미개발)','8. 제외(개발완료)','7.제외(미개발)']){
  assert.equal(isRpaHidden({status}),true);
  assert.equal(isRpaHidden({status,visibility:{hidden:false}}),false);
 }
 for(const status of ['6. 완료','5. 검증','',undefined])assert.equal(isRpaHidden({status}),false);
 assert.equal(isRpaHidden({fields:{'진행\n상태':'8. 제외(개발완료)'}}),true);
 assert.equal(isRpaHidden({status:'6. 완료',visibility:{hidden:true}}),true);
 assert.equal(exclusionStatus({status:'6. 완료'}),'');
});
