import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkNotifications } from "../shared/work-notifications.mjs";

const base = {
  no: "2026-101",
  name: "회의 지원 Agent",
  source: "database",
  requesterId: "11",
  ownerId: "12",
  requesterEmail: "requester@changshininc.com",
  projectOwnerEmail: "owner@changshininc.com",
  developerIds: ["21"],
  journeyStep: 3,
};
test('FEA requester and Owner receive work alerts but unrelated users do not',()=>{
 const project={...base,journeyStep:1};
 for(const id of ['11','12'])assert.equal(buildWorkNotifications([project],{id,appRole:'general_user'})[0].journeyStep,1);
 assert.equal(buildWorkNotifications([project],{id:'99',appRole:'general_user'}).length,0);
 assert.equal(buildWorkNotifications([{...project,feaCompleted:true}],{id:'11',appRole:'general_user'}).length,0);
});
test('G3 still notifies requester until UAT is recorded',()=>{
 const project={...base,journeyStep:6,workflowTrack:'MEDIUM'};
 const actor={id:'11',appRole:'general_user'};
 assert.equal(buildWorkNotifications([project],actor)[0].title,'요구자 UAT 확인');
 assert.equal(buildWorkNotifications([project],actor)[0].journeyStep,6);
 assert.equal(buildWorkNotifications([{...project,uatRecord:{completed:true}}],actor).length,0);
});
test('one account with multiple G2 roles keeps an alert until every role has voted',()=>{
 const project={...base,journeyStep:4,ownerId:'11',projectOwnerEmail:base.requesterEmail,workflowApprovals:{G2:{requester:{decision:'APPROVED'}}}};
 const actor={id:'11',appRole:'general_user'};
 assert.equal(buildWorkNotifications([project],actor)[0].title,'G2 승인 요청');
 project.workflowApprovals.G2.owner={decision:'APPROVED'};
 assert.equal(buildWorkNotifications([project],actor).length,0);
});

test("assigned developer receives the current ARD action and another developer does not", () => {
  const assigned = buildWorkNotifications([base], { id: "21", appRole: "team_member", email: "dev@changshininc.com" });
  const other = buildWorkNotifications([base], { id: "22", appRole: "team_member", email: "other@changshininc.com" });
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].title, "ARD 요구 정의 작성");
  assert.equal(assigned[0].journeyStep, 3);
  assert.equal(other.length, 0);
});

test("only the pending G2 approver sees an approval action", () => {
  const project = {
    ...base,
    journeyStep: 4,
    workflowApprovals: { G2: { requester: { decision: "APPROVED" } } },
  };
  assert.equal(buildWorkNotifications([project], { id: "11", appRole: "general_user", email: "requester@changshininc.com" }).length, 0);
  const owner = buildWorkNotifications([project], { id: "12", appRole: "general_user", email: "owner@changshininc.com" });
  assert.equal(owner.length, 1);
  assert.equal(owner[0].title, "G2 승인 요청");
});

test("a rework decision routes the assigned author directly to the preceding document", () => {
  const project = {
    ...base,
    journeyStep: 4,
    workflowApprovals: { G2: { owner: { decision: "REWORK", reason: "범위를 더 구체화해 주세요." } } },
  };
  const notifications = buildWorkNotifications([project], { id: "21", appRole: "team_member", email: "dev@changshininc.com" });
  assert.equal(notifications[0].title, "G2 보완 요청 반영");
  assert.equal(notifications[0].journeyStep, 3);
  assert.match(notifications[0].body, /범위를 더 구체화/);
});

test("admin is notified to assign a developer after G1 approval", () => {
  const project = {
    ...base,
    journeyStep: 2,
    developerIds: [],
    g1Resolution: { decision: "GO", reason: "", assignee: "미배정" },
  };
  const notifications = buildWorkNotifications([project], { id: "1", appRole: "admin", email: "admin@changshininc.com" });
  assert.equal(notifications[0].title, "개발 담당자 배정");
  assert.equal(notifications[0].journeyStep, 2);
});

test("local or completed projects do not create work alerts", () => {
  const local = { ...base, source: undefined };
  const complete = { ...base, journeyStep: 9, lowRoute: { enabled: false, phase: "operating" } };
  assert.deepEqual(buildWorkNotifications([local, complete], { id: "21", appRole: "team_member", email: "dev@changshininc.com" }), []);
});

test("Fast Track owner notice remains an action until it is recorded", () => {
  const project = {
    ...base,
    journeyStep: 5,
    deliveryPhase: "development",
    fastTrack: { requested: true, status: "GF_APPROVED" },
  };
  const actor = { id: "1", appRole: "team_leader", email: "leader@changshininc.com" };
  assert.equal(buildWorkNotifications([project], actor)[0].title, "Project Owner 통보 기록");
  project.fastTrack = { ...project.fastTrack, ownerNotifiedAt: "2026-09-07T00:00:00.000Z" };
  assert.equal(buildWorkNotifications([project], actor).length, 0);
});
