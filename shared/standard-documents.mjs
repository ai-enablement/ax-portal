// Field identities follow the original ARD, delivery and operations forms.
import { AGENT_TYPES, AUTONOMY_LEVELS, operationsSourceFields } from './project-classification.mjs';
// These identifiers, rather than positional textarea indexes, are persisted.
const f = (id, label, kind = "textarea", options = []) => ({ id, label, kind, options });
const s = (id, title, description, fields) => ({ id, title, description, fields });
const narrative = (id, title, description) => s(id, title, description, [f("body", "작성 내용", "rich"), { ...f("evidence", "근거 · 참조 문서", "files"), optional: true }]);
export const standardDocuments = {
  ARD: { title: "에이전트 요구사항 정의서", sections: [
    s("overview", "개요", "에이전트 정의·목적·이해관계자", [f("name", "1.1 에이전트 이름", "text"), f("oneLine", "한 줄 정의"), f("background", "1.2 배경 및 목적"), f("stakeholders", "1.3 이해관계자")]),
    s("asIs", "As-Is 프로세스", "현행 흐름·고통 지점·Baseline", [f("process", "2.1 프로세스 맵 · 담당자·시스템·소요시간·사용 문서"), f("pain", "2.2 고통 지점(Pain Point)"), f("baseline", "2.3 현행 기준 지표(Baseline)")]),
    s("toBe", "To-Be 프로세스", "Agent 담당 단계·사람 개입·범위", [f("process", "3.1 프로세스 맵"), f("hitl", "3.2 사람 개입 지점(Human-in-the-loop)"), f("inScope", "3.3 In Scope"), f("outScope", "Out of Scope")]),
    s("autonomy", "자율성 수준 정의", "L0–L4 수준과 상향 조건", [f("level", "자율성 수준", "select", ["L0 정보 제공", "L1 초안 생성", "L2 승인 후 실행", "L3 자동 실행", "L4 완전 자율"]), f("reason", "수준 선정 근거"), f("upgrade", "향후 상향 조건")]),
    s("functions", "기능 요구사항 (FR)", "입력·행동·출력과 우선순위", [f("rows", "기능 요구사항", "fr-table")]),
    s("knowledge", "지식·데이터 요구사항", "참조 지식·연동·최신성 책임", [f("sources", "6.1 참조 지식 · 버전·갱신 주기"), f("data", "6.2 연동 데이터 · 접근 방법·권한"), f("owner", "6.3 최신성 책임")]),
    s("success", "성공 기준 및 평가 기준", "비즈니스·품질·평가셋 기준", [f("business", "비즈니스 목표 · 개선 전/후"), f("accuracy", "정확도 목표"), f("safety", "안전성 · 금칙 위반 기준"), f("format", "형식 준수율 목표"), f("evaluationSet", "7.3 평가셋 확보 · 출처·건수"), f("labelOwner", "정답 라벨 책임자", "text"), f("evidence", "근거 제시율 목표")]),
    s("failures", "실패 시나리오 및 대응", "실패 유형·피해·설계 대응", [f("rows", "실패 시나리오", "failure-table")]),
    s("nonfunctional", "비기능 요구사항", "보안·성능·감사 추적", [f("security", "보안"), f("performance", "성능"), f("audit", "감사 추적")]),
    s("constraints", "제약 및 전제", "플랫폼·일정·조직 제약", [f("platform", "플랫폼·연동 제약"), f("schedule", "일정·참여 조직"), f("assumptions", "전제 및 제외사항")]),
  ] },
  DES: { title: "에이전트 설계서", sections: [
    narrative("architecture", "아키텍처 개요", "구성도·플랫폼 선정 근거·에이전트 구조"),
    narrative("prompt", "프롬프트·지침 설계", "역할·절차·출력·금칙·버전 관리"),
    narrative("knowledge", "지식·검색 설계", "지식 소스 처리·청킹·갱신 절차"),
    narrative("tools", "도구·연동 설계", "도구 기능·권한·실패 동작·최소 권한"),
    narrative("security", "데이터·보안 설계", "데이터 흐름·마스킹·차단·로그"),
    narrative("interface", "인터페이스 설계", "사용자 진입점·첫 화면 고지"),
    narrative("decisions", "설계 결정 기록 (Decision Log)", "결정·검토 대안·선택 이유·일자"),
  ] },
  EVP: { title: "평가 계획서", sections: [
    narrative("criteria", "평가 기준 요약", "ARD 7번 기준 복사·상세화"), narrative("cases", "평가셋 구성", "핵심·경계·금칙 케이스와 확장 원칙"),
    narrative("labels", "정답(라벨) 정의", "기대 출력·판정 기준·현업 작성자"), narrative("scoring", "채점 방식", "규칙·LLM·사람 채점과 표본 검증"),
    narrative("pass", "통과 기준", "ARD와 동일한 배포 차단 기준"), narrative("schedule", "평가 일정 및 반복 계획", "1·2차 평가와 회귀 평가"),
  ] },
  EVR: { title: "평가 결과 보고서", sections: [
    narrative("overview", "평가 개요", "대상·평가셋·일자·채점자"), narrative("results", "결과 요약표", "목표 대비 결과와 Pass/Fail"),
    narrative("failures", "실패 케이스 분석", "실패 전수·원인 분류·조치"), narrative("versions", "버전별 개선 이력", "프롬프트 버전별 점수 추이"),
    narrative("risks", "잔여 위험 및 완화책", "통과 후 약점과 운영 보완"), narrative("recommendation", "배포 권고 및 승인", "권고·조건·리뷰어·G3 승인"),
  ] },
  DEP: { title: "배포 체크리스트", sections: [
    s("readiness", "배포 준비 점검", "평가·환경·권한·모니터링·복구", [f("checks", "배포 전 점검", "checklist", ["ARD 성공 기준 전 항목 통과", "평가 결과 보고서 확인", "배포 환경·권한 확인", "로그·모니터링 설정", "사용자 가이드 준비", "운영 담당자 인수 확인", "보안 검토 완료", "비상 연락망·중단·롤백 계획", "지식 최신성 책임자 지정"]), f("securityReview", "보안 검토"), f("emergencyPlan", "비상 연락망·중단·롤백 계획"), f("knowledgeOwner", "지식 최신성 책임자")]),
    s("pilot", "배포 방식", "파일럿 대상·기간·피드백 수집·종료 기준·확산 계획", [f("pilotAudience", "파일럿 대상자 (명)", "text"), f("pilotPeriod", "파일럿 기간 (주)", "text"), f("feedbackMethod", "피드백 수집 방법"), f("exitCriteria", "파일럿 종료 판정 기준 · 사용률·만족도·오류 신고 건수"), { ...f("rolloutPlan", "기존 확산 계획"), optional: true }, f("rolloutChannel", "확산 공지 채널", "text"), f("trainingPlan", "교육 계획"), f("rolloutSchedule", "확산 일정", "text")]),
    s("results", "파일럿 결과 (G4 게이트)", "사용 건수·오류 신고·만족도·주요 피드백·확산 판정", [f("pilotUsage", "사용 건수", "text"), f("pilotErrors", "오류 신고", "text"), f("pilotSatisfaction", "만족도", "text"), f("pilotFeedback", "주요 피드백"), f("pilotDecision", "파일럿 결과 판정", "select", ["확산 승인", "파일럿 연장", "회수 후 개선"]), f("approver", "승인자", "text"), f("approvalDate", "승인 일자", "date")]),
  ] },
  UG: { title: "사용자 가이드", sections: [
    s("overview", "이 Agent는 무엇을 해주나요?", "이 Agent가 하는 일", [f("intro", "Agent 소개")]),
    s("scope", "이런 건 못 해요 / 하지 않아요", "사용 범위 밖 요청 · 한 줄에 한 항목", [f("outOfScope", "하지 않는 일")]),
    s("usage", "이렇게 사용하세요", "진입·입력·결과 확인 · 한 줄에 한 단계", [f("usageSteps", "사용 순서")]),
    s("examples", "좋은 질문과 나쁜 질문 예시", "입력 예시와 피해야 할 질문", [f("goodExamples", "좋은 질문 예시"), f("badExamples", "피해야 할 질문 예시")]),
    s("caution", "주의사항 및 지식 기준", "최종 확인·최신성·금지 정보", [f("caution", "주의사항"), f("knowledgeDate", "지식 기준일", "date"), f("prohibitedInfo", "입력 금지 정보")]),
    s("support", "문의 및 오류 신고", "채널·담당자·신고 방법", [f("channel", "문의 채널"), f("owner", "담당자"), f("reportingGuide", "오류 신고 안내")]),
  ] },
  OPS: { title: "운영 대장", sections: [
    s("owners", "운영 기본 정보", "FEA 분류·프로젝트 배정·DEP 지식갱신 담당자 자동 반영", [f("type", "유형 · FEA 선택값", "select", AGENT_TYPES), f("track", "트랙 · FEA 판정값", "select", ["하","중","상"]), f("autonomy", "자율성 · ARD 확정 전까지 FEA 초안", "select", AUTONOMY_LEVELS), f("owner", "오너(현업) · 프로젝트 배정", "source"), f("operator", "개발/운영 담당 · 개발 담당자 배정", "source"), f("knowledgeOwner", "지식갱신 담당 · DEP 지정", "source"), f("deployed", "배포일", "date"), f("status", "운영 상태", "select", ["운영", "일시중지", "폐기"])]),
    s("monitoring", "월간 운영 점검", "사용량·품질·지식 최신성", [f("checked", "점검일", "date"), f("inspector", "점검자"), f("usage", "사용량·추이"), f("quality", "오류·품질·SLA"), f("freshness", "지식 최신성·갱신 내역"), f("incidents", "장애·조치 내역")]),
    s("evaluation", "재평가 및 운영 판단", "회귀 평가·유지·개선·중단", [f("reevaluate", "재평가 예정일", "date"), f("evaluation", "평가 결과"), f("decision", "운영 판단"), f("actions", "후속 조치")]),
    s("sunset", "폐기(Sunset) 기준", "폐기 검토 조건과 처리 절차", [f("criteria", "폐기 검토 기준"), f("procedure", "공지·접근 차단·데이터 처리 절차")]),
  ] },
  CHG: { title: "개선 이력서", sections: [
    s("history", "과제별 변경 이력", "변경 전·후와 재평가·승인 근거", [f("rows", "변경 이력", "change-table")]),
    s("change", "변경 요청", "변경 대상·사유·영향 범위", [f("target", "변경 대상 · 프롬프트·지식·도구"), f("reason", "변경 사유"), f("before", "변경 전"), f("after", "변경 후"), f("impact", "영향 범위")]),
    s("verification", "검증 및 반영", "회귀 평가·승인·배포·복구", [f("evaluation", "회귀 평가 결과"), f("approval", "승인 근거"), f("version", "반영 버전"), f("date", "반영일", "date"), f("rollback", "롤백 계획"), f("followup", "후속 확인")]),
  ] },
};
// Optional section attachments do not prevent completion; prior hidden values remain stored.
for (const code of ["DEP", "UG", "OPS", "CHG"]) {
  for (const section of standardDocuments[code].sections) section.fields.push({ ...f("__attachments", "이미지 · 첨부파일", "files"), optional: true });
}
for (const section of standardDocuments.CHG.sections.filter(s => s.id !== "history")) {
  for (const field of section.fields) field.optional = true;
}
export const stageDocumentCodes = { 3: ["ARD"], 5: ["DES", "EVP", "EVR"], 7: ["DEP", "UG"], 9: ["OPS", "CHG"] };

