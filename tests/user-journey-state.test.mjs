import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("persists a submitted intake and advances it to feasibility waiting", () => {
  assert.match(page, /agent-portal-submitted-projects/);
  assert.match(page, /status: "타당성 평가 대기"/);
  assert.match(page, /journeyStep: 1/);
  assert.match(page, /onSubmit\(\[\.\.\.answers\], requestTitle\)/);
  assert.match(page, /AI활성화팀의 인터뷰와 FEA 작성이 시작되면/);
});

test("keeps future gates locked and closes a rejected G2 approval round", () => {
  assert.match(page, /stage\.kind === "gate" \? "선행 단계 필요" : "예정"/);
  assert.match(page, /canActOnG2 && !rejected && myG2Vote === "PENDING"/);
  assert.match(page, /이 승인 라운드는 보완 요청으로 종료되었습니다/);
  assert.match(page, /기존 승인자는 지금 다시 승인할 수 없습니다/);
});

test("requires G4 before exposing OPS and CHG", () => {
  assert.match(page, /const isOperating = project\.journeyStep >= 9/);
  assert.match(page, /G4 공동 승인 후 이 요청 과제의 운영 기록과 개선 이력이 자동 생성됩니다/);
  assert.match(page, /G4 공동 승인 전에는 운영 대장과 개선 이력을 조회하거나 등록할 수 없습니다/);
});

test("keeps DEP and G3 state consistent for the pilot project", () => {
  assert.match(page, /projectNo === "2026-014" \|\| projectNo === "2026-018" \? Array\(9\)\.fill\(true\)/);
  assert.match(page, /const depReady = depChecks\.every\(Boolean\)/);
  assert.match(page, /visibleG3Decision === "APPROVED" \? "파일럿 진행"/);
});

test("prevents page-level horizontal overflow in the user journey", () => {
  assert.match(css, /html,body\{overflow-x:hidden\}/);
  assert.match(css, /\.oneview-grid\{grid-template-columns:minmax\(280px,\.52fr\) minmax\(0,1\.7fr\)\}/);
  assert.match(css, /\.wizard-steps\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/);
});
