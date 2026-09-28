import test from 'node:test';
import assert from 'node:assert/strict';
import {stageMail} from '../shared/rpa-stage-mail.mjs';
test('each next actor mail has its own action and relevant evidence, escaped safely',()=>{
 const p={code:'HQ-1',name:'Project'},r={title:'Request',description:'<script>bad</script>',assignee:'Developer',analysis:'Cause',resolution:'Fix',verification:{decision:'rejected',reason:'Retry reason',comment:'Review note'}};
 for(const [action,subject] of [['assign','유지보수 조치 요청'],['resolve','현업 검증 요청'],['verify','재조치 요청']]){
  const m=stageMail(action,r,p,'person@example.invalid','id');assert.ok(m.subject.includes(subject));assert.ok(m.htmlBody.includes('Cause'));assert.ok(!m.htmlBody.includes('<script>'));assert.equal(m.notificationId,'id');
 }
 const approved=stageMail('verify',{...r,verification:{decision:'approved',comment:'Approved'}},p,'dev@example.invalid','id2');assert.ok(approved.subject.includes('최종 확인 요청'));assert.ok(approved.htmlBody.includes('Approved'));
});
