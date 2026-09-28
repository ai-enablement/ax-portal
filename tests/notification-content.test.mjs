import test from 'node:test';
import assert from 'node:assert/strict';
import {stageMail,rpaNotifications} from '../shared/rpa-notifications.mjs';
import {mailPayload} from '../server/work-mail.mjs';
const project={id:'p',code:'HQ-1',name:'과제명',department:'무역팀'};
const request={id:'3',createdAt:'2026-09-28T02:00:00Z',title:'테스트 오류',description:'<script>위험</script>',requester:'요청자',priority:'urgent',analysis:'원인',resolution:'조치',verification:{decision:'rejected',reason:'재현됨'}};
test('connection test is clearly non-actionable and never links to a fake project',()=>{
 const mail=mailPayload({projectNo:'TEST'},'a@example.com','https://portal.example.com','id');
 assert.match(mail.subject,/업무 처리 불필요/);assert.doesNotMatch(mail.htmlBody,/workProject|승인해/);
});
test('all RPA stages identify request, reason and next action without test links',()=>{
 for(const action of ['received','assign','resolve','verify','finalize','completed']){
  const mail=stageMail(action,request,project,'recipient@example.com','id');
  assert.match(mail.subject,/REQ-2026-000003/);assert.match(mail.htmlBody,/과제명/);assert.match(mail.htmlBody,/요청자/);assert.match(mail.htmlBody,/&lt;script&gt;/);assert.ok(mail.cta);assert.equal(mail.requestId,'3');assert.doesNotMatch(mail.htmlBody,/workProject=TEST/);
 }
});
test('notification center includes only server-authorized actionable RPA requests',()=>{
 const data={projects:[project],requests:[{...request,projectId:'p',allowedAction:'assign'},{...request,id:'4',projectId:'p',allowedAction:null}]};
 const items=rpaNotifications(data);assert.equal(items.length,1);assert.equal(items[0].href,'/?rpaRequest=3');assert.match(items[0].instruction,/담당 개발자/);
});
test('Agent mail includes task context, review documents and actionable link',()=>{
 const mail=mailPayload({projectNo:'2026-046',projectName:'과제',requester:'요청자',journeyStep:2,title:'G1 승인 요청',body:'FEA 확인 후 승인해 주세요.',recipientRole:'팀장'},'a@example.com','https://portal.example.com','id');
 assert.match(mail.htmlBody,/INT 요구 접수서/);assert.match(mail.htmlBody,/요청자/);assert.match(mail.htmlBody,/지금 처리할 일/);assert.match(mail.htmlBody,/workProject=2026-046/);
});
