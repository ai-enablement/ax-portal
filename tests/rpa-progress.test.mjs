import test from 'node:test';
import assert from 'node:assert/strict';
import {canSelectProgress,progressFloor,completionMail} from '../shared/rpa-progress.mjs';
test('saved progress cannot regress, including held requests; completed is immutable',()=>{
 assert.equal(canSelectProgress('testing','working'),false);
 assert.equal(canSelectProgress('testing','completed'),true);
 assert.equal(canSelectProgress('testing','held'),true);
 assert.equal(canSelectProgress(progressFloor({status:'held',resumeStatus:'testing'}),'received'),false);
 for(const s of ['received','working','testing','completed','held'])assert.equal(canSelectProgress('completed',s),false);
});
test('completion email contains escaped request, analysis and resolution',()=>{
 const m=completionMail({title:'Request',description:'<script>x</script>',analysis:'Cause',resolution:'Fix'},{code:'HQ-1',name:'Project'},'pic@example.invalid','id');
 assert.equal(m.notificationId,'id');assert.equal(m.recipient,'pic@example.invalid');
 for(const text of ['요청 내용','원인 분석 결과','조치 내용 및 수정 내역','Cause','Fix','&lt;script&gt;'])assert.ok(m.htmlBody.includes(text));
 assert.ok(!m.htmlBody.includes('<script>'));
});
