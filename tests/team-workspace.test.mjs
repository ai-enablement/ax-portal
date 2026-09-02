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
const compactCss = await readFile(
  new URL("../app/team-dashboard-compact.css", import.meta.url),
  "utf8",
);

test("keeps role navigation and home actions separated", () => {
  assert.ok(page.includes("role === ACCOUNT_ROLES.user"));
  assert.ok(
    page.includes('item.id === "teamboard" && role !== ACCOUNT_ROLES.user'),
  );
  assert.ok(page.includes("신규 접수 3건 확인"));
  assert.ok(page.includes("AI 활성화팀 대시보드"));
});

test("hides lifecycle navigation from every account role", () => {
  assert.ok(page.includes('.filter((group) => group.label !== "AGENT LIFECYCLE")'));
});

test("opens dashboard projects in the matching home Agent record", () => {
  assert.ok(!page.includes("일정·작업 보기"));
  assert.ok(!page.includes("일정 · 작업 보기"));
  assert.ok(!page.includes("업무 화면 열기"));
  assert.ok(page.includes('openWorkflow("home", item.id)'));
  assert.ok(page.includes("홈에서 Agent 과제 보기"));
  assert.ok(page.includes("teamRequirementAsHomeProject"));
  assert.ok(page.includes("projectNo={workflowTarget}"));
});

test("uses the same one-page home for every account role", () => {
  assert.match(
    page,
    /role === ACCOUNT_ROLES\.member \|\| role === ACCOUNT_ROLES\.bts \|\| role === ACCOUNT_ROLES\.bpSolution \|\| role === ACCOUNT_ROLES\.leader \|\| role === ACCOUNT_ROLES\.admin/,
  );
  assert.ok(page.includes("팀 전체 Agent 과제"));
  assert.ok(page.includes("팀장 감독·승인"));
  assert.ok(page.includes("viewerMode={!isProjectContributor}"));
  assert.ok(page.includes("G1 판정 확정"));
  assert.ok(page.includes("개발 담당자 배정 확정"));
  assert.ok(page.includes("G3 최종 승인"));
  assert.ok(page.includes("G4 최종 승인"));
  assert.ok(page.includes('role === ACCOUNT_ROLES.leader || role === ACCOUNT_ROLES.admin'));
});

test("keeps gate approvals with the leader and system administration separate", () => {
  assert.ok(page.includes("const approvalQueue: ApprovalQueueItem[] = []"));
  assert.ok(page.includes('code: "G3"'));
  assert.ok(page.includes('code: "G2"'));
  assert.ok(page.includes('role === ACCOUNT_ROLES.admin'));
  assert.ok(page.includes("MS 계정 역할, 프로젝트 권한 정책과 변경 감사 이력"));
  assert.ok(page.includes("등록된 Agent 과제가 없습니다"));
});

test("uses six account roles and project-scoped assignments", () => {
  for (const role of ["leader", "member", "bts", "bpSolution", "user", "admin"])
    assert.ok(page.includes(`${role}:`));
  for (const relationship of [
    "REQUESTER",
    "OWNER",
    "DEVELOPER",
    "REVIEWER",
    "OPERATOR",
  ])
    assert.ok(page.includes(`\"${relationship}\"`));
  assert.ok(page.includes("> = {};"));
  assert.ok(page.includes("getProjectRelationships"));
});

test("keeps the standard lifecycle order and role ownership", () => {
  const labels = [
    "요구 접수",
    "타당성 평가",
    "착수 승인",
    "요구 정의",
    "개발 착수",
    "설계·개발·평가",
    "배포 승인",
    "파일럿",
    "확산 승인",
    "운영·개선",
  ];
  let cursor = -1;
  for (const label of labels) {
    const next = page.indexOf(`label: "${label}"`, cursor + 1);
    assert.ok(next > cursor, `missing lifecycle step: ${label}`);
    cursor = next;
  }
  assert.ok(page.includes("요구자 + 개발 담당자 + AI활성화팀장"));
  assert.ok(
    page.includes("동료 리뷰어 + AI활성화팀장 (상 트랙은 정보보호 추가)"),
  );
  assert.ok(page.includes("프로젝트 Owner + AI활성화팀장"));
});

test("uses the confirmed roster and project-level status", () => {
  for (const name of [
    "최병두",
    "정지헌",
    "허정환",
    "허시영",
    "황수정",
    "박혜빈",
    "이재승",
  ])
    assert.ok(page.includes(name));
  for (const label of [
    "프로젝트별 진행 현황",
    "담당자별 업무 분포",
    "카테고리별 진행 현황",
    "우선 확인 과제",
    "지연 위험",
  ])
    assert.ok(page.includes(label));
});

