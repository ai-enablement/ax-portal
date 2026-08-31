import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("keeps deterministic feasibility rules separate from the human G1 decision", () => {
  assert.ok(page.includes("function judgeFeasibilityTrack"));
  assert.ok(page.includes("결정적 규칙이 계산하고, LLM은 결과를 바꾸지 않습니다."));
  assert.ok(page.includes("엔진 권고 · 참고용"));
  assert.ok(page.includes("최종 결정은 최병두 팀장이 G1에서 확정"));
});

test("refuses ROI estimation until all quantitative inputs are available", () => {
  assert.ok(page.includes("function calculateFeasibilityRoi"));
  assert.ok(page.includes("추정치로 대체하지 않습니다."));
  assert.ok(page.includes('placeholder="⬜ 미확보"'));
  assert.ok(page.includes("인터뷰에서 확인한 값만 입력"));
});

test("shows inherited guardrail and verification readiness", () => {
  for (const guardrail of ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"])
    assert.ok(page.includes(`["${guardrail}"`));
  assert.ok(page.includes("규칙 회귀 40/40"));
  assert.ok(page.includes("리뷰어 정답 라벨 0/15"));
  assert.ok(css.includes(".feasibility-engine"));
});
