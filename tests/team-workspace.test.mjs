import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("keeps the team dashboard out of non-AI role navigation", () => {
  assert.match(page, /role === "일반 User"[\s\S]*?new Set<View>\(\["home", "intake", "definition", "delivery", "hub", "gallery"\]\)/);
  assert.match(page, /view === "teamboard" && role\.includes\("AI활성화팀"\)[\s\S]*?<LegacyTeamWorkspaceDashboard/);
  assert.match(page, /item\.id === "teamboard" && role\.includes\("AI활성화팀"\)/);
});

test("provides the project Owner as a governed role without team workspace access", () => {
  assert.match(page, /<option>현업 Owner 박정민 팀장<\/option>/);
  assert.match(page, /role\.includes\("현업 Owner"\)/);
  assert.match(page, /프로젝트 Owner \+ AI활성화팀장/);
  assert.doesNotMatch(page, /view === "teamboard" && role\.includes\("Owner"\)/);
});

test("covers intake, active, and completed demand with item-level records", () => {
  const records = page.match(/const teamRequirements:[\s\S]*?\n\];/)?.[0] ?? "";
  assert.equal((records.match(/status: "신규 접수"/g) ?? []).length, 3);
  assert.equal((records.match(/status: "진행 중"/g) ?? []).length, 6);
  assert.equal((records.match(/status: "완료"/g) ?? []).length, 3);
  assert.match(page, /프로젝트별 진행 현황/);
  assert.doesNotMatch(page, /담당자별 업무량|요청 팀별 현황|놓치면 안 되는 항목/);
});

