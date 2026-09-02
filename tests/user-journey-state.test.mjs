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
  assert.ok(page.includes('status: historical ? `${currentStage.title} 진행 중` : "타당성 평가 대기"'));
  assert.ok(page.includes("onSubmit("));
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
  assert.ok(!page.includes('className="wizard-document-preview"'));
  assert.ok(page.includes("resolvedRequester"));
});

test("assigns intake categories by role and keeps general users on individual intake", () => {
  for (const category of ["개별 접수", "아이디어톤", "D2B", "RPA(기존 과제)", "기타"])
    assert.ok(page.includes(category));
  assert.ok(page.includes('role === ACCOUNT_ROLES.user'));
  assert.ok(page.includes('? "개별 접수"'));
  assert.ok(page.includes('aria-label="과제 카테고리"'));
  assert.ok(page.includes("category: project.category || \"개별 접수\""));
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
  assert.ok(page.includes("G1 판정은 팀장, 개발 담당자 배정은 Admin 권한입니다."));
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
  assert.match(css, /\.chat-wizard-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.ok(css.includes(".chat-wizard-grid > .wizard-form-panel"));
  assert.ok(css.includes("width: 100%"));
});

test("imports historical projects with past dates, a current stage, and deferred documents", () => {
  assert.ok(page.includes('registrationMode === "HISTORICAL"'));
  assert.ok(page.includes("과거 과제 이관"));
  assert.ok(page.includes("과거 과제 접수 날짜"));
  assert.ok(page.includes("과거 과제 현재 진행 단계"));
  assert.ok(page.includes("documentsDeferred: historical"));
  assert.ok(page.includes("historicalBaselineStep: historical ? journeyStep : undefined"));
  assert.ok(page.includes("최종 확인 · 과거 과제 이관"));
  assert.ok(page.includes("선택한 현재 단계부터 순서대로 완료해야 다음 단계가 열립니다."));
  assert.ok(page.includes("current.historicalImport && selectedJourney > effectiveJourneyStep"));
  assert.ok(page.includes("requiresHistoricalG1Record"));
  assert.ok(page.includes("G1 착수 판정 이관"));
  assert.ok(page.includes('["GO", "CONDITIONAL"] as const'));
  assert.ok(page.includes("historicalG1Decision"));
  assert.ok(page.includes("importedG1Record"));
  assert.ok(page.includes("importedG2Record"));
  assert.ok(page.includes("importedG3Record"));
  assert.ok(page.includes("importedG4Record"));
  assert.ok(page.includes('importedG2Record ? { "4": importedG2Record } : {}'));
  assert.ok(page.includes('importedG3Record ? { "6": importedG3Record } : {}'));
  assert.ok(page.includes('importedG4Record ? { "8": importedG4Record } : {}'));
  assert.ok(page.includes("현재 단계 이전 Gate 자동 승인"));
  assert.ok(page.includes("G2 개발 착수"));
  assert.ok(page.includes("프로세스 진행 이력만 등록된 상태입니다."));
  assert.ok(page.includes("해당 단계에서 문서 추가"));
  assert.ok(!page.includes('min="2026-08-29"'));
  assert.ok(css.includes(".historical-project-fields"));
  assert.ok(css.includes(".deferred-document-card"));
});

test("assigns multiple registered developers while importing a historical project", () => {
  assert.ok(page.includes("teamAccounts={teamAccounts}"));
  assert.ok(page.includes("historicalDeveloperIds"));
  assert.ok(page.includes("historicalDeveloperIds.length > 0"));
  assert.ok(page.includes("개발 담당자 지정"));
  assert.ok(page.includes('type="checkbox"'));
  assert.ok(page.includes("developerIds: historicalDeveloperIds"));
  assert.ok(page.includes("developerNames"));
  assert.ok(page.includes("const eligibleDevelopers = teamAccounts"));
  assert.ok(page.includes("일반 User를 제외한 등록 계정"));
  assert.ok(css.includes(".historical-developer-list"));
});

test("opens deferred documents in the selected project and restores intake values", () => {
  assert.ok(page.includes("openedDeferredDocuments"));
  assert.ok(page.includes("openDeferredDocumentEditor"));
  assert.ok(page.includes("selectedJourney !== 0"));
  assert.ok(page.includes("current.receivedDate || current.updated"));
  assert.ok(page.includes('current.historicalImport ? "과거 Agent 과제 이관"'));
  assert.ok(page.includes("current.intakeAnswers?.[0]?.trim()"));
  assert.ok(page.includes("이관 정보 · 보완 필요"));
  assert.ok(!page.includes('onClick={() => setView(current.route)}>\n                  해당 단계에서 문서 추가'));
});

test("starts historical FEA as a real draft and lets contributors complete intake", () => {
  assert.ok(page.includes("deferredDocumentOpened || Boolean(deferredDocumentRecord)"));
  assert.ok(page.includes("editable && (!ready || forceDraft)"));
  assert.ok(page.includes("blankStart={forceDraft}"));
  assert.ok(page.includes("function HistoricalIntakeEditor"));
  assert.ok(page.includes("요구 접수서 보완 작성"));
  assert.ok(page.includes("intakeAnswers: answers"));
  assert.ok(page.includes("onUpdateProject(current.no"));
  assert.ok(css.includes(".historical-intake-editor-grid"));
});

test("makes every historical stage writable without fixtures and enforces assignee ownership", () => {
  assert.ok(page.includes("function HistoricalStageDocumentEditor"));
  assert.ok(page.includes("historicalDocuments?: Record"));
  assert.ok(page.includes("assignedDeveloperIds.length > 0"));
  assert.ok(page.includes("isAssignedHistoricalDeveloper"));
  assert.ok(page.includes("role === ACCOUNT_ROLES.leader || role === ACCOUNT_ROLES.member"));
  assert.ok(page.includes("지정 담당자만 작성 가능"));
  assert.ok(page.includes("historicalDocuments: {"));
  assert.ok(page.includes('status: "draft" | "complete"'));
  assert.ok(css.includes(".historical-stage-editor-grid"));
  assert.ok(css.includes(".historical-stage-permission"));
});

test("uses a full-width historical intake and restores the dedicated G1 approval flow", () => {
  assert.ok(page.includes('current.historicalImport ? "historical" : ""'));
  assert.ok(page.includes("function HistoricalG1Approval"));
  assert.ok(page.includes("팀장이 G1 판정을 확정한 뒤 Admin이 개발 담당자를 배정합니다."));
  assert.ok(page.includes("G1 판정 확정"));
  assert.ok(page.includes("개발 담당자 배정 확정"));
  assert.ok(page.includes("canDecide={role === ACCOUNT_ROLES.leader}"));
  assert.ok(page.includes("canAssign={role === ACCOUNT_ROLES.admin}"));
  assert.ok(page.includes("allowMissingFea={historicalBaselineStep >= 2}"));
  assert.ok(page.includes("과거 과제 이관 기준 · 선행 문서 작성 생략"));
  assert.ok(page.includes('authorName: identity?.displayName || "FEA 작성 담당자"'));
  assert.ok(page.includes('selectedJourney === 2 &&'));
  assert.ok(css.includes(".intake-result-layout.historical"));
  assert.ok(css.includes(".historical-g1-developers"));
  assert.ok(css.includes("flex-wrap: wrap"));
});

test("shows no completed or current lifecycle step when there are no projects", () => {
  assert.match(page, /const effectiveJourneyStep = !hasProjects\s*\? -1/);
  assert.ok(page.includes('title="선택된 Agent 과제가 없습니다."'));
  assert.ok(page.includes("const showCurrentStage = () =>"));
  assert.ok(page.includes("scrollIntoView"));
  assert.ok(page.includes('id="current-stage-detail"'));
});

test("limits user deletion to intake and gives admin full project controls", () => {
  assert.ok(page.includes("agent-portal-deleted-projects"));
  assert.ok(page.includes("agent-portal-project-overrides"));
  assert.ok(page.includes("current.journeyStep === 0"));
  assert.ok(page.includes("role === ACCOUNT_ROLES.user"));
  assert.ok(page.includes("role === ACCOUNT_ROLES.admin ||"));
  assert.ok(page.includes("Admin 삭제는 현재 단계와 관계없이 적용됩니다."));
  assert.ok(page.includes("과제 삭제"));
  assert.ok(page.includes("Agent 과제 관리"));
  assert.ok(page.includes("Admin은 생애주기 단계와 관계없이 모든 과제를 수정하거나"));
  assert.ok(page.includes("onUpdateProject"));
  assert.ok(page.includes("deleteAnyProject"));
  assert.ok(page.includes("teamWorkloadProjects.map(teamRequirementAsHomeProject)"));
  assert.ok(css.includes("Project deletion and admin-wide project controls"));
});
