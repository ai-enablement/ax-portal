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

test("keeps role navigation and home actions separated", () => {
  assert.ok(page.includes("role === ACCOUNT_ROLES.user"));
  assert.ok(
    page.includes('view === "teamboard" && role.includes("AI활성화팀")'),
  );
  assert.ok(page.includes("신규 접수 3건 확인"));
  assert.ok(page.includes("AI 활성화팀 대시보드"));
});

test("hides lifecycle navigation from every account role", () => {
  assert.ok(page.includes('.filter((group) => group.label !== "AGENT LIFECYCLE")'));
});

test("uses the same one-page home for leader and member with leader actions", () => {
  assert.match(
    page,
    /role === ACCOUNT_ROLES\.leader \|\|\s*role === ACCOUNT_ROLES\.member \|\|\s*role === ACCOUNT_ROLES\.user/,
  );
  assert.ok(page.includes("팀 전체 Agent 과제"));
  assert.ok(page.includes("팀장 감독·승인"));
  assert.ok(page.includes("viewerMode={!isAiTeam}"));
  assert.ok(page.includes("G1 판정 확정 · FEA 업데이트"));
  assert.ok(page.includes("G3 최종 승인"));
  assert.ok(page.includes("G4 최종 승인"));
});

test("keeps gate approvals with the leader and system administration separate", () => {
  assert.ok(page.includes("const approvalQueue"));
  assert.ok(page.includes('gate: "G3"'));
  assert.ok(page.includes('gate: "G2"'));
  assert.ok(page.includes('role === ACCOUNT_ROLES.admin'));
  assert.ok(page.includes("MS 계정 역할, 프로젝트 권한 정책과 변경 감사 이력"));
  assert.ok(page.includes("G1 0 · G2 2 · G3 1 · G4 0"));
});

test("uses four account roles and project-scoped assignments", () => {
  for (const role of ["leader", "member", "user", "admin"])
    assert.ok(page.includes(`${role}:`));
  for (const relationship of [
    "REQUESTER",
    "OWNER",
    "DEVELOPER",
    "REVIEWER",
    "OPERATOR",
  ])
    assert.ok(page.includes(`\"${relationship}\"`));
  assert.ok(page.includes('"2026-018": { [ACCOUNT_ROLES.member]: ["REVIEWER"] }'));
  assert.ok(page.includes("hasProjectRelationship(role, project.no)"));
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
    "우선 확인 과제",
    "지연 위험",
  ])
    assert.ok(page.includes(label));
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
});
