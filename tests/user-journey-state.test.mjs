import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("persists submitted intake and advances to FEA waiting", () => {
  assert.ok(page.includes("agent-portal-submitted-projects"));
  assert.ok(page.includes('status: "타당성 평가 대기"'));
  assert.ok(page.includes("onSubmit([...answers], requestTitle, resolvedProjectOwner, resolvedRequester)"));
  assert.ok(page.includes('ownerMode === "SELF"'));
  assert.ok(page.includes("요구자와 Owner는 같을 수도, 다를 수도 있습니다."));
  assert.ok(page.includes("projectOwner,"));
});

test("lets AI team register an intake on behalf of the requester", () => {
  assert.ok(page.includes('isAiTeam ? "새 Agent 과제 등록" : "새 Agent 과제 요청"'));
  assert.ok(page.includes("요청자를 대신해 접수서 작성"));
  assert.ok(page.includes("요구자 정보"));
  assert.ok(page.includes("요구자 MS 계정 이메일"));
  assert.ok(page.includes("step === 5 && (!resolvedRequester || !resolvedProjectOwner)"));
  assert.ok(page.includes("접수 등록자"));
  assert.ok(page.includes("resolvedRequester"));
});

test("supports both chat and direct document intake with shared values", () => {
  assert.ok(page.includes('useState<"CHAT" | "FORM">("CHAT")'));
  assert.ok(page.includes("Agent와 대화하며 작성"));
  assert.ok(page.includes("문서 양식 직접 작성"));
  assert.ok(page.includes('aria-label="에이전트 요구 접수서 직접 작성"'));
  assert.ok(page.includes("updateAnswerAt"));
  assert.ok(page.includes("두 방식에서 입력한 내용은 서로 유지됩니다"));
  assert.ok(page.includes("submitRequest"));
  assert.ok(css.includes(".request-writing-modes"));
  assert.ok(css.includes(".wizard-form-panel"));
  assert.ok(css.includes(".wizard-form-scroll"));
});

test("keeps the one-page project frame visible when values are empty", () => {
  assert.ok(page.includes("const emptyProject: UserProject"));
  assert.ok(page.includes("project-stack-empty"));
  assert.ok(page.includes("const hasProjects = projectItems.length > 0"));
  assert.ok(page.includes('selectedOutputState = !hasProjects'));
  assert.ok(css.includes(".project-stack-empty"));
});

test("lets AI team roles write FEA and locks G1 until complete", () => {
  assert.ok(page.includes('className="fea-grid"'));
  assert.ok(page.includes("disabled={!canEditFea}"));
  assert.ok(page.includes("isLeader || hasProjectRelationship"));
  assert.ok(page.includes('["2026-031", "2026-033"]'));
  assert.ok(page.includes("FEA가 아직 작성 중입니다"));
  assert.ok(page.includes('g1DraftDecision === "PENDING"'));
  assert.ok(page.includes("selectedJourney === 2 && isAiTeam"));
  assert.ok(page.includes("effectiveJourneyStep >= 2"));
  assert.ok(page.includes("AI 활성화팀 담당자는 FEA 작성·보완을 담당합니다."));
  assert.ok(page.includes("G1 승인과 개발 담당자 지정 권한은 팀장에게 있습니다."));
  assert.ok(page.includes("showLeaderDecisionOnly"));
  assert.ok(page.includes('g1Decision === "PENDING"'));
  assert.ok(page.includes("팀장 승인 완료"));
  assert.ok(page.includes("homeEmbedded"));
  assert.ok(page.includes("homeG1Resolutions"));
  assert.ok(page.includes("initialG1Resolution={currentG1Resolution}"));
  assert.ok(page.includes("[current.no]: { decision, assignee, reason }"));
  assert.ok(css.includes(".schedule-g1-status.conditional"));
});

test("closes rejected G2 rounds and uses the correct three signers", () => {
  assert.ok(page.includes("canActOnG2 && !rejected && myApprovalPending"));
  assert.ok(page.includes("이 승인 라운드는 보완 요청으로 종료되었습니다"));
  assert.ok(page.includes("요구자·개발 담당자·AI활성화팀장"));
  assert.ok(page.includes("보완 중인 ARD 보기"));
  assert.ok(page.includes("ARD 보완하기"));
  assert.ok(page.includes("보완 완료 · G2 재상신"));
  assert.ok(page.includes("g2ReworkProjects"));
  assert.ok(page.includes("G2 재검토 진행 중"));
  assert.ok(page.includes("ARD v0.9가 보완 완료되어 새 G2 승인 라운드가 열렸습니다"));
  assert.ok(page.includes("activeSections"));
  assert.ok(css.includes(".ard-rework-banner"));
});

test("locks pilot, G4, OPS and CHG behind prior approvals", () => {
  assert.ok(page.includes("const g3Approved ="));
  assert.ok(page.includes("G4 확산 승인은 아직 열리지 않았습니다"));
  assert.match(page, /G3 배포 승인 전에는 파일럿 실적과 G4 권고를 작성할\s*수 없습니다/);
  assert.match(page, /G4 공동 승인 전에는 운영 대장과\s*개선 이력을 조회하거나\s*등록할 수 없습니다/);
  assert.ok(page.includes("const pilotGateReady ="));
  assert.ok(page.includes("pilotResultsSaved"));
  assert.ok(page.includes("pilotCriticalErrors"));
  assert.ok(page.includes("Owner 승인 → AI활성화팀장 최종 승인"));
  assert.ok(page.includes("파일럿 연장·보완 사유가 기록되었습니다"));
});

test("shows only operational agents in OPS and keeps rows accessible", () => {
  assert.ok(page.includes('id: "AGT-2026-011"'));
  assert.ok(page.includes('id: "AGT-2026-008"'));
  assert.ok(!page.includes('id: "AGT-2026-021"'));
  assert.ok(page.includes('role="button"'));
  assert.ok(page.includes('event.key === "Enter" || event.key === " "'));
});

test("prevents page-level horizontal overflow", () => {
  assert.match(css, /html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.ok(css.includes(".oneview-grid"));
  assert.ok(css.includes(".wizard-steps"));
});

test("keeps the new Agent request dialog readable", () => {
  assert.ok(css.includes("New Agent request dialog legibility"));
  assert.ok(css.includes(".chat-wizard .chat-message p"));
  assert.ok(css.includes("font-size: 28px !important"));
  assert.ok(css.includes("font-size: 14px !important"));
});

test("limits user deletion to intake and gives admin full project controls", () => {
  assert.ok(page.includes("agent-portal-deleted-projects"));
  assert.ok(page.includes("agent-portal-project-overrides"));
  assert.ok(page.includes("current.journeyStep === 0"));
  assert.ok(page.includes("role === ACCOUNT_ROLES.user"));
  assert.ok(page.includes("과제 삭제"));
  assert.ok(page.includes("Agent 과제 관리"));
  assert.ok(page.includes("Admin은 생애주기 단계와 관계없이 모든 과제를 수정하거나"));
  assert.ok(page.includes("onUpdateProject"));
  assert.ok(page.includes("deleteAnyProject"));
  assert.ok(page.includes("teamRequirements.map(teamRequirementAsHomeProject)"));
  assert.ok(css.includes("Project deletion and admin-wide project controls"));
});