test("switches team workload between assignee and project category", () => {
  assert.ok(page.includes('useState<"member" | "category">("member")'));
  assert.ok(page.includes("업무 분포 보기 방식"));
  assert.ok(page.includes("PROJECT_CATEGORIES.map"));
  assert.ok(page.includes("category-workload-row"));
});

test("enforces gate separation and autonomy track escalation", () => {
  assert.ok(page.includes("요구자·개발 담당자·AI활성화팀장"));
  assert.ok(page.includes('["L2", "L3", "L4"].includes(next)'));
  assert.ok(page.includes('setTrackDraft("HIGH")'));
  for (const roleClass of [
    "role-reviewer-delivery",
    "role-owner-delivery",
    "role-security-delivery",
  ])
    assert.ok(page.includes(roleClass));
});

test("lets the assigned developer write DES EVP and EVR while other roles review", () => {
  assert.ok(page.includes("canEditCurrentProject"));
  assert.ok(page.includes("documentDrafts"));
  assert.ok(page.includes("savedDocumentSections"));
  assert.ok(page.includes("섹션 저장 · 완료"));
  assert.ok(page.includes("문서 작성 완료"));
  assert.ok(page.includes("조회·검토 전용"));
  assert.ok(page.includes("프로젝트 개발 담당자"));
  assert.ok(page.includes("독립 리뷰"));
  assert.ok(page.includes("보완 요청을 개발 담당자에게 전달했습니다"));
  assert.ok(css.includes(".delivery-document-editor"));
  assert.ok(css.includes(".delivery-document-reviewer"));
  assert.ok(css.includes(".document-readonly-note"));
});

test("requires the team leader to assign an independent G3 reviewer", () => {
  assert.ok(page.includes("reviewerAssignments"));
  assert.ok(page.includes("동료 리뷰어 배정"));
  assert.ok(page.includes("G3 동료 리뷰어 선택"));
  assert.ok(page.includes("개발 담당자와 다른 AI 활성화팀 팀원"));
  assert.ok(page.includes("배정된 리뷰어에게 EVR·DEP 검토와 G3 서명 권한"));
  assert.ok(page.includes("Boolean(assignedReviewer)"));
  assert.ok(css.includes(".g3-reviewer-assignment"));
});

test("auto-approves the G3 reviewer signature when TBD is assigned", () => {
  assert.ok(page.includes('"TBD"'));
  assert.ok(page.includes('const tbdReviewer = reviewerDraft === "TBD"'));
  assert.ok(page.includes("setG3ReviewerApproved(tbdReviewer)"));
  assert.ok(page.includes("TBD 설정 · 리뷰어 승인 자동 완료"));
  assert.ok(page.includes("리뷰어 승인을 자동 완료했습니다"));
});

test("lets the project developer author DEP and all six UG sections", () => {
  assert.ok(page.includes("depDocumentDrafts"));
  assert.ok(page.includes("ugDocumentDrafts"));
  assert.ok(page.includes("DEP 작성 내용 저장"));
  assert.ok(page.includes("UG 작성 내용 저장"));
  assert.ok(page.includes("사용자 가이드 In Scope"));
  assert.ok(page.includes("사용자 가이드 Out of Scope"));
  assert.ok(page.includes("사용자 가이드 사용 단계"));
  assert.ok(page.includes("feedbackMethod"));
  assert.ok(page.includes("pilotDecision"));
  assert.ok(page.includes("disabled={!canEditCurrentProject}"));
});

test("preserves the full-width readable visual baseline", () => {
  for (const selector of [
    ".team-workspace-page",
    ".page:not(.team-workspace-page)",
    ".delivery-page .g3-evidence-grid strong",
  ])
    assert.ok(css.includes(selector));
  assert.ok(
    css.includes("Desktop typography bump: all content except the sidebar"),
  );
  assert.ok(
    css.includes(
      "Agent Life Cycle workspaces use the same enlarged fixed-label typography",
    ),
  );
  assert.ok(css.includes("Global legibility scale"));
  assert.ok(css.includes("font-size: 35px !important"));
});

test("keeps workload names, totals, and table labels legible without overlap", () => {
  assert.match(compactCss, /minmax\(190px, 1\.25fr\)/);
  assert.match(compactCss, /minmax\(130px, 0\.8fr\)/);
  assert.match(compactCss, /\.workload-person strong\s*\{[^}]*font-size: 14px !important/s);
  assert.match(compactCss, /\.workload-head\s*\{[^}]*font-size: 11px !important/s);
  assert.match(compactCss, /@media \(max-width: 1400px\)/);
});
