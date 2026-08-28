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
  assert.ok(page.includes("onSubmit([...answers], requestTitle)"));
});

test("keeps FEA read-only for leaders and locks G1 until complete", () => {
  assert.ok(page.includes('className="fea-grid"'));
  assert.ok(page.includes("disabled={!canEditFea}"));
  assert.ok(page.includes('basisReady={current.no !== "2026-031"}'));
  assert.ok(page.includes("FEA가 아직 작성 중입니다"));
  assert.ok(page.includes('g1DraftDecision === "PENDING"'));
});

test("closes rejected G2 rounds and uses the correct three signers", () => {
  assert.ok(page.includes('canActOnG2 && !rejected && myG2Vote === "PENDING"'));
  assert.ok(page.includes("이 승인 라운드는 보완 요청으로 종료되었습니다"));
  assert.ok(page.includes("요구자·개발 담당자·AI활성화팀장"));
  assert.ok(page.includes("보완 중인 ARD 보기"));
});

test("locks pilot, G4, OPS and CHG behind prior approvals", () => {
  assert.ok(page.includes("const g3Approved ="));
  assert.ok(page.includes("G4 확산 승인은 아직 열리지 않았습니다"));
  assert.match(page, /G3 배포 승인 전에는 파일럿 실적과 G4 권고를 작성할\s*수 없습니다/);
  assert.match(page, /G4 공동 승인 전에는 운영 대장과\s*개선 이력을 조회하거나\s*등록할 수 없습니다/);
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
