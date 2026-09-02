import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const schema = fs.readFileSync(
  new URL("../database/postgresql/agent_governance_portal_schema.sql", import.meta.url),
  "utf8",
);

test("Gallery supports both governed operation and personal build submissions", () => {
  assert.match(page, /source: "OPERATIONS"/);
  assert.match(page, /source: "PERSONAL"/);
  assert.match(page, /운영 단계 최종 승인 후 등록/);
  assert.match(page, /내가 직접 만든 Agent 등록/);
  assert.match(page, /G4 확산 승인 완료/);
});

test("Gallery submission covers the requested creation platforms", () => {
  for (const platform of [
    "Vibe Coding",
    "Copilot Studio",
    "Power Automate",
    "Power Apps",
  ]) {
    assert.match(page, new RegExp(platform));
  }
});

test("role actions separate user submission from AI enablement review", () => {
  assert.match(page, /내 Agent 올리기/);
  assert.match(page, /검토 완료 · 등록 권고/);
  assert.match(page, /최종 승인 · Gallery 등록/);
  assert.match(page, /보완 후 재상신/);
  assert.match(page, /사용 화면 열기/);
  assert.match(page, /role === ACCOUNT_ROLES\.leader \|\| role === ACCOUNT_ROLES\.member/);
  assert.match(page, /다른 사람의 Agent 대리 등록/);
  assert.match(page, /실제 제작자 MS 계정/);
  assert.match(page, /submissionMode: "SELF"/);
});

test("AI enablement roles can open governance and submit Gallery applications", () => {
  assert.match(page, /"gallery",\s+"governance"/);
  assert.match(page, /role !== ACCOUNT_ROLES\.user/);
  assert.match(page, /isTeam \? "Agent 올리기" : "내 Agent 올리기"/);
  assert.match(page, /AI 활성화팀 조회/);
  assert.match(page, /조회 전용/);
});

test("admin can manage published Gallery agents and uses the leader workspace", () => {
  assert.match(page, /adminKeepsPublished/);
  assert.match(page, /등록된 Agent 정보가 수정되었습니다/);
  assert.match(page, /onDeleteApplication\(a\.applicationId\)/);
  assert.match(page, /role === ACCOUNT_ROLES\.leader \|\| role === ACCOUNT_ROLES\.admin/);
});

test("governance account filters exclude the general-user filter and are interactive", () => {
  assert.match(page, /useState<"all" \| "ai" \| "bts" \| "bp" \| "admin">\("all"\)/);
  assert.match(page, /setAccountFilter\("all"\)/);
  assert.match(page, /setAccountFilter\("ai"\)/);
  assert.match(page, /setAccountFilter\("admin"\)/);
  assert.match(page, /setAccountFilter\("bts"\)/);
  assert.match(page, /setAccountFilter\("bp"\)/);
  assert.doesNotMatch(page, /setAccountFilter\("general_user"\)/);
  assert.match(page, /<small>팀장 · 팀원 · BTS · 비피 솔루션 · admin<\/small>/);
  assert.match(page, /PORTAL_BOOTSTRAP_LEADER_EMAILS/);
});

test("governance accounts can be edited or removed per user while retaining history", () => {
  assert.match(page, /사용자 계정 수정/);
  assert.match(page, /MS 계정 이메일/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /계정 삭제 시/);
  assert.match(page, /기존 과제 배정과 감사 이력은 보존됩니다/);
  assert.match(page, /canManageAccount\(account\)/);
  assert.match(page, /account\.roleSource\?\.startsWith\("bootstrap_"\)/);
  assert.match(page, /> 수정<\/button>/);
  assert.match(page, /> 삭제<\/button>/);
  assert.match(css, /\.governance-account-modal/);
  assert.match(css, /\.governance-account-actions/);
});

test("BTS is a distinct assignable role without leader or admin authority", () => {
  assert.match(page, /bts: "BTS"/);
  assert.match(page, /<option value="bts">BTS<\/option>/);
  assert.match(page, /BTS 수행자로 배정된 프로젝트/);
  assert.match(page, /팀장 Gate 최종 승인과 Admin 계정·시스템 관리 권한은 부여되지 않습니다/);
});

test("BP Solution is a distinct development role", () => {
  assert.match(page, /bpSolution: "비피 솔루션"/);
  assert.match(page, /<option value="bp_solution">비피 솔루션<\/option>/);
  assert.match(page, /비피 솔루션 계정은 Agent 과제의 개발 담당자로 지정될 수 있습니다/);
});

test("team dashboard maps registered accounts and database project assignments", () => {
  assert.match(page, /fetch\("\/api\/database\/team\/workload"/);
  assert.match(page, /setTeamAccounts\(payload\.members \|\| \[\]\)/);
  assert.match(page, /setTeamWorkloadProjects\(payload\.projects \|\| \[\]\)/);
  assert.match(page, /item\.assignedUserIds\?\.includes\(account\.id\)/);
  assert.match(page, /members=\{teamAccounts\}/);
  assert.match(page, /requirements=\{teamDashboardRequirements\}/);
  assert.match(page, /userProjectAsTeamRequirement/);
});

test("production UI starts without fixture projects or Gallery records", () => {
  assert.match(page, /const projects: ProjectSummary\[\] = \[\]/);
  assert.match(page, /const userProjects: UserProject\[\] = \[\]/);
  assert.match(page, /const initialTeamRequirements: TeamRequirement\[\] = \[\]/);
  assert.match(page, /const agents: GalleryAgent\[\] = \[\]/);
  assert.match(page, /const initialGalleryApplications: GalleryApplication\[\] = \[\]/);
  assert.match(page, /production-empty-v1/);
  assert.match(page, /등록된 Agent 과제가 없습니다/);
});

test("operations route exposes a gallery submission action after G4", () => {
  assert.match(page, /G4 최종 승인 · 운영 인수인계 완료/);
  assert.match(page, /Agent Gallery 등록 신청/);
  assert.match(page, /DEP 배포 체크리스트 완료/);
  assert.match(page, /OPS 운영 담당 지정/);
});

test("Gallery workflow has responsive review and submission UI", () => {
  for (const selector of [
    ".gallery-publish-flow",
    ".gallery-review-workspace",
    ".gallery-submission-modal",
    ".operations-gallery-callout",
  ]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("PostgreSQL schema persists submissions, reviews, and published entries", () => {
  assert.match(schema, /create table if not exists gallery_submissions/);
  assert.match(schema, /create table if not exists gallery_reviews/);
  assert.match(schema, /create table if not exists gallery_entries/);
  assert.match(schema, /'general_user', 'GALLERY_SUBMIT'/);
  assert.match(schema, /'team_member',\s+'GALLERY_REVIEW'/);
  assert.match(schema, /'team_member',\s+'GALLERY_PROXY_SUBMIT'/);
  assert.match(schema, /'team_leader',\s+'GALLERY_PUBLISH'/);
  assert.match(schema, /'team_leader',\s+'GALLERY_PROXY_SUBMIT'/);
});