export function hydrateStandardDocuments(stage, record = {}, project = {}) {
  const result = structuredClone(record);
  result.schemaVersion = 2;
  result.values ||= [];
  result.status ||= "draft";
  result.updatedAt ||= "";
  result.documents ||= {};
  result.legacyValues ||= record.schemaVersion === 2 ? [] : [...(record.values || [])];
  for (const code of stageDocumentCodes[stage] || []) {
    result.documents[code] ||= { fields: {}, completedSections: [], status: "draft", messages: [] };
  }
  if (stage === 3 && !result.documents.ARD.fields["overview.name"]) result.documents.ARD.fields["overview.name"] = project.name || "";
  if (stage === 9) Object.assign(result.documents.OPS.fields, operationsSourceFields(project));
  return result;
}

export function sectionHasContent(section, fields) {
  if (section.id === "sunset" && fields["owners.status"] !== "폐기") return true;
  return section.fields.every((field) => {
    if (field.optional) return true;
    const value = fields[`${section.id}.${field.id}`];
    if (["rich", "textarea"].includes(field.kind) && value?.kind === "blocks") return Array.isArray(value.blocks) && value.blocks.some(block => block.type === "text" ? Boolean(block.text?.trim()) : block.type === "table" ? block.rows?.some(row => row.some(cell => cell.trim())) : Boolean(block.file?.id));
    if (field.kind === "checklist") return Array.isArray(value) && value.length === field.options.length && value.every(item => item === true);
    if (field.kind.endsWith("-table")) {
      const columns = field.kind === "change-table" ? ["변경번호", "일자", "유형", "변경 내용", "사유", "재평가 결과", "승인"] : field.kind === "fr-table" ? ["ID", "기능", "입력 → 에이전트 행동 → 출력", "우선순위"] : ["실패 유형", "예시", "피해", "대응"];
      return Array.isArray(value) && value.length > 0 && value.every(row => row && columns.every(column => typeof row[column] === "string" && row[column].trim()));
    }
    if (field.kind === "select") return field.options.includes(value);
    if (field.kind === "date") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    return typeof value === "string" && value.trim().length > 0;
  });
}