test("puts lifecycle first, removes duplicate FEA counters, and keeps linked requirement details", () => {
  for (const label of ["Agent Life Cycle", "요구 접수", "요구 정의", "진행 중", "완료", "지연 위험", "프로젝트별 진행 현황", "담당자별 업무 분포", "우선 확인 과제", "다음 행동", "일정·작업 보기", "업무 화면 열기"]) {
    assert.ok(page.includes(label), `missing dashboard capability: ${label}`);
  }
  assert.doesNotMatch(page, /FEA 판정 누계/);
  const legacyStart = page.indexOf("function LegacyTeamWorkspaceDashboard");
  const legacyEnd = page.indexOf("function TeamPortfolioAnalytics", legacyStart);
  const dashboard = page.slice(legacyStart, legacyEnd);
  assert.ok(dashboard.indexOf("team-lifecycle-overview") < dashboard.indexOf("team-kpi-grid"));
  const lifecycle = dashboard.match(/const lifecycleSteps = \[[\s\S]*?\n  \];/)?.[0] ?? "";
  const lifecycleLabels = ["요구 접수", "타당성 평가", "착수 승인", "요구 정의", "개발 착수", "설계·개발·평가", "배포 승인", "파일럿", "확산 승인", "운영·개선"];
  lifecycleLabels.reduce((previousIndex, label) => {
    const currentIndex = lifecycle.indexOf(`label: "${label}"`);
    assert.ok(currentIndex > previousIndex, `lifecycle step is missing or out of order: ${label}`);
    return currentIndex;
  }, -1);
  assert.doesNotMatch(lifecycle, /현재 단계|예정|승인 대기|caption:|state:|route:/);
  assert.match(dashboard, /요구 접수부터 운영·개선까지의 표준 진행 순서/);
  assert.match(dashboard, /setSelectedLifecycleMarker\(step\.marker\)/);
  assert.match(dashboard, /aria-pressed=\{selectedLifecycleStep\.marker === step\.marker\}/);
  assert.match(dashboard, /className=\{`lifecycle-detail-panel/);
  for (const label of ["근거 문서", "주요 수행", "승인자", "승인 내용"]) assert.ok(dashboard.includes(label));
  for (const approver of ["AI활성화팀장", "요구자 + 프로젝트 Owner(현업 부서장) + AI활성화팀장", "동료 리뷰어 + AI활성화팀장 (상 트랙은 정보보호 추가)", "프로젝트 Owner + AI활성화팀장"]) assert.ok(dashboard.includes(approver));
  assert.doesNotMatch(dashboard, /team-compact-schedule|mode === "gantt"|mode === "calendar"|전체 간트 보기|전체 캘린더 보기/);
  assert.match(page, /setView\("hub"\)/);
  assert.match(page, /const routeFor =/);
  assert.match(page, /function TeamProjectModal/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /const \[popupItem, setPopupItem\]/);
  assert.doesNotMatch(page, /function TeamRequirementDetail/);
});

test("uses the confirmed AI activation team roster", () => {
  const roster = page.match(/const aiTeamMembers = \[[^\]]+\]/)?.[0] ?? "";
  for (const name of ["최병두", "정지헌", "허정환", "허시영", "황수정", "박혜빈", "이재승"]) {
    assert.ok(roster.includes(name), `missing AI activation team member: ${name}`);
  }
  const records = page.match(/const teamRequirements:[\s\S]*?\n\];/)?.[0] ?? "";
  assert.doesNotMatch(records, /assignee: "(?:김지훈|이민지)"/);
});

test("gives every AI activation team role the compact portfolio dashboard", () => {
  for (const label of ["팀 포트폴리오 & 리소스", "담당자별 업무 분포", "우선 확인 과제", "프로젝트별 진행 현황", "주의", "미배정"]) {
    assert.ok(page.includes(label), `missing team lead insight: ${label}`);
  }
  assert.match(page, /<TeamPortfolioAnalytics onMember=/);
  assert.match(page, /label: "AI 활성화팀 대시보드"/);
});

test("enforces gate separation and autonomy-based track escalation", () => {
  assert.match(page, /요구자 · 프로젝트 Owner · AI활성화팀장/);
  assert.match(page, /동료 리뷰어 \+ AI활성화팀장 \(상 트랙은 정보보호 추가\)/);
  assert.match(page, /프로젝트 Owner \+ AI활성화팀장/);
  assert.match(page, /\["L2", "L3", "L4"\]\.includes\(next\)/);
  assert.match(page, /setTrackDraft\("HIGH"\)/);
  assert.match(page, /role-reviewer-delivery/);
  assert.match(page, /role-owner-delivery/);
  assert.match(page, /role-security-delivery/);
});

test("uses the full desktop width and larger dashboard typography", () => {
  assert.match(css, /\.team-workspace-page\{width:100%;max-width:none/);
  assert.match(css, /\.team-workspace-page \.team-workspace-hero h1\{font-size:34px\}/);
  assert.match(css, /\.team-workspace-page \.team-kpi-card strong\{font-size:30px\}/);
  assert.match(css, /\.team-workspace-page \.lead-insight-card>header h2[^{]*\{font-size:18px\}/);
  assert.match(css, /@media\(min-width:1500px\)[\s\S]*?\.team-workspace-page\{padding-top:32px;padding-right:28px;padding-left:28px\}/);
});

test("applies the same full-width readable layout to every other portal page", () => {
  assert.match(css, /\.page:not\(\.team-workspace-page\)\{width:100%;max-width:none/);
  assert.match(css, /\.page:not\(\.team-workspace-page\) :where\(h1\)\{font-size:32px!important\}/);
  assert.match(css, /\.page:not\(\.team-workspace-page\) :where\(p\)\{font-size:12px!important\}/);
  assert.match(css, /\.page:not\(\.team-workspace-page\) :where\(button,input,select,textarea\)\{font-size:12px!important\}/);
  assert.match(css, /@media\(min-width:1500px\)\{\.page:not\(\.team-workspace-page\)\{padding-right:28px;padding-left:28px\}\}/);
});

test("bumps all non-sidebar desktop typography by at least three pixels", () => {
  assert.match(css, /\/\* Desktop typography bump: all content except the sidebar \*\//);
  assert.match(css, /\.main :where\(h1\)\{font-size:37px!important\}/);
  assert.match(css, /\.main :where\(p\)\{font-size:15px!important\}/);
  assert.match(css, /\.main :where\(small\)\{font-size:14px!important\}/);
  assert.match(css, /\.main :where\(button,input,select,textarea\)\{font-size:15px!important\}/);
  const bump = css.split("/* Desktop typography bump: all content except the sidebar */")[1] ?? "";
  assert.doesNotMatch(bump, /\.sidebar\s/);
});

test("also enlarges fixed-size labels on every role home screen", () => {
  assert.match(css, /Home dashboards contain fixed-size span\/strong labels/);
  assert.match(css, /:is\(\.dashboard,\.team-home,\.role-home,\.user-home\) :where\(span\)\{font-size:14px!important\}/);
  assert.match(css, /:is\(\.dashboard,\.team-home,\.role-home,\.user-home\) :where\(strong\)\{font-size:16px!important\}/);
  assert.match(css, /:is\(\.dashboard,\.team-home,\.role-home,\.user-home\) \.metrics article>strong\{font-size:34px!important\}/);
});

test("extends the same typography to every Agent Life Cycle workspace", () => {
  for (const className of ["intake-page", "requirement-page", "delivery-page", "operations-page"]) assert.ok(page.includes(className));
  assert.match(css, /Agent Life Cycle workspaces use the same enlarged fixed-label typography/);
  assert.match(css, /:is\(\.intake-page,\.requirement-page,\.delivery-page,\.operations-page\) :where\(span\)\{font-size:14px!important\}/);
  assert.match(css, /:is\(\.intake-page,\.requirement-page,\.delivery-page,\.operations-page\) :where\(strong\)\{font-size:16px!important\}/);
  assert.match(css, /\.delivery-page \.g3-evidence-grid strong\{font-size:19px!important\}/);
});
