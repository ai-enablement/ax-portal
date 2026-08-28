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
  assert.ok(page.includes('role === "일반 User"'));
  assert.ok(
    page.includes('view === "teamboard" && role.includes("AI활성화팀")'),
  );
  assert.ok(page.includes("신규 접수 3건 확인"));
  assert.ok(page.includes("AI 활성화팀 대시보드"));
});

test("uses one consistent approval queue and gate filter", () => {
  assert.ok(page.includes("const approvalQueue"));
  assert.ok(page.includes('gate: "G3"'));
  assert.ok(page.includes('gate: "G2"'));
  assert.ok(page.includes("visibleApprovals"));
  assert.ok(page.includes("승인 대기 과제가 없습니다"));
  assert.ok(page.includes("G1 0 · G2 2 · G3 1 · G4 0"));
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
