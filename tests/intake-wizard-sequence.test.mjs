import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intakeSectionRequired } from "../shared/intake-standard.mjs";

test("new intake wizard gates section 2 until every required workload field is filled", () => {
  const incomplete={intakeAnswers:["반복 회의록 정리가 힘듭니다.","","","",""],intakeDetails:{performer:"팀원"}};
  assert.deepEqual(intakeSectionRequired(incomplete,2).map(field=>field.key),["int.countPerMonth","int.asIsMinutes","int.people"]);
  const complete={...incomplete,intakeDetails:{performer:"팀원",countPerMonth:"20",asIsMinutes:"30",people:"2"}};
  assert.equal(intakeSectionRequired(complete,2).length,0);
  assert.equal(intakeSectionRequired(complete,3).length,0);
  assert.deepEqual(intakeSectionRequired(complete,4).map(field=>field.key),["int.failureImpact"]);
});

test("new registration starts the project INT agent without a duplicate interview wizard", () => {
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const editor=readFileSync(new URL("../app/intake-feasibility-v3.jsx",import.meta.url),"utf8");
  assert.doesNotMatch(page,/문서 양식 직접 작성|기본정보 입력 후 AI 인터뷰/);
  assert.match(page,/className="new-request-form"/);
  assert.match(page,/registrationEntry: isHistorical \? undefined : "INT_AGENT"/);
  assert.match(page,/setWorkflowTarget\(payload\.project\.no\)/);
  assert.match(page,/setView\(historical \? "home" : "intake"\)/);
  assert.match(editor,/INT_SECTIONS\.filter\(section=>section\.number===sectionNumber\)/);
});

test('registration explains blockers, retains raw email while typing, and labels the Agent name',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(page,/등록 전 확인:.*registrationGaps/);
 assert.match(page,/finally \{setSubmitted\(false\);\}/);
 assert.match(page,/isHistorical \|\| !fastTrackRequested/);
 assert.equal((page.match(/email=\{ownerEmailInput\}/g)||[]).length,1);
 assert.match(page,/aria-label="Agent 과제명"/);
 assert.doesNotMatch(page,/희망 완료일|희망 시점|희망 요청일/);
 assert.match(css,/\.chat-wizard \.wizard-form-actions > span \{[\s\S]*?font-size: 15px !important/);
 assert.equal((page.match(/onClick=\{startPersonalSubmission\}/g)||[]).length,1);
});
