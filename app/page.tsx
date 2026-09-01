"use client";

import "./release-documents.css";
import "./operations-documents.css";
import "./team-dashboard-compact.css";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  Bell,
  CalendarBlank,
  ChartBar,
  Check,
  CheckCircle,
  ClipboardText,
  Info,
  FileText,
  List,
  Plus,
  ShieldCheck,
  Target,
  UserCircle,
  WarningCircle,
  X,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";

type View =
  | "home"
  | "teamboard"
  | "intake"
  | "definition"
  | "delivery"
  | "operations"
  | "hub"
  | "gallery"
  | "governance";

const ACCOUNT_ROLES = {
  leader: "AI활성화팀 최병두 팀장",
  member: "AI활성화팀 허정환 담당자",
  user: "일반 User",
  admin: "admin",
} as const;

type AccountRole = (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES];
const ACCOUNT_EMAILS: Record<AccountRole, string> = {
  [ACCOUNT_ROLES.leader]: "choi.bd@changshininc.com",
  [ACCOUNT_ROLES.member]: "heo.jh@changshininc.com",
  [ACCOUNT_ROLES.user]: "kim.hw@changshininc.com",
  [ACCOUNT_ROLES.admin]: "portal.admin@changshininc.com",
};
type DatabaseStatus = "checking" | "connected" | "fallback";
type ProjectRelationship =
  | "REQUESTER"
  | "OWNER"
  | "DEVELOPER"
  | "REVIEWER"
  | "OPERATOR"
  | "SECURITY_REVIEWER";

const projectAssignments: Record<
  string,
  Partial<Record<AccountRole, ProjectRelationship[]>>
> = {};

function getProjectRelationships(role: string, projectNo?: string) {
  if (!projectNo) return [] as ProjectRelationship[];
  return projectAssignments[projectNo]?.[role as AccountRole] || [];
}

function hasProjectRelationship(
  role: string,
  projectNo: string,
  relationships?: ProjectRelationship[],
) {
  const assigned = getProjectRelationships(role, projectNo);
  return relationships
    ? assigned.some((relationship) => relationships.includes(relationship))
    : assigned.length > 0;
}

function projectRelationshipLabel(role: string, projectNo: string) {
  const labels: Record<ProjectRelationship, string> = {
    REQUESTER: "요청자",
    OWNER: "Owner",
    DEVELOPER: "개발 담당",
    REVIEWER: "리뷰어",
    OPERATOR: "운영 담당",
    SECURITY_REVIEWER: "정보보호 검토",
  };
  const assigned = getProjectRelationships(role, projectNo);
  if (role === ACCOUNT_ROLES.leader) return "팀장 감독·승인";
  if (assigned.length === 0 && role === ACCOUNT_ROLES.user) return "요청자";
  return assigned
    .map((relationship) => labels[relationship])
    .join(" · ");
}

const navGroups = [
  {
    label: "WORKSPACE",
    items: [
      { id: "home" as View, icon: "⌂", label: "홈" },
      { id: "teamboard" as View, icon: "▥", label: "AI 활성화팀 대시보드" },
    ],
  },
  {
    label: "AGENT LIFECYCLE",
    items: [
      { id: "intake" as View, icon: "01", label: "요구 접수 · 타당성 평가" },
      { id: "definition" as View, icon: "02", label: "요구 정의" },
      {
        id: "delivery" as View,
        icon: "03",
        label: "설계·개발 · 평가·배포 · 인수인계",
      },
      { id: "operations" as View, icon: "04", label: "운영 · 개선" },
    ],
  },
  {
    label: "SERVICE & CONTROL",
    items: [
      { id: "gallery" as View, icon: "▦", label: "Agent Gallery" },
      { id: "governance" as View, icon: "✓", label: "Admin & Governance" },
    ],
  },
];
const nav = navGroups.flatMap((group) => group.items);

type ProjectSummary = {
  no: string;
  name: string;
  dept: string;
  step: string;
  status: string;
  tone: string;
  track: string;
  autonomy: string;
  progress: number;
  due: string;
  owner: string;
  hub: string;
};

const projects: ProjectSummary[] = [];

type UserProject = {
  no: string;
  name: string;
  stage: number;
  status: string;
  tone: string;
  progress: number;
  owner: string;
  handler: string;
  updated: string;
  nextAction: string;
  description: string;
  journeyStep: number;
  nextGate: string;
  teamOwner: string;
  dueDate: string;
  requestedDate: string;
  committedDate: string;
  scheduleState: string;
  checkpoints: string;
  route: View;
  intakeAnswers?: string[];
  requester?: string;
  projectOwner?: string;
};

const userProjects: UserProject[] = [];

const emptyProject: UserProject = {
  no: "",
  name: "",
  stage: 0,
  status: "",
  tone: "gray",
  progress: 0,
  owner: "",
  handler: "",
  updated: "",
  nextAction: "",
  description: "",
  journeyStep: 1,
  nextGate: "",
  teamOwner: "",
  dueDate: "",
  requestedDate: "",
  committedDate: "",
  scheduleState: "",
  checkpoints: "",
  route: "intake",
};

const userJourney = [
  {
    title: "요구 접수",
    caption: "완료",
    kind: "stage",
    display: 1,
    doc: "에이전트 요구 접수서[INT]",
  },
  {
    title: "타당성 평가",
    caption: "현재 단계",
    kind: "stage",
    display: 2,
    doc: "타당성 평가서[FEA]",
  },
  {
    title: "착수 승인",
    caption: "승인 대기",
    kind: "gate",
    code: "G1",
    doc: "Go 판정 · 트랙·유형 확정",
  },
  {
    title: "요구 정의",
    caption: "예정",
    kind: "stage",
    display: 3,
    doc: "에이전트 요구사항 정의서[ARD]",
  },
  {
    title: "개발 착수",
    caption: "승인 대기",
    kind: "gate",
    code: "G2",
    doc: "요구자·개발 담당자·AI활성화팀장 3자 서명",
  },
  {
    title: "설계·개발·평가",
    caption: "예정",
    kind: "stage",
    display: 4,
    doc: "DES · EVP · EVR",
  },
  {
    title: "배포 승인",
    caption: "승인 대기",
    kind: "gate",
    code: "G3",
    doc: "평가 기준 전 항목 통과 · 금칙 위반 0건",
  },
  {
    title: "파일럿",
    caption: "예정",
    kind: "stage",
    display: 5,
    doc: "DEP · UG",
  },
  {
    title: "확산 승인",
    caption: "승인 대기",
    kind: "gate",
    code: "G4",
    doc: "파일럿 종료 기준 충족",
  },
  {
    title: "운영·개선",
    caption: "예정",
    kind: "stage",
    display: 6,
    doc: "OPS · CHG",
  },
];

const memberAdditionalProjects: UserProject[] = [];

const generalUserOwnerProjects: UserProject[] = [];

const lifecycleOutputs = [
  {
    code: "INT",
    title: "에이전트 요구 접수서[INT]",
    summary:
      "해결하려는 업무 문제와 현재 방식, 업무량, 기대 결과와 위험을 정리합니다.",
    sections: [
      ["업무 문제", "반복·수작업·오류가 발생하는 현재 업무"],
      ["업무량", "발생 빈도·건당 시간·수행 인원"],
      ["입력 자료", "사용 시스템·파일·참고 문서"],
      ["기대 결과", "목표 처리시간·정확도·통제 방식"],
    ],
  },
  {
    code: "FEA",
    title: "타당성 평가서[FEA]",
    summary:
      "AI 적용 적합성과 대안을 비교하고 기대 효과, 위험, 추진 여부를 판정합니다.",
    sections: [
      ["적합성", "Agent 적용 적합도와 판단 근거"],
      ["대안 비교", "기존 시스템·RPA·업무 개선 대안"],
      ["효과 추정", "절감 시간·품질 향상·적용 범위"],
      ["판정", "Go · Conditional Go · Drop"],
    ],
  },
  {
    code: "G1",
    title: "G1 착수 승인 기록",
    summary: "타당성 평가 결과를 근거로 프로젝트 공식 착수 여부를 결정합니다.",
    sections: [
      ["승인 근거", "타당성 평가서[FEA]"],
      ["승인자", "AI활성화팀장"],
      ["확정 항목", "트랙·Agent 유형·추진 범위"],
      ["결정", "승인 · 조건부 승인 · 보류"],
    ],
  },
  {
    code: "ARD",
    title: "에이전트 요구사항 정의서[ARD]",
    summary:
      "Agent가 해야 할 일과 하지 말아야 할 일, 성공 기준과 평가 기준을 정의합니다.",
    sections: [
      ["업무 범위", "In Scope · Out of Scope"],
      ["자율성", "L0–L4 목표 수준과 인간 승인 지점"],
      ["성공 기준", "정확도·처리시간·사용자 경험"],
      ["실패 시나리오", "금칙·예외·중단 및 복구 기준"],
    ],
  },
  {
    code: "G2",
    title: "G2 개발 착수 승인 기록",
    summary: "요구 정의가 충분한지 확인하고 설계·개발 착수를 승인합니다.",
    sections: [
      ["승인 근거", "에이전트 요구사항 정의서[ARD]"],
      ["승인자", "요구자 · 개발 담당자 · AI활성화팀장"],
      ["확인 항목", "자율성·성공 기준·Out of Scope"],
      ["결정", "3자 서명 · 보완 요청"],
    ],
  },
  {
    code: "DES · EVP · EVR",
    title: "설계·개발·평가 산출물",
    summary:
      "설계서와 평가 계획을 바탕으로 개발하고, 독립 평가 결과를 기록합니다.",
    sections: [
      ["설계서[DES]", "구조·도구·지식·권한·통제 설계"],
      ["평가 계획서[EVP]", "기능·안전·실패 케이스 평가셋"],
      ["평가 결과 보고서[EVR]", "성공 기준별 결과와 실패 분석"],
      ["릴리스 후보", "버전·변경점·잔여 위험"],
    ],
  },
  {
    code: "G3",
    title: "G3 배포 승인 기록",
    summary:
      "평가 결과와 배포 준비 상태를 확인해 실제 환경 배포 여부를 결정합니다.",
    sections: [
      ["승인 근거", "평가 결과 보고서[EVR] + 배포 체크리스트[DEP]"],
      ["필수 조건", "성공 기준 전 항목 통과 · 금칙 위반 0건"],
      ["승인자", "동료 리뷰어 · AI활성화팀장 · 상 트랙 정보보호"],
      ["결정", "배포 승인 · 보완 · 차단"],
    ],
  },
  {
    code: "DEP · UG",
    title: "배포 체크리스트[DEP] · 사용자 가이드[UG]",
    summary: "파일럿 배포와 사용자 안내, 운영 인수 준비 결과를 관리합니다.",
    sections: [
      ["배포 체크리스트[DEP]", "환경·권한·모니터링·복구 확인"],
      ["사용자 가이드[UG]", "사용 방법·제약·문의 경로"],
      ["파일럿 계획", "대상·기간·측정 지표"],
      ["인수 준비", "Owner·운영·지식 담당 확인"],
    ],
  },
  {
    code: "G4",
    title: "G4 확산 승인 기록",
    summary:
      "파일럿 결과와 운영 인수를 근거로 확산 및 운영 전환 여부를 결정합니다.",
    sections: [
      ["승인 근거", "파일럿 결과·사용자 의견"],
      ["종료 기준", "사용률·만족도·오류 허용 기준"],
      ["승인자", "프로젝트 Owner · AI활성화팀장"],
      ["결정", "확산 승인 · 파일럿 연장 · 보류"],
    ],
  },
  {
    code: "OPS · CHG",
    title: "운영 대장[OPS] · 개선 이력서[CHG]",
    summary:
      "사용량, 품질, 오류와 지식 최신성을 점검하고 변경 이력을 관리합니다.",
    sections: [
      ["운영 대장[OPS]", "사용량·오류·SLA·지식 최신성"],
      ["개선 이력서[CHG]", "프롬프트·지식·도구 변경 기록"],
      ["재평가", "변경 영향과 회귀 평가 결과"],
      ["운영 판단", "유지·개선·중단·재심사"],
    ],
  },
];

type GalleryAgent = {
  icon: string;
  name: string;
  desc: string;
  category: string;
  users: string;
  rating: string;
  tag: string;
  tone: string;
};

const agents: GalleryAgent[] = [];

type GallerySource = "OPERATIONS" | "PERSONAL";
type GalleryReviewStatus =
  | "SUBMITTED"
  | "IN_REVIEW"
  | "CHANGES_REQUESTED"
  | "RECOMMENDED"
  | "PUBLISHED"
  | "REJECTED";

type GalleryDraft = {
  source: GallerySource;
  projectNo?: string;
  name?: string;
  description?: string;
  platform?: string;
  artifactType?: string;
  category?: string;
  targetUsers?: string;
  supportOwner?: string;
  evidence?: string[];
};

type GalleryApplication = {
  id: string;
  source: GallerySource;
  projectNo?: string;
  name: string;
  description: string;
  platform: string;
  artifactType: string;
  category: string;
  accessUrl: string;
  targetUsers: string;
  dataClass: string;
  supportOwner: string;
  applicant: string;
  submittedAt: string;
  status: GalleryReviewStatus;
  evidence: string[];
  reviewerNote?: string;
};

const initialGalleryApplications: GalleryApplication[] = [];

const gates = [
  { code: "G1", label: "착수 승인", count: 0, meta: "팀장 승인", tone: "blue" },
  {
    code: "G2",
    label: "개발 착수",
    count: 0,
    meta: "3자 서명",
    tone: "violet",
  },
  {
    code: "G3",
    label: "배포 승인",
    count: 0,
    meta: "평가 근거 필수",
    tone: "orange",
  },
  {
    code: "G4",
    label: "확산 승인",
    count: 0,
    meta: "파일럿 종료",
    tone: "green",
  },
];

type ApprovalQueueItem = {
  project: ProjectSummary;
  gate: string;
  condition: string;
  progress: number;
  approvers: string;
  requested: string;
};

const approvalQueue: ApprovalQueueItem[] = [];

type TeamRequirement = {
  id: string;
  title: string;
  requestTeam: string;
  requester: string;
  assignee: string;
  status: "신규 접수" | "진행 중" | "완료";
  stage: string;
  progress: number;
  startDay: number;
  dueDay: number;
  priority: "높음" | "보통";
  risk: "정상" | "확인 필요" | "지연 위험";
  nextAction: string;
  received: string;
};

const teamRequirements: TeamRequirement[] = [];

const aiTeamMembers = [
  "최병두",
  "정지헌",
  "허정환",
  "허시영",
  "황수정",
  "박혜빈",
  "이재승",
];

function teamRequirementAsHomeProject(item: TeamRequirement): UserProject {
  const journeyStep = item.stage.includes("타당성")
    ? 1
    : item.stage.includes("요구 정의")
      ? 3
      : item.stage.includes("G2")
        ? 4
        : item.stage.includes("평가")
          ? 5
          : item.stage.includes("G3")
            ? 6
            : item.stage.includes("파일럿")
              ? 7
              : item.stage.includes("운영") || item.status === "완료"
                ? 9
                : 0;
  const route: View =
    journeyStep <= 2
      ? "intake"
      : journeyStep <= 4
        ? "definition"
        : journeyStep >= 9
          ? "operations"
          : "delivery";

  return {
    no: item.id,
    name: item.title,
    stage: Math.min(6, Math.max(1, journeyStep || 1)),
    status:
      item.risk === "지연 위험" ? "오늘 조치 필요" : item.status,
    tone:
      item.risk === "지연 위험"
        ? "red"
        : item.status === "완료"
          ? "green"
          : "blue",
    progress: item.progress,
    owner: item.requester,
    handler:
      item.assignee === "미배정"
        ? "AI활성화팀 배정 대기"
        : `AI활성화팀 ${item.assignee} 담당자`,
    updated: item.received,
    nextAction: item.nextAction,
    description: `${item.requestTeam}에서 요청한 과제의 전체 이력과 현재 진행 상태입니다.`,
    journeyStep,
    nextGate:
      journeyStep < 2
        ? "G1 착수 승인"
        : journeyStep < 4
          ? "G2 개발 착수"
          : journeyStep < 6
            ? "G3 배포 승인"
            : journeyStep < 8
              ? "G4 확산 승인"
              : "정기 재평가",
    teamOwner:
      item.assignee === "미배정"
        ? "AI활성화팀 배정 대기"
        : `AI활성화팀 ${item.assignee} 담당자`,
    dueDate: `2026.08.${String(item.dueDay).padStart(2, "0")}`,
    requestedDate: "요청서 확인 필요",
    committedDate: "G2 승인 후 확정",
    scheduleState: item.risk,
    checkpoints: `${Math.max(1, Math.round(item.progress / 7))}/16`,
    route,
    requester: `${item.requester} · ${item.requestTeam}`,
    projectOwner: item.requester,
  };
}

function Pill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function EmptyDataPage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page empty-data-page">
      <section className="panel approval-empty-state">
        <ClipboardText size={32} weight="duotone" />
        <b>{title}</b>
        <span>{description}</span>
        {action}
      </section>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<AccountRole>(ACCOUNT_ROLES.user);
  const [query, setQuery] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [detail, setDetail] = useState<(typeof projects)[0] | null>(null);
  const [toast, setToast] = useState("");
  const [requestStep, setRequestStep] = useState(1);
  const [mobileNav, setMobileNav] = useState(false);
  const [hubProject, setHubProject] = useState<(typeof projects)[0] | null>(
    null,
  );
  const [llmCostGuideOpen, setLlmCostGuideOpen] = useState(false);
  const [submittedProjects, setSubmittedProjects] = useState<UserProject[]>([]);
  const [deletedProjectNos, setDeletedProjectNos] = useState<string[]>([]);
  const [projectOverrides, setProjectOverrides] = useState<
    Record<string, Partial<UserProject>>
  >({});
  const [governanceGate, setGovernanceGate] = useState("전체");
  const [workflowTarget, setWorkflowTarget] = useState<string | undefined>(
    undefined,
  );
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
  const [galleryApplications, setGalleryApplications] = useState<
    GalleryApplication[]
  >(initialGalleryApplications);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("checking");

  useEffect(() => {
    try {
      const cleanDataVersion = "production-empty-v1";
      if (window.localStorage.getItem("agent-portal-data-version") !== cleanDataVersion) {
        [
          "agent-portal-submitted-projects",
          "agent-portal-deleted-projects",
          "agent-portal-project-overrides",
          "agent-portal-gallery-applications",
        ].forEach((key) => window.localStorage.removeItem(key));
        window.localStorage.setItem("agent-portal-data-version", cleanDataVersion);
      }
      const saved = window.localStorage.getItem(
        "agent-portal-submitted-projects",
      );
      // Restore the browser-local prototype state after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSubmittedProjects(JSON.parse(saved));
      const deleted = window.localStorage.getItem(
        "agent-portal-deleted-projects",
      );
      if (deleted) setDeletedProjectNos(JSON.parse(deleted));
      const overrides = window.localStorage.getItem(
        "agent-portal-project-overrides",
      );
      if (overrides) setProjectOverrides(JSON.parse(overrides));
      const galleryItems = window.localStorage.getItem(
        "agent-portal-gallery-applications",
      );
      if (galleryItems) setGalleryApplications(JSON.parse(galleryItems));
    } catch {
      window.localStorage.removeItem("agent-portal-submitted-projects");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDatabaseData() {
      try {
        const [healthResponse, galleryResponse] = await Promise.all([
          fetch("/api/database/health", { signal: controller.signal }),
          fetch(
            `/api/database/gallery/applications?email=${encodeURIComponent(ACCOUNT_EMAILS[role])}`,
            { signal: controller.signal },
          ),
        ]);
        if (!healthResponse.ok || !galleryResponse.ok) {
          throw new Error("Database gateway is unavailable.");
        }
        const galleryPayload = (await galleryResponse.json()) as {
          applications?: GalleryApplication[];
        };
        if (!active) return;
        const databaseApplications = galleryPayload.applications || [];
        setGalleryApplications(databaseApplications);
        window.localStorage.setItem(
          "agent-portal-gallery-applications",
          JSON.stringify(databaseApplications),
        );
        setDatabaseStatus("connected");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setDatabaseStatus("fallback");
      }
    }

    loadDatabaseData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [role]);

  const userProjectItems = useMemo<UserProject[]>(
    () =>
      [...submittedProjects, ...userProjects, ...generalUserOwnerProjects]
        .filter((project) => !deletedProjectNos.includes(project.no))
        .map((project) => ({
          ...project,
          ...(projectOverrides[project.no] || {}),
        })),
    [submittedProjects, deletedProjectNos, projectOverrides],
  );
  const adminProjectItems = useMemo<UserProject[]>(() => {
    const merged = [
      ...userProjectItems,
      ...teamRequirements.map(teamRequirementAsHomeProject),
    ]
      .filter((project) => !deletedProjectNos.includes(project.no))
      .map((project) => ({
        ...project,
        ...(projectOverrides[project.no] || {}),
      }));
    return Array.from(
      new Map(merged.map((project) => [project.no, project])).values(),
    );
  }, [userProjectItems, deletedProjectNos, projectOverrides]);

  const deleteProject = (projectNo: string) => {
    setDeletedProjectNos((current) => {
      const next = current.includes(projectNo)
        ? current
        : [...current, projectNo];
      window.localStorage.setItem(
        "agent-portal-deleted-projects",
        JSON.stringify(next),
      );
      return next;
    });
    setSubmittedProjects((current) => {
      const next = current.filter((project) => project.no !== projectNo);
      window.localStorage.setItem(
        "agent-portal-submitted-projects",
        JSON.stringify(next),
      );
      return next;
    });
  };

  const updateProject = (
    projectNo: string,
    changes: Partial<UserProject>,
  ) => {
    setProjectOverrides((current) => {
      const next = {
        ...current,
        [projectNo]: { ...(current[projectNo] || {}), ...changes },
      };
      window.localStorage.setItem(
        "agent-portal-project-overrides",
        JSON.stringify(next),
      );
      return next;
    });
  };

  const filteredAgents = useMemo(
    () =>
      agents.filter((a) =>
        `${a.name} ${a.desc} ${a.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );
  const visibleNavGroups = useMemo(() => {
    const allowed =
      role === ACCOUNT_ROLES.user
        ? new Set<View>([
            "home",
            "intake",
            "definition",
            "delivery",
            "hub",
            "gallery",
          ])
        : role === ACCOUNT_ROLES.member
          ? new Set<View>([
              "home",
              "teamboard",
              "intake",
              "definition",
              "delivery",
              "operations",
              "hub",
              "gallery",
              "governance",
            ])
          : role === ACCOUNT_ROLES.leader
            ? new Set<View>(nav.map((item) => item.id))
            : new Set<View>(["governance", "hub", "gallery"]);

    return navGroups
      .filter((group) => group.label !== "AGENT LIFECYCLE")
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [role]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const saveGalleryApplications = (items: GalleryApplication[]) => {
    setGalleryApplications(items);
    window.localStorage.setItem(
      "agent-portal-gallery-applications",
      JSON.stringify(items),
    );
  };

  const openGallerySubmission = (draft: GalleryDraft) => {
    setGalleryDraft(draft);
    go("gallery");
  };

  const submitGalleryApplication = async (application: GalleryApplication) => {
    const optimistic = [application, ...galleryApplications];
    saveGalleryApplications(optimistic);
    setGalleryDraft(null);
    if (databaseStatus === "connected") {
      try {
        const response = await fetch("/api/database/gallery/applications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...application, actorEmail: ACCOUNT_EMAILS[role] }),
        });
        const payload = (await response.json()) as {
          application?: GalleryApplication;
          error?: string;
        };
        if (!response.ok || !payload.application) {
          throw new Error(payload.error || "등록 신청 저장에 실패했습니다.");
        }
        saveGalleryApplications([
          payload.application,
          ...optimistic.filter((item) => item.id !== application.id),
        ]);
        notify("Agent Gallery 등록 신청이 PostgreSQL에 저장되었습니다.");
        return;
      } catch {
        setDatabaseStatus("fallback");
        notify("DB에 연결되지 않아 이 브라우저에 임시 저장했습니다.");
        return;
      }
    }
    notify("Agent Gallery 등록 신청이 이 브라우저에 임시 저장되었습니다.");
  };

  const updateGalleryApplication = async (
    id: string,
    changes: Partial<GalleryApplication>,
  ) => {
    const next = galleryApplications.map((application) =>
      application.id === id ? { ...application, ...changes } : application,
    );
    saveGalleryApplications(next);
    if (databaseStatus !== "connected") return;
    try {
      const response = await fetch(
        `/api/database/gallery/applications/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...changes, actorEmail: ACCOUNT_EMAILS[role] }),
        },
      );
      const payload = (await response.json()) as {
        application?: GalleryApplication;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "변경 내용을 저장하지 못했습니다.");
      }
      saveGalleryApplications(
        next.map((application) =>
          application.id === id ? payload.application! : application,
        ),
      );
    } catch {
      setDatabaseStatus("fallback");
      notify("DB에 연결되지 않아 변경 내용을 이 브라우저에 임시 저장했습니다.");
    }
  };

  const go = (next: View) => {
    setView(next);
    setMobileNav(false);
    setNotificationOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openWorkflow = (next: View, projectNo: string) => {
    setWorkflowTarget(projectNo);
    go(next);
  };

  const notifications: {
    projectNo: string;
    title: string;
    body: string;
    view: View;
    tone: string;
  }[] = [];

  const openHub = (project?: (typeof projects)[0]) => {
    setHubProject(project || null);
    setDetail(null);
    go("hub");
  };

  const openLlmCostMonitoring = () => {
    if (window.localStorage.getItem("llm-cost-hosts-ready") === "true") {
      window.open(
        "http://llmcost.changshininc.com/",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    setLlmCostGuideOpen(true);
  };

  const submitAgentRequest = (
    answers: string[],
    title: string,
    projectOwner: string,
    requester: string,
  ) => {
    setSubmittedProjects((current) => {
      const sequence = String(current.length + 1).padStart(3, "0");
      const project: UserProject = {
        no: `2026-${sequence}`,
        name: title,
        stage: 1,
        status: "타당성 평가 대기",
        tone: "blue",
        progress: 22,
        owner: projectOwner,
        handler: "AI활성화팀 배정 대기",
        updated: "방금",
        nextAction: "타당성 평가 결과를 기다리고 있습니다",
        description:
          "에이전트 요구 접수서[INT] 제출이 완료되어 AI활성화팀의 타당성 평가를 기다리고 있습니다.",
        journeyStep: 1,
        nextGate: "G1 착수 승인",
        teamOwner: "AI활성화팀 배정 대기",
        dueDate: "FEA 작성 후 안내",
        requestedDate: answers[4],
        committedDate: "G2 승인 후 확정",
        scheduleState: "타당성 평가 대기",
        checkpoints: "3/11",
        route: "intake" as View,
        intakeAnswers: answers,
        requester,
        projectOwner,
      };
      const next = [project, ...current];
      window.localStorage.setItem(
        "agent-portal-submitted-projects",
        JSON.stringify(next),
      );
      return next;
    });
    setView("home");
    notify(
      role === ACCOUNT_ROLES.user
        ? "에이전트 요구 접수서[INT]가 제출되었습니다. 신규 과제가 타당성 평가 대기로 등록되었습니다."
        : "요청자를 대신해 에이전트 요구 접수서[INT]를 등록했습니다. 신규 과제가 타당성 평가 대기로 이동했습니다.",
    );
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div
          className="brand"
          onClick={() =>
            go(role === ACCOUNT_ROLES.admin ? "governance" : "home")
          }
        >
          <span className="brand-mark">AX</span>
          <span>
            <strong>Agent Portal</strong>
            <small>Governance & Delivery</small>
          </span>
        </div>
        <nav>
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={view === item.id ? "active" : ""}
                  onClick={() => go(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-copy">
                    {item.id === "home" && role === ACCOUNT_ROLES.user
                      ? "내 Agent 과제"
                      : item.label}
                  </span>
                  {item.id === "teamboard" && role.includes("AI활성화팀") && (
                    <em className="team-nav-count">{teamRequirements.length}</em>
                  )}
                  {item.id === "governance" && role === ACCOUNT_ROLES.admin && (
                    <em>{approvalQueue.length}</em>
                  )}
                </button>
              ))}
              {group.label === "SERVICE & CONTROL" && (
                <button
                  type="button"
                  className="nav-external-link"
                  onClick={openLlmCostMonitoring}
                >
                  <span className="nav-icon">₩</span>
                  <span className="nav-copy">LLM Cost Monitoring</span>
                  <ArrowRight size={13} weight="bold" />
                </button>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="policy-card">
            <span>i</span>
            <div>
              <strong>Agent 개발 표준체계 v1.0</strong>
              <small>평가 없이 배포하지 않습니다.</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label={mobileNav ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X size={22} /> : <List size={22} />}
          </button>
          <div className="crumb">
            Agent Portal <span>/</span>{" "}
            <strong>
              {view === "home" && role === ACCOUNT_ROLES.user
                ? "내 Agent 과제"
                : nav.find((n) => n.id === view)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <label className="role-select">
              <span>MS 계정</span>
              <select
                value={role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  setRole(nextRole as AccountRole);
                  go(
                    nextRole === ACCOUNT_ROLES.admin ? "governance" : "home",
                  );
                }}
              >
                <option value={ACCOUNT_ROLES.leader}>
                  AI 활성화팀 최병두 팀장
                </option>
                <option value={ACCOUNT_ROLES.member}>
                  AI 활성화팀 팀원 · 허정환
                </option>
                <option value={ACCOUNT_ROLES.user}>
                  일반 User · 김현우
                </option>
                <option value={ACCOUNT_ROLES.admin}>admin</option>
              </select>
            </label>
            <button
              className="icon-button"
              aria-label="알림"
              aria-expanded={notificationOpen}
              aria-controls="notification-panel"
              onClick={() => setNotificationOpen((current) => !current)}
            >
              <Bell size={17} />
              <i>{notifications.length}</i>
            </button>
            {notificationOpen && (
              <section
                id="notification-panel"
                className="notification-panel"
                aria-label="업무 알림"
              >
                <header>
                  <div>
                    <b>업무 알림</b>
                    <small>우선순위가 높은 순서입니다.</small>
                  </div>
                  <Pill tone="red">{notifications.length}건</Pill>
                </header>
                <div>
                  {notifications.map((item) => (
                    <button
                      key={`${item.projectNo}-${item.title}`}
                      onClick={() => openWorkflow(item.view, item.projectNo)}
                    >
                      <span className={item.tone} />
                      <p>
                        <small>{item.projectNo}</small>
                        <b>{item.title}</b>
                        <em>{item.body}</em>
                      </p>
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="avatar">
              {role === ACCOUNT_ROLES.user
                ? "김"
                : role === ACCOUNT_ROLES.member
                  ? "허"
                  : role === ACCOUNT_ROLES.admin
                    ? "A"
                    : "최"}
            </div>
          </div>
        </header>

        {view === "home" && (
          <Dashboard
            role={role}
            projectNo={workflowTarget}
            onDeleteProject={deleteProject}
            setView={go}
            setRequestOpen={setRequestOpen}
            setDetail={setDetail}
            userProjectItems={userProjectItems}
            openGallerySubmission={openGallerySubmission}
            openGovernance={(gate) => {
              if (gate === "G1") return go("intake");
              if (gate === "G2") return go("definition");
              go("delivery");
            }}
            notify={notify}
          />
        )}
        {view === "teamboard" && role.includes("AI활성화팀") &&
          (teamRequirements.length > 0 ? (
            <LegacyTeamWorkspaceDashboard
              setView={go}
              openWorkflow={openWorkflow}
            />
          ) : (
            <EmptyDataPage
              title="등록된 Agent 과제가 없습니다."
              description="새 Agent 과제가 접수되면 담당자별 진행 현황과 지연 위험이 여기에 표시됩니다."
            />
          ))}
        {view === "intake" && (
          <IntakeFeasibility
            role={role}
            notify={notify}
            goDefinition={() => go("definition")}
            projectNo={workflowTarget}
          />
        )}
        {view === "definition" && (
          <RequirementDefinition
            role={role}
            notify={notify}
            goDelivery={() => go("delivery")}
            projectNo={workflowTarget}
          />
        )}
        {view === "delivery" && (
          <DeliveryWorkplace
            role={role}
            openHub={() => openHub()}
            notify={notify}
            projectNo={workflowTarget}
          />
        )}
        {view === "operations" &&
          (adminProjectItems.some((project) => project.journeyStep >= 9) ? (
            <OperationsImprovement
              role={role}
              notify={notify}
              openGallerySubmission={openGallerySubmission}
            />
          ) : (
            <EmptyDataPage
              title="운영 중인 Agent가 없습니다."
              description="G4 확산 승인을 통과한 Agent의 운영 대장과 개선 이력이 여기에 표시됩니다."
            />
          ))}
        {view === "hub" && (
          <ProjectsHub
            selected={hubProject}
            onSelect={setHubProject}
            onPortal={(p) => {
              setHubProject(null);
              go("delivery");
              if (p) setDetail(p);
            }}
            notify={notify}
          />
        )}
        {view === "gallery" && (
          <Gallery
            query={query}
            setQuery={setQuery}
            agents={filteredAgents}
            notify={notify}
            role={role}
            databaseStatus={databaseStatus}
            applications={galleryApplications}
            initialDraft={galleryDraft}
            onDraftHandled={() => setGalleryDraft(null)}
            onSubmitApplication={submitGalleryApplication}
            onUpdateApplication={updateGalleryApplication}
          />
        )}
        {view === "governance" && role !== ACCOUNT_ROLES.user && (
          <Governance
            role={role}
            onDetail={setDetail}
            notify={notify}
            projects={adminProjectItems}
            onDeleteProject={deleteProject}
            onUpdateProject={updateProject}
            selectedGate={governanceGate}
            onGateChange={setGovernanceGate}
          />
        )}
      </main>

      {requestOpen && (
        <RequestWizard
          role={role}
          step={requestStep}
          setStep={setRequestStep}
          close={() => {
            setRequestOpen(false);
            setRequestStep(1);
          }}
          onSubmit={submitAgentRequest}
        />
      )}
      {llmCostGuideOpen && (
        <div
          className="llm-cost-setup-backdrop"
          onMouseDown={() => setLlmCostGuideOpen(false)}
        >
          <section
            className="llm-cost-setup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="llm-cost-setup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <Pill tone="blue">최초 1회 설정</Pill>
                <h2 id="llm-cost-setup-title">LLM Cost Monitoring 접속 준비</h2>
                <p>
                  브라우저는 Windows 시스템 파일을 관리자 권한으로 자동 수정할
                  수 없습니다.
                </p>
              </div>
              <button
                aria-label="설정 안내 닫기"
                onClick={() => setLlmCostGuideOpen(false)}
              >
                <X size={18} weight="bold" />
              </button>
            </header>
            <div className="llm-cost-setup-body">
              <div className="llm-cost-security-note">
                <ShieldCheck size={20} weight="fill" />
                <p>
                  <b>사용자가 직접 한 번만 설정해야 합니다.</b>
                  <span>
                    Windows의 hosts 파일은 운영체제 보안 영역이어서 사이트가
                    대신 변경할 수 없습니다.
                  </span>
                </p>
              </div>
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <b>메모장을 관리자 권한으로 실행</b>
                    <p>
                      시작 메뉴에서 메모장을 검색한 뒤 ‘관리자 권한으로 실행’을
                      선택합니다.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <b>hosts 파일 열기</b>
                    <p>
                      <code>C:\Windows\System32\drivers\etc\hosts</code>
                    </p>
                    <small>
                      파일명은 <b>hosts</b>이며 확장자가 없습니다. 파일 형식을
                      ‘모든 파일’로 선택하세요.
                    </small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <b>아래 한 줄을 추가하고 저장</b>
                    <div className="hosts-entry">
                      <code>203.228.99.65 llmcost.changshininc.com</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "203.228.99.65 llmcost.changshininc.com",
                          );
                          notify("hosts 설정 문구를 복사했습니다.");
                        }}
                      >
                        복사
                      </button>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
            <footer>
              <button
                className="secondary"
                onClick={() => setLlmCostGuideOpen(false)}
              >
                나중에 하기
              </button>
              <button
                className="primary"
                onClick={() => {
                  window.localStorage.setItem("llm-cost-hosts-ready", "true");
                  setLlmCostGuideOpen(false);
                  window.open(
                    "http://llmcost.changshininc.com/",
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                설정 완료 · 사이트 열기 <ArrowRight size={14} weight="bold" />
              </button>
            </footer>
          </section>
        </div>
      )}
      {detail && (
        <ProjectDrawer
          project={detail}
          role={role}
          close={() => setDetail(null)}
          openWorkflow={(next, projectNo) => {
            setWorkflowTarget(projectNo);
            setDetail(null);
            go(next);
          }}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>
            <Check size={12} weight="bold" />
          </span>
          {toast}
        </div>
      )}
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMobileNav(false)}
        />
      )}
    </div>
  );
}

function Dashboard({
  role,
  projectNo,
  onDeleteProject,
  setView,
  setRequestOpen,
  setDetail,
  userProjectItems,
  openGallerySubmission,
  openGovernance,
  notify,
}: {
  role: string;
  projectNo?: string;
  onDeleteProject: (projectNo: string) => void;
  setView: (v: View) => void;
  setRequestOpen: (v: boolean) => void;
  setDetail: (p: (typeof projects)[0]) => void;
  userProjectItems: UserProject[];
  openGallerySubmission: (draft: GalleryDraft) => void;
  openGovernance: (gate: string) => void;
  notify: (message: string) => void;
}) {
  const baseProjectItems =
    role === ACCOUNT_ROLES.member || role === ACCOUNT_ROLES.leader
      ? userProjectItems
      : userProjectItems;
  const targetRequirement = teamRequirements.find(
    (project) => project.id === projectNo,
  );
  const homeProjectItems =
    targetRequirement &&
    !baseProjectItems.some((project) => project.no === targetRequirement.id)
      ? [teamRequirementAsHomeProject(targetRequirement), ...baseProjectItems]
      : baseProjectItems;

  if (
    role === ACCOUNT_ROLES.leader ||
    role === ACCOUNT_ROLES.member ||
    role === ACCOUNT_ROLES.user
  )
    return (
      <UserDashboard
        role={role}
        projectNo={projectNo}
        onDeleteProject={onDeleteProject}
        setView={setView}
        openNewRequest={() => setRequestOpen(true)}
        projectItems={homeProjectItems}
        notify={notify}
        openGallerySubmission={openGallerySubmission}
      />
    );
  return (
    <div className="page dashboard">
      <section className="welcome">
        <div>
          <p className="eyebrow">FRIDAY, AUGUST 28</p>
          <h1>
            안녕하세요, 최병두님.
            <br />
            <span>오늘 처리할 Agent 업무를 확인하세요.</span>
          </h1>
        </div>
        <button className="primary" onClick={() => setView("intake")}>
          신규 접수 3건 확인 <ArrowRight size={14} weight="bold" />
        </button>
      </section>

      <section className="metrics">
        <article>
          <div className="metric-head">
            <span className="metric-icon blue">◫</span>
            <Pill tone="blue">+4 이번 달</Pill>
          </div>
          <strong>24</strong>
          <p>진행 중인 Agent 과제</p>
          <small>Portal 공식 생애주기 기준</small>
        </article>
        <article>
          <div className="metric-head">
            <span className="metric-icon orange">!</span>
            <Pill tone="orange">확인 필요</Pill>
          </div>
          <strong>{approvalQueue.length}</strong>
          <p>내 승인 대기</p>
          <small>G1 0 · G2 2 · G3 1 · G4 0</small>
        </article>
        <article>
          <div className="metric-head">
            <span className="metric-icon green">✓</span>
            <Pill tone="green">98.2%</Pill>
          </div>
          <strong>17</strong>
          <p>운영 중인 Agent</p>
          <small>정상 16 · 점검 필요 1</small>
        </article>
        <article>
          <div className="metric-head">
            <span className="metric-icon violet">↻</span>
            <Pill tone="violet">30일 이내</Pill>
          </div>
          <strong>3</strong>
          <p>재평가 예정</p>
          <small>지식 기준일 · 분기 평가</small>
        </article>
      </section>

      <section className="leader-home-fea-slot" aria-label="팀장 타당성 평가 작성">
        <div className="leader-home-fea-title">
          <div>
            <p className="eyebrow">FEASIBILITY WORKSPACE</p>
            <h2>타당성 평가 작성</h2>
            <span>신규 접수서와 인터뷰 결과를 확인하고 홈에서 바로 FEA를 작성합니다.</span>
          </div>
          <Pill tone="orange">작성 필요 1건</Pill>
        </div>
        <HomeFeasibilityEditor project={memberAdditionalProjects[0]} role={role} />
      </section>

      <section className="dashboard-grid">
        <article className="panel wide">
          <div className="panel-title">
            <div>
              <h2>승인 대기함</h2>
              <p>게이트별 필수 조건을 확인한 뒤 승인하세요.</p>
            </div>
            <button
              className="text-link"
              onClick={() => openGovernance("전체")}
            >
              전체 보기 →
            </button>
          </div>
          <div className="gate-row">
            {gates.map((g) => (
              <button
                key={g.code}
                className={`gate-card ${g.tone}`}
                onClick={() => openGovernance(g.code)}
              >
                <span>{g.code}</span>
                <div>
                  <strong>{g.label}</strong>
                  <small>{g.meta}</small>
                </div>
                <b>{g.count}</b>
              </button>
            ))}
          </div>
          <div className="review-list">
            {approvalQueue.map((item) => (
              <button
                className="review-item"
                key={item.project.no}
                onClick={() => setDetail(item.project)}
              >
                <span className={`status-line ${item.project.tone}`} />
                <div className="review-main">
                  <p>
                    <Pill tone={item.project.tone}>{item.gate} 승인 대기</Pill>
                    <span>{item.project.no}</span>
                  </p>
                  <strong>{item.project.name}</strong>
                  <small>
                    {item.project.dept} · 담당 {item.project.owner}
                  </small>
                </div>
                <div className="review-meta">
                  <b>{item.condition}</b>
                  <span>{item.project.due}</span>
                </div>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-title">
            <div>
              <h2>운영 알림</h2>
              <p>품질과 최신성 점검</p>
            </div>
            <button>•••</button>
          </div>
          <div className="alert-card critical">
            <div className="alert-icon">!</div>
            <div>
              <Pill tone="red">조치 필요</Pill>
              <strong>QMS 품질 가이드</strong>
              <p>지식 기준일이 92일 경과했습니다.</p>
              <button onClick={() => setView("governance")}>
                점검 기록 열기 →
              </button>
            </div>
          </div>
          <div className="timeline">
            <div>
              <span className="dot violet" />
              <p>
                <strong>구매계약 검토 Agent</strong>
                <br />
                G2 서명 요청이 도착했습니다.<small>12분 전</small>
              </p>
            </div>
            <div>
              <span className="dot green" />
              <p>
                <strong>Outlook 번역 Agent</strong>
                <br />
                월간 운영 점검이 완료되었습니다.<small>1시간 전</small>
              </p>
            </div>
            <div>
              <span className="dot blue" />
              <p>
                <strong>생산 품질 이슈 분석</strong>
                <br />
                평가셋 8건이 추가되었습니다.<small>어제</small>
              </p>
            </div>
          </div>
        </article>

        <article className="panel project-panel">
          <div className="panel-title">
            <div>
              <h2>개발 진행 현황</h2>
              <p>Projects Hub와 연결된 실행 작업입니다.</p>
            </div>
            <button className="text-link" onClick={() => setView("delivery")}>
              설계·개발 화면 →
            </button>
          </div>
          <div className="project-table">
            <div className="table-head">
              <span>AGENT / PROJECT</span>
              <span>PORTAL 단계</span>
              <span>HUB 상태</span>
              <span>진행률</span>
              <span>기한</span>
            </div>
            {projects.map((p) => (
              <button
                className="table-row"
                key={p.no}
                onClick={() => setDetail(p)}
              >
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.no} · {p.dept}
                  </small>
                </span>
                <span>
                  <Pill tone={p.tone}>{p.step}</Pill>
                </span>
                <span>{p.hub}</span>
                <span>
                  <Progress value={p.progress} />
                  <small>{p.progress}%</small>
                </span>
                <span>{p.due}</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function LegacyTeamWorkspaceDashboard({
  setView,
  openWorkflow,
}: {
  setView: (v: View) => void;
  openWorkflow: (view: View, projectNo: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("전체");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [selectedId, setSelectedId] = useState(teamRequirements[0].id);
  const [popupItem, setPopupItem] = useState<TeamRequirement | null>(null);
  const [selectedLifecycleMarker, setSelectedLifecycleMarker] = useState("1");

  const filtered = useMemo(
    () =>
      teamRequirements.filter((item) => {
        const matchesStatus =
          statusFilter === "전체" ||
          (statusFilter === "요구 접수" ? item.stage === "접수 검토" : false) ||
          (statusFilter === "요구 정의"
            ? item.status === "신규 접수" && item.stage !== "접수 검토"
            : false) ||
          (statusFilter === "지연 위험"
            ? item.risk === "지연 위험"
            : item.status === statusFilter);
        const matchesAssignee =
          assigneeFilter === "전체" || item.assignee === assigneeFilter;
        return matchesStatus && matchesAssignee;
      }),
    [statusFilter, assigneeFilter],
  );

  const selected =
    filtered.find((item) => item.id === selectedId) ||
    filtered[0] ||
    teamRequirements.find((item) => item.id === selectedId) ||
    teamRequirements[0];
  const counts = {
    intake: teamRequirements.filter((item) => item.stage === "접수 검토")
      .length,
    definition: teamRequirements.filter(
      (item) => item.status === "신규 접수" && item.stage !== "접수 검토",
    ).length,
    active: teamRequirements.filter((item) => item.status === "진행 중").length,
    done: teamRequirements.filter((item) => item.status === "완료").length,
    risk: teamRequirements.filter((item) => item.risk === "지연 위험").length,
  };
  const choose = (item: TeamRequirement) => setSelectedId(item.id);
  const openProject = (item: TeamRequirement) => {
    choose(item);
    setPopupItem(item);
  };
  const lifecycleSteps = [
    {
      label: "요구 접수",
      marker: "1",
      kind: "phase",
      document: "에이전트 요구 접수서[INT]",
      description:
        "요구자가 접수 Agent와 해결하려는 문제, 현재 업무 방식, 기대 효과와 희망 완료일을 작성합니다.",
      owner: "요구자 작성 · AI활성화팀 열람",
    },
    {
      label: "타당성 평가",
      marker: "2",
      kind: "phase",
      document: "타당성 평가서[FEA]",
      description:
        "배정 전 평가 담당자가 인터뷰 후 AI 적용 적합성, 저비용 대안, 기대 효과와 위험을 기록합니다.",
      owner: "AI활성화팀 평가 담당",
    },
    {
      label: "착수 승인",
      marker: "G1",
      kind: "gate",
      document: "타당성 평가서[FEA]",
      description:
        "팀장이 FEA를 근거로 Go·Conditional Go·Drop을 결정하고, Go 과제의 개발 담당과 트랙을 확정합니다.",
      approver: "AI활성화팀장",
      approval: "추진 판정 · 개발 담당 배정 · 트랙·Agent 유형 확정",
    },
    {
      label: "요구 정의",
      marker: "3",
      kind: "phase",
      document: "에이전트 요구사항 정의서[ARD]",
      description:
        "G1에서 지정된 개발 담당자가 요구자와 함께 자율성, 성공·평가 기준, Out of Scope, 실패 시나리오를 구체화합니다.",
      owner: "배정된 개발 담당 · 요구자",
    },
    {
      label: "개발 착수",
      marker: "G2",
      kind: "gate",
      document: "에이전트 요구사항 정의서[ARD]",
      description:
        "요구 정의가 충분한지 확인하고 실제 설계·개발을 시작해도 되는지 결정합니다.",
      approver: "요구자 + 개발 담당자 + AI활성화팀장",
      approval:
        "자율성, 성공·평가 기준, Out of Scope, 실패 시나리오 기재 완료를 3자 서명으로 승인",
    },
    {
      label: "설계·개발·평가",
      marker: "4",
      kind: "phase",
      document: "설계서[DES] · 평가 계획서[EVP] · 평가 결과 보고서[EVR]",
      description:
        "정의된 요구에 맞춰 Agent를 설계·개발하고, 기능·안전·실패 케이스를 독립적으로 평가합니다.",
      owner: "개발 담당 · 동료 리뷰어",
    },
    {
      label: "배포 승인",
      marker: "G3",
      kind: "gate",
      document: "평가 결과 보고서[EVR] + 배포 체크리스트[DEP]",
      description:
        "객관적인 평가 근거를 확인해 실제 사용 환경에 배포해도 되는지 결정하는 핵심 Gate입니다.",
      approver: "동료 리뷰어 + AI활성화팀장 (상 트랙은 정보보호 추가)",
      approval:
        "ARD 성공 기준 전 항목 통과와 금칙 위반 0건을 확인해 배포를 승인",
    },
    {
      label: "파일럿",
      marker: "5",
      kind: "phase",
      document: "배포 체크리스트[DEP] · 사용자 가이드[UG]",
      description:
        "제한된 사용자에게 먼저 적용해 사용률, 만족도, 오류를 확인하고 운영 인수인계를 준비합니다.",
      owner: "개발 담당 · 프로젝트 Owner · 운영 담당",
    },
    {
      label: "확산 승인",
      marker: "G4",
      kind: "gate",
      document: "배포 체크리스트[DEP] 파일럿 결과",
      description:
        "파일럿 결과를 근거로 전사·부서 확산 또는 운영 전환 여부를 결정합니다.",
      approver: "프로젝트 Owner + AI활성화팀장",
      approval:
        "파일럿 종료 기준 충족과 운영·지식 담당 인수 완료를 확인해 확산을 승인",
    },
    {
      label: "운영·개선",
      marker: "6",
      kind: "phase",
      document: "운영 대장[OPS] · 개선 이력서[CHG]",
      description:
        "배포 후 사용량, 품질, 오류와 변경 이력을 지속 관리합니다. 자율성 상향은 재심사를 진행합니다.",
      owner: "프로젝트 Owner · 운영 담당 · AI활성화팀",
    },
  ];
  const selectedLifecycleStep =
    lifecycleSteps.find((step) => step.marker === selectedLifecycleMarker) ||
    lifecycleSteps[0];
  const revealDetails = () => {
    setDetailOpen(true);
    window.setTimeout(
      () =>
        document
          .querySelector(".team-detail-workspace")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80,
    );
  };

  const statusCard = (
    label: string,
    value: number,
    description: string,
    tone: string,
    icon: React.ReactNode,
    status: string,
  ) => (
    <button
      className={`team-kpi-card ${tone} ${detailOpen && statusFilter === status ? "selected" : ""}`}
      aria-expanded={detailOpen && statusFilter === status}
      onClick={() => {
        if (detailOpen && statusFilter === status) {
          setDetailOpen(false);
          return;
        }
        setStatusFilter(status);
        setAssigneeFilter("전체");
        revealDetails();
      }}
    >
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{description}</p>
      </div>
      <ArrowRight size={15} />
    </button>
  );

  return (
    <div className="page team-workspace-page">
      <section className="team-workspace-hero">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={13} weight="fill" /> AI ACTIVATION TEAM · PRIVATE
            WORKSPACE
          </p>
          <h1>팀 포트폴리오 & 리소스</h1>
          <p>
            팀 전체 과제의 배정, 진행, 완료, 병목을 질문 없이 바로 확인합니다.
          </p>
        </div>
        <button
          className="secondary team-detail-toggle"
          onClick={() => {
            if (detailOpen) return setDetailOpen(false);
            setStatusFilter("전체");
            setAssigneeFilter("전체");
            revealDetails();
          }}
          aria-expanded={detailOpen}
        >
          <ChartBar size={15} />{" "}
          {detailOpen ? "진행 현황 접기" : "전체 진행 현황 보기"}
        </button>
      </section>

      <section
        className={`panel team-lifecycle-overview ${lifecycleOpen ? "open" : "collapsed"}`}
        aria-label="Agent 생애주기별 진행 현황"
      >
        <button
          className="lifecycle-dropdown-trigger"
          type="button"
          onClick={() => setLifecycleOpen((value) => !value)}
          aria-expanded={lifecycleOpen}
          aria-controls="team-lifecycle-content"
        >
          <div>
            <span className="lifecycle-heading-mark">LC</span>
            <div>
              <h2>Agent Life Cycle</h2>
              <p>요구 접수부터 운영·개선까지의 표준 진행 순서</p>
            </div>
          </div>
          <div className="lifecycle-compact-summary">
            <span>
              <b>6</b> 단계
            </span>
            <span>
              <b>4</b> 승인 Gate
            </span>
            <ArrowRight size={17} weight="bold" />
          </div>
        </button>
        {lifecycleOpen && (
          <div
            id="team-lifecycle-content"
            className="lifecycle-dropdown-content"
          >
            <div className="team-lifecycle-scroll">
              <div
                className="team-lifecycle-track"
                aria-label="요구 접수, 타당성 평가, G1 착수 승인, 요구 정의, G2 개발 착수, 설계·개발·평가, G3 배포 승인, 파일럿, G4 확산 승인, 운영·개선 순서"
              >
                <div className="lifecycle-flow-line" />
                {lifecycleSteps.map((step) => (
                  <button
                    type="button"
                    aria-pressed={selectedLifecycleStep.marker === step.marker}
                    className={`lifecycle-milestone ${step.kind} ${selectedLifecycleStep.marker === step.marker ? "selected" : ""}`}
                    key={`${step.marker}-${step.label}`}
                    onClick={() => setSelectedLifecycleMarker(step.marker)}
                  >
                    <span>{step.marker}</span>
                    <strong>{step.label}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`lifecycle-detail-panel ${selectedLifecycleStep.kind}`}
              aria-live="polite"
            >
              <div className="lifecycle-detail-title">
                <span>{selectedLifecycleStep.marker}</span>
                <div>
                  <small>
                    {selectedLifecycleStep.kind === "gate"
                      ? "APPROVAL GATE"
                      : "PROCESS STEP"}
                  </small>
                  <h3>{selectedLifecycleStep.label}</h3>
                </div>
              </div>
              <p>{selectedLifecycleStep.description}</p>
              <dl>
                <div>
                  <dt>근거 문서</dt>
                  <dd>{selectedLifecycleStep.document}</dd>
                </div>
                {selectedLifecycleStep.kind === "gate" ? (
                  <>
                    <div>
                      <dt>승인자</dt>
                      <dd>{selectedLifecycleStep.approver}</dd>
                    </div>
                    <div>
                      <dt>승인 내용</dt>
                      <dd>{selectedLifecycleStep.approval}</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>주요 수행</dt>
                    <dd>{selectedLifecycleStep.owner}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}
      </section>

      <section className="team-kpi-grid" aria-label="요구 상태 요약">
        {statusCard(
          "요구 접수",
          counts.intake,
          "요청이 접수된 항목",
          "orange",
          <Plus size={18} weight="bold" />,
          "요구 접수",
        )}
        {statusCard(
          "요구 정의",
          counts.definition,
          "G1 통과·ARD 작성 및 보완",
          "violet",
          <FileText size={18} weight="bold" />,
          "요구 정의",
        )}
        {statusCard(
          "진행 중",
          counts.active,
          "정의·개발·평가·파일럿",
          "blue",
          <ArrowsClockwise size={18} weight="bold" />,
          "진행 중",
        )}
        {statusCard(
          "완료",
          counts.done,
          "운영 전환·인수인계 완료",
          "green",
          <CheckCircle size={18} weight="fill" />,
          "완료",
        )}
        {statusCard(
          "지연 위험",
          counts.risk,
          "오늘 조치가 필요한 항목",
          "red",
          <WarningCircle size={18} weight="fill" />,
          "지연 위험",
        )}
      </section>

      {detailOpen && (
        <section
          className="team-detail-workspace compact-project-detail"
          aria-label={`${statusFilter} 프로젝트별 진행 현황`}
        >
          <section className="team-portfolio-grid">
            <article className="panel team-portfolio-table">
              <div className="panel-title">
                <div>
                  <h2>프로젝트별 진행 현황</h2>
                  <p>
                    <b>{statusFilter}</b> 항목의 담당자, 현재 단계와 다음 행동을
                    확인합니다.
                  </p>
                </div>
                <div className="compact-project-actions">
                  <button className="text-link" onClick={() => setView("hub")}>
                    Projects Hub →
                  </button>
                  <button
                    className="compact-collapse-link"
                    aria-label="프로젝트별 진행 현황 접기"
                    onClick={() => setDetailOpen(false)}
                  >
                    <ArrowRight size={15} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="portfolio-head">
                <span>프로젝트</span>
                <span>담당자 / 요청팀</span>
                <span>현재 단계</span>
                <span>진행률</span>
                <span>마감</span>
              </div>
              <div>
                {filtered.length ? (
                  filtered.map((item) => (
                    <button
                      key={item.id}
                      className={selected.id === item.id ? "selected" : ""}
                      onClick={() => openProject(item)}
                    >
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.id} · {item.received} 접수
                        </small>
                      </span>
                      <span>
                        <b>{item.assignee}</b>
                        <small>{item.requestTeam}</small>
                      </span>
                      <span>
                        <Pill
                          tone={
                            item.status === "완료"
                              ? "green"
                              : item.risk === "지연 위험"
                                ? "red"
                                : item.status === "신규 접수"
                                  ? "orange"
                                  : "blue"
                          }
                        >
                          {item.stage}
                        </Pill>
                        <small>{item.nextAction}</small>
                      </span>
                      <span>
                        <Progress value={item.progress} />
                        <small>{item.progress}%</small>
                      </span>
                      <span
                        className={item.risk === "지연 위험" ? "urgent" : ""}
                      >
                        8.{item.dueDay}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="compact-project-empty">
                    해당 상태의 프로젝트가 없습니다.
                  </p>
                )}
              </div>
            </article>
          </section>
        </section>
      )}
      <TeamPortfolioAnalytics
        onMember={(name) => {
          setStatusFilter("전체");
          setAssigneeFilter(name);
          revealDetails();
        }}
        onProject={openProject}
      />
      {popupItem && (
        <TeamProjectModal
          item={popupItem}
          close={() => setPopupItem(null)}
          openWorkflow={openWorkflow}
        />
      )}
    </div>
  );
}

function TeamPortfolioAnalytics({
  onMember,
  onProject,
}: {
  onMember: (name: string) => void;
  onProject: (item: TeamRequirement) => void;
}) {
  const memberNames = aiTeamMembers;
  const members = memberNames
    .map((name) => {
      const items = teamRequirements.filter((item) => item.assignee === name);
      return {
        name,
        total: items.length,
        intake: items.filter((item) => item.stage === "접수 검토").length,
        definition: items.filter(
          (item) => item.status === "신규 접수" && item.stage !== "접수 검토",
        ).length,
        active: items.filter((item) => item.status === "진행 중").length,
        done: items.filter((item) => item.status === "완료").length,
        risk: items.filter((item) => item.risk === "지연 위험").length,
      };
    })
    .sort((a, b) => b.total - a.total);
  const maxAssigned = Math.max(...members.map((member) => member.total), 1);
  const activeProjects = [...teamRequirements]
    .filter((item) => item.status !== "완료")
    .sort(
      (a, b) =>
        Number(b.assignee === "미배정") - Number(a.assignee === "미배정") ||
        Number(b.risk === "지연 위험") - Number(a.risk === "지연 위험") ||
        a.dueDay - b.dueDay,
    )
    .slice(0, 5);
  const attentionCount = teamRequirements.filter(
    (item) => item.risk !== "정상" && item.status !== "완료",
  ).length;

  return (
    <section
      className="compact-team-overview"
      aria-label="AI활성화팀 업무 분포와 우선 확인 과제"
    >
      <article className="panel compact-workload-panel">
        <header>
          <div>
            <small>TEAM WORKLOAD</small>
            <h2>담당자별 업무 분포</h2>
            <p>등록 프로젝트 기준 · 총 업무 수가 많은 순서</p>
          </div>
          <div className="workload-summary">
            <span>
              미배정{" "}
              <b>
                {
                  teamRequirements.filter((item) => item.assignee === "미배정")
                    .length
                }
              </b>
            </span>
            <span className="attention">
              주의 <b>{attentionCount}</b>
            </span>
          </div>
        </header>
        <div className="workload-legend" aria-label="업무 단계 범례">
          <span className="intake">요구 접수</span>
          <span className="definition">요구 정의</span>
          <span className="active">진행 중</span>
          <span className="done">완료</span>
          <span className="risk">지연 위험</span>
        </div>
        <div className="workload-table">
          <div className="workload-head">
            <span>담당자</span>
            <span>총 업무 수</span>
            <span>단계별 분포</span>
            <span>접수</span>
            <span>정의</span>
            <span>진행</span>
            <span>완료</span>
            <span>지연</span>
            <span>합계</span>
          </div>
          {members.map((member) => (
            <button key={member.name} onClick={() => onMember(member.name)}>
              <span className="workload-person">
                <span className="member-avatar">{member.name.slice(0, 1)}</span>
                <strong>{member.name}</strong>
                {member.total >= 4 && <em>과부하</em>}
              </span>
              <span className="workload-total">
                <b>{member.total}</b>
                <i>
                  <u
                    style={{
                      width: `${Math.max((member.total / maxAssigned) * 100, 8)}%`,
                    }}
                  />
                </i>
              </span>
              <span
                className="workload-stack"
                aria-label={`${member.name} 단계별 업무 분포`}
              >
                {member.intake > 0 && (
                  <i className="intake" style={{ flex: member.intake }} />
                )}
                {member.definition > 0 && (
                  <i
                    className="definition"
                    style={{ flex: member.definition }}
                  />
                )}
                {member.active > 0 && (
                  <i className="active" style={{ flex: member.active }} />
                )}
                {member.done > 0 && (
                  <i className="done" style={{ flex: member.done }} />
                )}
              </span>
              <span>{member.intake}</span>
              <span>{member.definition}</span>
              <span>{member.active}</span>
              <span>{member.done}</span>
              <span className={member.risk ? "risk-count" : ""}>
                {member.risk}
              </span>
              <b>{member.total}</b>
            </button>
          ))}
        </div>
      </article>

      <article className="panel compact-priority-panel">
        <header>
          <div>
            <small>PRIORITY QUEUE</small>
            <h2>우선 확인 과제</h2>
            <p>미배정·지연 위험·마감일 순으로 정렬</p>
          </div>
          <span>확인 {activeProjects.length}건</span>
        </header>
        <div className="compact-priority-head">
          <span>프로젝트</span>
          <span>상태</span>
          <span>담당자</span>
          <span>진행률</span>
          <span />
        </div>
        <div className="compact-priority-list">
          {activeProjects.map((item) => (
            <button key={item.id} onClick={() => onProject(item)}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.id} · {item.requestTeam}
                </small>
              </div>
              <span>
                <Pill
                  tone={
                    item.risk === "지연 위험"
                      ? "red"
                      : item.status === "신규 접수"
                        ? "orange"
                        : "blue"
                  }
                >
                  {item.stage}
                </Pill>
              </span>
              <small>{item.assignee}</small>
              <b>{item.progress}%</b>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function TeamProjectModal({
  item,
  close,
  openWorkflow,
}: {
  item: TeamRequirement;
  close: () => void;
  openWorkflow: (view: View, projectNo: string) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && close();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const goToWorkflow = () => {
    close();
    openWorkflow("home", item.id);
  };

  return (
    <div className="team-project-modal-backdrop" onMouseDown={close}>
      <section
        className="team-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-project-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Pill
              tone={
                item.status === "완료"
                  ? "green"
                  : item.risk === "지연 위험"
                    ? "red"
                    : item.status === "신규 접수"
                      ? "orange"
                      : "blue"
              }
            >
              {item.status}
            </Pill>
            <small>{item.id}</small>
          </div>
          <button aria-label="프로젝트 상세 닫기" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="team-project-modal-title">
          <span
            className={`focus-risk ${item.risk === "지연 위험" ? "red" : item.risk === "확인 필요" ? "orange" : "green"}`}
          >
            {item.risk}
          </span>
          <h2 id="team-project-modal-title">{item.title}</h2>
          <p>
            {item.requestTeam} {item.requester} 요청 · {item.received} 접수
          </p>
        </div>
        <div className="team-project-modal-progress">
          <div>
            <span>전체 진행률</span>
            <b>{item.progress}%</b>
          </div>
          <Progress value={item.progress} />
        </div>
        <dl>
          <div>
            <dt>현재 단계</dt>
            <dd>{item.stage}</dd>
          </div>
          <div>
            <dt>AI팀 담당</dt>
            <dd>{item.assignee}</dd>
          </div>
          <div>
            <dt>목표일</dt>
            <dd>2026.08.{String(item.dueDay).padStart(2, "0")}</dd>
          </div>
          <div>
            <dt>우선순위</dt>
            <dd>{item.priority}</dd>
          </div>
        </dl>
        <aside>
          <small>다음 행동</small>
          <strong>{item.nextAction}</strong>
        </aside>
        <footer>
          <button className="primary" onClick={goToWorkflow}>
            홈에서 Agent 과제 보기
          </button>
        </footer>
      </section>
    </div>
  );
}

const travelFeasibility = {
  summary: [
    "해외 출장 규정이 PDF와 사내 게시판에 분산돼 있어 담당자가 매번 근거 조항과 예외를 수작업으로 확인합니다.",
    "월 약 120건의 문의가 반복되고 답변 편차와 재문의가 발생해, 승인된 규정을 근거로 일관된 안내가 필요합니다.",
    "규정 검색·해석·출처 제시를 자동화하되 예외와 저신뢰 답변은 담당자에게 이관하는 Agent를 요청했습니다.",
  ],
  alternatives: [
    {
      label: "프로세스/규정 개선으로 해결 가능한가?",
      result: "대안 불충분",
      detail:
        "규정 체계를 정비하면 중복은 줄지만, 국가·직급·출장 유형별 조항을 찾고 예외를 해석하는 반복 업무는 남습니다.",
    },
    {
      label: "기존 시스템 기능/설정으로 가능한가?",
      result: "대안 불충분",
      detail:
        "그룹웨어와 GMS는 문서 조회와 결재만 지원하며, 연관 조항 비교·예외 판단·근거 포함 답변 기능이 없습니다.",
    },
    {
      label: "매크로/엑셀로 충분한가?",
      result: "대안 불충분",
      detail:
        "정형 조건표는 만들 수 있으나 규정 버전과 국가별 예외가 바뀔 때 유지보수가 어렵고 자연어 문의를 처리할 수 없습니다.",
    },
    {
      label: "단순 LLM 챗 활용으로 충분한가?",
      result: "대안 불충분",
      detail:
        "승인 문서만 사용한다는 보장, 조항 출처, 버전 통제, 접근 권한과 저신뢰 답변의 담당자 이관이 필요합니다.",
    },
  ],
  suitability: [
    {
      label: "판단 규칙의 문서화 가능성",
      grade: "상",
      note: "출장비 규정과 국가·직급별 기준이 승인 문서로 존재",
    },
    {
      label: "데이터 접근성",
      grade: "중",
      note: "PDF·게시판 문서는 확보 가능하나 색인과 버전 관리 필요",
    },
    {
      label: "오류 허용도",
      grade: "중",
      note: "비용 확정 전 사용자가 근거를 확인하고 담당자에게 이관 가능",
    },
    {
      label: "반복성·볼륨",
      grade: "상",
      note: "월 약 120건의 유사 문의가 반복",
    },
    {
      label: "정치적 이슈",
      grade: "하",
      note: "규정 소관은 명확하며 민감한 예외만 담당자가 판단",
    },
  ],
};

function HomeFeasibilityEditor({
  project,
  role,
  onComplete,
}: {
  project: UserProject;
  role: string;
  onComplete?: () => void;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const author = isLeader ? "최병두 팀장" : "허정환 담당자";
  const [summary, setSummary] = useState(
    `${project.description} 현업 인터뷰를 통해 현재 업무량과 기대 결과를 확인하고 있습니다.`,
  );
  const [alternatives, setAlternatives] = useState(["", "", "", ""]);
  const [conclusion, setConclusion] = useState("");
  const [fitGrades, setFitGrades] = useState(["미평가", "미평가", "미평가", "미평가", "미평가"]);
  const [countPerMonth, setCountPerMonth] = useState("");
  const [asIsMinutes, setAsIsMinutes] = useState("");
  const [people, setPeople] = useState("");
  const [toBeMinutes, setToBeMinutes] = useState("");
  const [writeExec, setWriteExec] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [scope, setScope] = useState("COMPANY");
  const [damageFinancial, setDamageFinancial] = useState(false);
  const [autonomy, setAutonomy] = useState("L0");
  const [saveState, setSaveState] = useState("자동 저장됨");
  const [completionMessage, setCompletionMessage] = useState("");
  const track = useMemo(
    () =>
      judgeFeasibilityTrack({
        writeExec,
        sensitive,
        scope,
        damageFinancial,
        autonomy,
      }),
    [autonomy, damageFinancial, scope, sensitive, writeExec],
  );
  const roi = useMemo(
    () =>
      calculateFeasibilityRoi({
        countPerMonth: Number(countPerMonth),
        asIsMinutes: Number(asIsMinutes),
        people: Number(people),
        toBeMinutes,
      }),
    [asIsMinutes, countPerMonth, people, toBeMinutes],
  );
  const updateAlternative = (index: number, value: string) =>
    setAlternatives((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  const saveDocument = () => {
    setSaveState("방금 저장됨");
    setCompletionMessage("작성 내용과 판정 근거가 저장되었습니다.");
  };
  const completeDocument = () => {
    if (!roi.computed) {
      setCompletionMessage(
        "To-Be 시간/건이 미확보 상태입니다. 수치를 확인한 뒤 FEA 작성을 완료해 주세요.",
      );
      return;
    }
    setSaveState("작성 완료");
    setCompletionMessage("FEA가 작성 완료되어 G1 착수 승인 대기로 이동했습니다.");
    onComplete?.();
  };
  const alternativeLabels = [
    "프로세스·규정 개선",
    "기존 시스템 기능·설정",
    "매크로·Excel",
    "단순 LLM 챗·검색",
  ];
  const fitLabels = [
    "판단 규칙 문서화",
    "데이터 접근성",
    "오류 허용도",
    "반복성·볼륨",
    "정치적 이슈",
  ];
  const recommendation = roi.computed ? "Go 권고" : "Conditional Go 권고";

  return (
    <section className="home-fea-editor" aria-label="홈 타당성 평가서 작성">
      <header className="home-fea-editor-head">
        <div>
          <small>{project.no}-FEA · 작성 중</small>
          <h3>타당성 평가서[FEA]</h3>
          <p>접수서와 인터뷰 결과를 읽으면서 대안·적합성·효과·위험을 이 화면에서 함께 작성합니다.</p>
        </div>
        <div>
          <span>작성자 {author}</span>
          <Pill tone={isLeader ? "violet" : "blue"}>{isLeader ? "팀장 작성" : "담당자 작성"}</Pill>
          <b>72%</b>
        </div>
      </header>

      <section className="home-fea-engine" aria-label="타당성 판정 엔진 결과">
        <header>
          <span><ShieldCheck size={17} weight="fill" /></span>
          <div>
            <b>타당성 판정 엔진</b>
            <small>결정적 규칙이 계산하고, LLM은 결과를 바꾸지 않습니다.</small>
          </div>
          <Pill tone="blue">표준체계 v1.0</Pill>
          <small>기준 2026.07.30 · SHA 3fa0cb3db344</small>
        </header>
        <div className="home-fea-engine-grid">
          <article>
            <small>규칙 트랙 판정</small>
            <strong>{track.label} 트랙</strong>
            <p>{track.signals.join(" · ")}</p>
            <span>{track.citation}</span>
          </article>
          <article>
            <small>Agent 유형 판정</small>
            <strong>미확정</strong>
            <p>인터뷰와 위험 항목 입력 후 확정</p>
            <span>표준체계 0.4절</span>
          </article>
          <article>
            <small>자율성 정합성</small>
            <strong>{autonomy} · 초안</strong>
            <p>요구 정의 단계에서 근거와 함께 확정</p>
            <span>자율성-트랙 기준표</span>
          </article>
          <article className="recommendation">
            <small>엔진 권고 · 참고용</small>
            <strong>{recommendation}</strong>
            <p>{roi.computed ? "대안과 정량 효과를 확인했습니다." : "To-Be 처리시간 확인이 필요합니다."}</p>
            <span>최종 결정은 G1에서 팀장이 확정</span>
          </article>
        </div>
        <footer>
          {["G-1 상 트랙 전건 검사", "G-2 권고·확정 분리", "G-3 미확보 수치 추정 금지", "G-4 근거 조항 표시", "G-5 Drop 대안", "G-6 민감정보 차단", "G-7 범위 밖 실행 거절"].map((item) => (
            <span key={item}><Check size={11} weight="bold" /> {item}</span>
          ))}
          <b>규칙 회귀 40/40</b>
        </footer>
      </section>

      <div className="home-fea-form-grid">
        <section>
          <header><span>01</span><div><b>요구 요약</b><small>접수서 핵심 내용을 3줄로 요약</small></div><Pill tone="orange">작성 중</Pill></header>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
        </section>
        <section>
          <header><span>02</span><div><b>대안 검토</b><small>낮은 비용 대안부터 순서대로 검토</small></div><Pill tone="blue">4건 필수</Pill></header>
          <div className="home-fea-alternatives">
            {alternativeLabels.map((label, index) => (
              <label key={label}>
                <input type="checkbox" checked={Boolean(alternatives[index].trim())} readOnly />
                <span><b>{label}</b><input value={alternatives[index]} onChange={(event) => updateAlternative(index, event.target.value)} /></span>
              </label>
            ))}
          </div>
          <label className="home-fea-conclusion"><span>에이전트 개발이 타당한 이유</span><textarea value={conclusion} onChange={(event) => setConclusion(event.target.value)} /></label>
        </section>
        <section>
          <header><span>03</span><div><b>에이전트 적합성 진단</b><small>5개 기준을 상·중·하로 판단</small></div><Pill tone="orange">미평가</Pill></header>
          <div className="home-fea-fit">
            {fitLabels.map((label, index) => (
              <label key={label}><span>{label}</span><select value={fitGrades[index]} onChange={(event) => setFitGrades((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}><option>미평가</option><option>상</option><option>중</option><option>하</option></select><input placeholder="인터뷰를 바탕으로 판단 근거 입력" /></label>
            ))}
          </div>
        </section>
        <section>
          <header><span>04</span><div><b>기대효과·ROI</b><small>확보된 수치로만 규칙 계산</small></div><Pill tone={roi.computed ? "green" : "orange"}>{roi.computed ? "산출" : "보완 필요"}</Pill></header>
          <div className="home-fea-roi-inputs">
            <label>건수/월<input type="number" value={countPerMonth} onChange={(event) => setCountPerMonth(event.target.value)} /></label>
            <label>As-Is 분/건<input type="number" value={asIsMinutes} onChange={(event) => setAsIsMinutes(event.target.value)} /></label>
            <label>인원<input type="number" value={people} onChange={(event) => setPeople(event.target.value)} /></label>
            <label>To-Be 분/건<input type="number" value={toBeMinutes} onChange={(event) => setToBeMinutes(event.target.value)} placeholder="⬜ 미확보" /></label>
          </div>
          <div className={`home-fea-roi-result ${roi.computed ? "computed" : "missing"}`}>
            <small>규칙 계산 결과</small>
            <b>{roi.computed ? `월 ${roi.savedHours}시간 · 연 ${roi.savedMdYear} M/D 절감` : "⬜ 미확보"}</b>
            <p>{roi.computed ? roi.formula : roi.reason}</p>
          </div>
          <label className="home-fea-cost">개발 비용 추정<input placeholder="인력 M/D + 플랫폼/API 비용 · 확인된 값만 입력" /></label>
        </section>
        <section>
          <header><span>05</span><div><b>위험 식별·유형·트랙 판정</b><small>5개 응답을 전건 검사해 자동 판정</small></div><Pill tone={track.track === "HIGH" ? "red" : "orange"}>{track.label} 트랙</Pill></header>
          <div className="home-fea-risk-grid">
            <label>쓰기·실행 권한<select value={writeExec ? "YES" : "NO"} onChange={(event) => setWriteExec(event.target.value === "YES")}><option value="NO">아니오</option><option value="YES">예</option></select></label>
            <label>개인정보·기밀<select value={sensitive ? "YES" : "NO"} onChange={(event) => setSensitive(event.target.value === "YES")}><option value="NO">아니오</option><option value="YES">예 · 마스킹 필요</option></select></label>
            <label>사용 범위<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="PERSONAL">개인</option><option value="TEAM">팀</option><option value="DEPT">부서</option><option value="COMPANY">전사</option></select></label>
            <label>오답 피해<select value={damageFinancial ? "YES" : "NO"} onChange={(event) => setDamageFinancial(event.target.value === "YES")}><option value="NO">회복 가능한 운영 불편</option><option value="YES">금전·법적 피해 가능</option></select></label>
            <label>Agent 유형<select value="HYBRID" disabled><option value="HYBRID">혼합형 · 규칙+판단</option></select></label>
            <label>자율성 초안<select value={autonomy} onChange={(event) => setAutonomy(event.target.value)}><option>L0</option><option>L1</option><option>L2</option><option>L3</option><option>L4</option></select></label>
          </div>
        </section>
        <section>
          <header><span>06</span><div><b>G1 착수 판정 반영</b><small>FEA 작성과 공식 승인을 분리</small></div><Pill tone="orange">판정 대기</Pill></header>
          <div className="home-fea-g1-waiting"><ShieldCheck size={23} weight="duotone" /><div><b>공식 Go·Conditional Go·Drop은 아직 확정하지 않습니다.</b><p>이 화면에서는 FEA 근거를 작성합니다. 작성 완료 후 최병두 팀장이 G1에서 추진 여부와 개발 담당자를 확정하면 결과가 자동 반영됩니다.</p></div></div>
        </section>
      </div>

      <footer className="home-fea-actions">
        <span><CheckCircle size={15} weight="fill" /> {saveState}</span>
        {completionMessage && <p role="status">{completionMessage}</p>}
        <button className="secondary" onClick={saveDocument}>임시 저장</button>
        <button className="primary" onClick={completeDocument}>FEA 작성 완료 · G1 요청</button>
      </footer>
    </section>
  );
}

function FeasibilityResult({
  projectNo,
  state,
  editable = false,
  role = ACCOUNT_ROLES.user,
  projectItem,
  onComplete,
}: {
  projectNo: string;
  state: string;
  editable?: boolean;
  role?: string;
  projectItem?: UserProject;
  onComplete?: () => void;
}) {
  const [activeSection, setActiveSection] = useState(0);
  const project =
    projectItem ||
    [...memberAdditionalProjects, ...userProjects].find(
      (item) => item.no === projectNo,
    ) ||
    userProjects[0];
  const impact = (
    {
      "2026-028": {
        volume: "120건/월",
        before: "12분",
        after: "3분",
        current: "24시간/월",
        future: "6시간/월",
        saving: "18시간/월 · 75%",
        quality: "근거 조항 포함 답변율 95% 이상",
      },
      "2026-021": {
        volume: "80건/월",
        before: "45분",
        after: "10분",
        current: "60시간/월",
        future: "13시간/월",
        saving: "47시간/월 · 78%",
        quality: "근거 포함 분석 95% 이상 · 재검토율 5% 이하",
      },
      "2026-014": {
        volume: "486건/월",
        before: "8분",
        after: "2분",
        current: "65시간/월",
        future: "16시간/월",
        saving: "49시간/월 · 75%",
        quality: "지연 안내 누락률 2% 이하 · 상태 근거 100%",
      },
    } as const
  )[projectNo as "2026-028" | "2026-021" | "2026-014"] || {
    volume: "20건/월",
    before: "45분",
    after: "10분",
    current: "15시간/월",
    future: "3.3시간/월",
    saving: "11.7시간/월 · 78%",
    quality: "영향 문서 누락 0건 목표",
  };
  const feasibilitySummary =
    projectNo === "2026-028"
      ? travelFeasibility.summary
      : [
          `${project.name} 요청은 현재 업무에서 자료 탐색과 수작업 비교가 반복되어 처리시간과 누락 위험이 발생하는 문제를 해결하려는 과제입니다.`,
          `${impact.volume} 수준의 반복 업무를 Agent가 먼저 정리하되, 최종 판정과 실행은 담당자가 수행하는 통제 구조가 필요합니다.`,
          `승인된 지식과 읽기 전용 데이터만 사용하고 근거·신뢰도를 표시하며 예외는 담당자에게 이관하는 방식으로 추진합니다.`,
        ];
  const alternatives =
    projectNo === "2026-028"
      ? travelFeasibility.alternatives
      : [
          {
            label: "프로세스/규정 개선으로 해결 가능한가?",
            result: "대안 불충분",
            detail:
              "절차와 기준을 정비해도 여러 자료를 지속적으로 탐색·비교하고 예외를 식별하는 반복 업무가 남습니다.",
          },
          {
            label: "기존 시스템 기능/설정으로 가능한가?",
            result: "대안 불충분",
            detail:
              "기존 시스템은 개별 조회를 제공하지만 관련 자료를 통합 비교하고 근거 포함 초안을 만드는 기능이 없습니다.",
          },
          {
            label: "매크로/엑셀로 충분한가?",
            result: "대안 불충분",
            detail:
              "정형 값 비교는 가능하지만 비정형 문서, 예외 조건, 변경되는 지식의 버전 통제와 이관을 처리하기 어렵습니다.",
          },
          {
            label: "단순 LLM 챗 활용으로 충분한가?",
            result: "대안 불충분",
            detail:
              "승인 데이터 접근, 출처·버전 통제, 권한·감사 로그, 저신뢰 답변 이관이 필요해 단순 챗만으로는 충분하지 않습니다.",
          },
        ];
  const sectionItems = [
    ["요구 요약", "접수서 핵심 내용 3줄"],
    ["대안 검토", "4개 대안과 개발 타당성 결론"],
    ["에이전트 적합성 진단", "5개 기준별 상·중·하 판단"],
    ["기대 효과 정량화", "간이 ROI·품질·개발 비용"],
    ["위험 식별 및 트랙 분류", "권한·데이터·유형·자율성"],
    ["G1 착수 판정 반영", "팀장 Go·Conditional Go·Drop 결정과 추진 조건"],
  ];
  const waitingForFea = state === "진행 중";
  const ready = state === "완료";
  if (editable && !ready)
    return (
      <HomeFeasibilityEditor
        project={project}
        role={role}
        onComplete={onComplete}
      />
    );
  if (!ready)
    return (
      <section className="fea-result upcoming" aria-label="타당성 평가서">
        <header>
          <div>
            <small>
              {projectNo ? `${projectNo}-FEA` : "FEA"} · {waitingForFea ? "작성 대기" : "생성 전"}
            </small>
            <h3>타당성 평가서[FEA]</h3>
            <p>
              요구 접수 후 AI활성화팀 담당자가 인터뷰 결과를 반영해 대안,
              적합성, 효과와 위험을 작성합니다.
            </p>
          </div>
          <Pill tone={waitingForFea ? "orange" : "gray"}>
            {waitingForFea ? "타당성 평가 대기" : "생성 전"}
          </Pill>
        </header>
        <div className="fea-empty">
          <FileText size={28} weight="duotone" />
          <b>
            {waitingForFea
              ? "요구 접수가 완료되었습니다"
              : "요구 접수 완료 후 작성됩니다"}
          </b>
          <p>
            {waitingForFea
              ? "AI활성화팀의 인터뷰와 FEA 작성이 시작되면 진행 상태와 결과가 이곳에 표시됩니다."
              : "현재 단계에서는 에이전트 요구 접수서[INT]를 먼저 완료해 주세요."}
          </p>
        </div>
      </section>
    );

  return (
    <section
      className="fea-result selectable-document"
      aria-label="타당성 평가서"
    >
      <header>
        <div>
          <small>{projectNo}-FEA · v1.0 · 2026.08.24</small>
          <h3>타당성 평가서[FEA]</h3>
          <p>
            “왜 Agent여야 하는가?”를 대안·효과·위험 근거로 정리한 작성
            결과입니다.
          </p>
        </div>
        <div className="document-progress-summary">
          <Pill tone="green">작성 완료</Pill>
          <strong>100%</strong>
        </div>
      </header>
      <nav
        className="document-section-navigator"
        aria-label="타당성 평가서 항목"
      >
        {sectionItems.map(([title, description], index) => (
          <button
            type="button"
            key={title}
            style={{ order: index * 2 + 1 }}
            className={activeSection === index ? "active" : ""}
            onClick={() => setActiveSection(index)}
            aria-expanded={activeSection === index}
            aria-current={activeSection === index ? "true" : undefined}
          >
            <span className="section-check complete">
              <Check size={14} weight="bold" />
            </span>
            <div>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <b>{title}</b>
              <p>{description}</p>
            </div>
            <em>완료</em>
            <ArrowRight size={14} weight="bold" />
          </button>
        ))}
      </nav>
      <div className="fea-body section-detail-body">
        <section
          className="fea-section full"
          style={{ order: 2 }}
          hidden={activeSection !== 0}
        >
          <div className="fea-section-title">
            <span>01</span>
            <div>
              <b>요구 요약</b>
              <small>에이전트 요구 접수서[INT] 핵심 내용 3줄</small>
            </div>
          </div>
          <ol className="fea-summary">
            {feasibilitySummary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section
          className="fea-section full"
          style={{ order: 4 }}
          hidden={activeSection !== 1}
        >
          <div className="fea-section-title">
            <span>02</span>
            <div>
              <b>대안 검토</b>
              <small>비용이 낮은 대안부터 순차 검토</small>
            </div>
            <Pill tone="blue">4개 대안 검토</Pill>
          </div>
          <div className="fea-alternatives">
            {alternatives.map((item, index) => (
              <article key={item.label}>
                <span className="alternative-order">{index + 1}</span>
                <div>
                  <b>{item.label}</b>
                  <p>{item.detail}</p>
                </div>
                <span className="alternative-result">
                  <X size={12} weight="bold" /> {item.result}
                </span>
              </article>
            ))}
          </div>
          <div className="fea-conclusion">
            <span>
              <CheckCircle size={18} weight="fill" />
            </span>
            <div>
              <small>결론 · 에이전트 개발이 타당한 이유</small>
              <b>
                {project.name}은 승인된 자료를 통합 탐색·비교해 근거가 포함된
                초안을 만들고, 불확실한 결과를 담당자에게 이관하는 통제형
                Agent로 구현하는 것이 타당합니다.
              </b>
            </div>
          </div>
        </section>

        <section
          className="fea-section"
          style={{ order: 6 }}
          hidden={activeSection !== 2}
        >
          <div className="fea-section-title">
            <span>03</span>
            <div>
              <b>에이전트 적합성 진단</b>
              <small>각 항목 상·중·하 및 판단 근거</small>
            </div>
            <Pill tone="green">적합</Pill>
          </div>
          <div className="fea-suitability">
            {travelFeasibility.suitability.map((item) => (
              <article key={item.label}>
                <div>
                  <b>{item.label}</b>
                  <small>{item.note}</small>
                </div>
                <span className={`grade grade-${item.grade}`}>
                  {item.grade}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section
          className="fea-section"
          style={{ order: 8 }}
          hidden={activeSection !== 3}
        >
          <div className="fea-section-title">
            <span>04</span>
            <div>
              <b>기대 효과 정량화</b>
              <small>간이 ROI와 품질 개선 기대</small>
            </div>
            <Pill tone="violet">산출</Pill>
          </div>
          <div className="fea-roi">
            <article>
              <small>현재 소요</small>
              <b>
                {impact.volume} × {impact.before}
              </b>
              <strong>{impact.current}</strong>
            </article>
            <span>→</span>
            <article>
              <small>도입 후 예상</small>
              <b>
                {impact.volume} × {impact.after}
              </b>
              <strong>{impact.future}</strong>
            </article>
          </div>
          <div className="fea-saving">
            <div>
              <small>예상 절감</small>
              <b>{impact.saving}</b>
            </div>
            <span>
              <i style={{ width: "75%" }} />
            </span>
          </div>
          <dl className="fea-detail-list">
            <div>
              <dt>품질</dt>
              <dd>{impact.quality}</dd>
            </div>
            <div>
              <dt>개발 비용 추정</dt>
              <dd>18 M/D + 플랫폼·API 약 30만원/월</dd>
            </div>
          </dl>
        </section>

        <section
          className="fea-section"
          style={{ order: 10 }}
          hidden={activeSection !== 4}
        >
          <div className="fea-section-title">
            <span>05</span>
            <div>
              <b>위험 식별 및 트랙 분류</b>
              <small>권한·데이터·사용 범위·최대 피해</small>
            </div>
            <Pill tone="orange">중 트랙</Pill>
          </div>
          <dl className="fea-risk-grid">
            <div>
              <dt>쓰기/실행 권한</dt>
              <dd>
                <Pill tone="green">아니오</Pill>
              </dd>
            </div>
            <div>
              <dt>개인정보/기밀</dt>
              <dd>
                <Pill tone="orange">예 · 마스킹</Pill>
              </dd>
            </div>
            <div>
              <dt>사용 범위</dt>
              <dd>전사</dd>
            </div>
            <div>
              <dt>오답의 최대 피해</dt>
              <dd>비용 반려·규정 위반</dd>
            </div>
          </dl>
          <div className="fea-classification">
            <article>
              <small>유형 판정</small>
              <b>혼합형 Agent</b>
              <p>규칙 검색 + 예외 판단</p>
            </article>
            <article>
              <small>트랙 판정</small>
              <b>중</b>
              <p>개인정보와 비용 영향</p>
            </article>
            <article>
              <small>자율성 초안</small>
              <b>L0</b>
              <p>안내만, 실행 권한 없음</p>
            </article>
          </div>
        </section>

        <section
          className="fea-section"
          style={{ order: 12 }}
          hidden={activeSection !== 5}
        >
          <div className="fea-section-title">
            <span>06</span>
            <div>
              <b>G1 착수 판정 반영</b>
              <small>AI활성화팀장 결정과 후속 조건</small>
            </div>
            <Pill tone="green">GO</Pill>
          </div>
          <div className="fea-decision">
            <CheckCircle size={26} weight="fill" />
            <div>
              <small>G1 승인 결과 · AI활성화팀장</small>
              <b>Go · 중 트랙 · 2026년 9월 파일럿 목표</b>
              <p>
                승인 규정만 사용 · 답변마다 근거 조항 표시 · 저신뢰 답변 담당자
                이관 · 개인정보 마스킹을 조건으로 추진합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

const ardProjectProfiles = {
  "2026-028": {
    name: "출장 규정 문의 Agent",
    oneLine:
      "전사 출장자가 기준을 확인할 때 승인 규정을 검색해 적용 기준과 근거 조항을 안내하고 예외 문의는 담당자에게 연결한다.",
    background:
      "분산된 규정 검색과 반복 문의로 월 24시간이 소요됩니다. 승인 문서에 근거한 일관된 답변으로 처리시간과 재문의를 줄입니다.",
    stakeholders:
      "요구자 김현우 / 오너 경영지원팀장 / 사용자 전사 출장자 / 개발 AI활성화팀 허정환 / 운영 경영지원팀 규정 담당자",
    pain: "국가·직급·출장 유형별 예외 조항을 여러 문서에서 반복 대조하고 최신 규정 여부를 사람이 판단해야 합니다.",
    pain2:
      "예외 문의의 이관 기준과 이력 관리가 명확하지 않아 담당자별 답변 편차가 발생합니다.",
    baseline:
      "월평균 120건 · 일반 문의 12분/건 · 예외 문의 최대 30분 · 재문의율 18% · 근거 포함 답변 62%",
    hitl: "저신뢰 답변과 규정에 없는 예외는 경영지원팀이 확인하며 출장비 확정과 결재는 사용자가 수행합니다.",
    autonomy: "L0",
    autonomyReason: "규정 조회·요약·답변만 제공하고 실행 권한은 부여하지 않음",
    business: "처리시간 12분 → 3분",
    secondary: "재문의율 18% → 8%",
    knowledge: "해외출장비규정 v3.2 · 국가별 체재비 기준 2026.08",
    data: "사내 문서함 PDF/게시판 · 읽기 전용 색인",
    knowledgeOwner: "경영지원팀 규정 담당자",
    evalSource: "과거 출장 문의·기안 50건",
    inScope: [
      "승인된 출장 규정 검색",
      "조건별 기준·금액 한도 비교",
      "근거 조항과 출처 링크 제시",
      "저신뢰·예외 문의 담당자 이관",
    ],
    outScope: [
      "출장비 최종 확정",
      "결재 작성·제출 또는 시스템 변경",
      "규정에 없는 예외 승인",
      "개인별 인사정보 추론",
    ],
    asIs: [
      "출장자가 국가·직급·출장 유형을 메일로 문의한다.",
      "담당자가 게시판과 문서함에서 최신 규정을 찾는다.",
      "체재비·직급별 한도와 예외 조항을 대조한다.",
      "적용 기준과 근거 조항을 정리해 답변한다.",
    ],
    toBe: [
      "출장자가 자연어 질문과 조건을 입력한다.",
      "Agent가 승인된 최신 규정만 검색해 적용 조항을 비교한다.",
      "적용 기준·금액 한도·출처를 함께 제시한다.",
      "저신뢰·예외 문의는 담당자에게 이관한다.",
    ],
  },
  "2026-021": {
    name: "생산 품질 이슈 분석 Agent",
    oneLine:
      "품질 담당자가 생산 이슈를 확인할 때 승인된 품질 기준과 과거 사례를 검색해 원인 후보·근거·조치 초안을 제안한다.",
    background:
      "생산 품질 이슈마다 규정·불량 코드·과거 조치 사례를 수작업으로 대조해 분석 시간이 길고 담당자별 결과 편차가 발생합니다.",
    stakeholders:
      "요구자 박서연 / 오너 품질혁신팀장 / 사용자 생산·품질 담당자 / 개발 AI활성화팀 허정환 / 운영 품질혁신팀 정수빈",
    pain: "QMS·SAP·공정 문서가 분산되어 관련 기준과 유사 사례를 찾는 데 시간이 집중됩니다.",
    pain2:
      "복합 원인과 저신뢰 케이스의 이관 기준이 일정하지 않아 누락과 재검토가 반복됩니다.",
    baseline: "월평균 80건 · 분석 45분/건 · 재검토율 16% · 근거 포함 보고 58%",
    hitl: "Agent는 원인 후보와 조치 초안만 제안하며 최종 품질 판정·출하 여부·SAP 변경은 품질 담당자가 승인합니다.",
    autonomy: "L1",
    autonomyReason: "분석 초안을 생성하되 사람이 전부 검토한 후 사용",
    business: "분석시간 45분 → 10분",
    secondary: "재검토율 16% → 5%",
    knowledge: "품질업무 표준서 · 불량 원인 코드 · 승인 조치 사례",
    data: "QMS 문서 색인 · SAP QM 읽기 전용 API",
    knowledgeOwner: "품질혁신팀 정수빈",
    evalSource: "과거 품질 이슈·조치 보고서 50건",
    inScope: [
      "품질 이슈 요약과 분류",
      "승인 규정·유사 사례 검색",
      "원인 후보와 조치 초안 제안",
      "저신뢰·복합 이슈 담당자 이관",
    ],
    outScope: [
      "최종 품질 판정",
      "출하 승인·보류 확정",
      "SAP·QMS 데이터 변경",
      "근거 없는 원인 단정",
    ],
    asIs: [
      "담당자가 생산 이슈와 검사 결과를 수집한다.",
      "QMS 규정과 SAP 불량 코드를 각각 검색한다.",
      "과거 유사 사례와 조치 결과를 수작업으로 비교한다.",
      "원인·조치 보고서를 작성하고 책임자 검토를 요청한다.",
      "보완 요청 시 자료를 다시 찾아 보고서를 수정한다.",
    ],
    toBe: [
      "담당자가 이슈·공정·검사 결과를 입력한다.",
      "Agent가 승인 규정과 유사 사례를 검색한다.",
      "원인 후보·근거·신뢰도·조치 초안을 제시한다.",
      "저신뢰·복합 원인은 품질 책임자에게 이관한다.",
      "담당자가 최종 판정 후 시스템 처리를 수행한다.",
    ],
  },
  "2026-014": {
    name: "샘플 발송 현황 알림 Agent",
    oneLine:
      "샘플 담당자가 발송 현황을 관리할 때 승인된 배송 데이터를 조회해 지연·통관 예외를 요약하고 알림 초안을 제공한다.",
    background:
      "택배사·ERP·메일에 분산된 발송 상태를 수작업으로 확인하느라 지연 대응과 고객 안내가 늦어집니다.",
    stakeholders:
      "요구자 이민지 / 오너 물류운영팀장 / 사용자 샘플·영업 담당자 / 개발 AI활성화팀 이민지 / 운영 물류운영팀 이수민",
    pain: "택배사별 조회 화면과 ERP 내역을 반복 확인하고 지연 건을 수기로 선별해야 합니다.",
    pain2:
      "통관·주소 오류 등 예외 발생 시 담당자 이관과 안내 이력이 한곳에 남지 않습니다.",
    baseline: "월평균 486건 · 확인 8분/건 · 지연 안내 누락률 9% · 재문의율 14%",
    hitl: "Agent는 조회와 알림 초안만 제공하며 발송 정보 변경·고객 확정 안내는 담당자가 확인합니다.",
    autonomy: "L1",
    autonomyReason: "현황·알림 초안을 생성하고 사람이 검토 후 발송",
    business: "확인시간 8분 → 2분",
    secondary: "안내 누락률 9% → 2%",
    knowledge: "택배사 상태 코드 · 국가별 통관 가이드 · 샘플 발송 SOP",
    data: "ERP 배송 목록 · 택배사 조회 API 읽기 전용",
    knowledgeOwner: "물류운영팀 이수민",
    evalSource: "과거 발송·지연·문의 사례 60건",
    inScope: [
      "발송 상태 통합 조회",
      "지연·통관 예외 식별",
      "담당자·고객 알림 초안",
      "예외 건 물류 담당자 이관",
    ],
    outScope: [
      "배송지·운송장 임의 변경",
      "고객에게 자동 발송",
      "분실·보상 최종 판정",
      "개인정보 원문 재노출",
    ],
    asIs: [
      "담당자가 ERP에서 발송 대상과 운송장을 확인한다.",
      "택배사별 사이트에서 배송 상태를 조회한다.",
      "지연·통관 예외를 수기로 분류한다.",
      "영업·고객 안내 문구를 작성해 전달한다.",
    ],
    toBe: [
      "Agent가 ERP와 택배사 상태를 읽기 전용으로 조회한다.",
      "지연·통관 예외를 자동 분류하고 근거 상태를 표시한다.",
      "담당자와 고객용 알림 초안을 생성한다.",
      "담당자가 확인 후 발송하고 예외는 물류팀에 이관한다.",
    ],
  },
  "2026-031": {
    name: "개발 BOM 변경 영향 분석 Agent",
    oneLine:
      "개발 담당자가 BOM 변경을 검토할 때 관련 부품·품질 문서·변경 영향 후보를 찾아 검토 초안을 제공한다.",
    background:
      "BOM 변경 때 SAP·Excel·품질 문서를 수작업으로 대조해 누락 위험과 긴 검토 시간이 발생합니다.",
    stakeholders:
      "요구자 김현우 / 오너 개발1팀장 / 사용자 개발·품질 담당자 / 개발 AI활성화팀 김지훈 / 운영 개발1팀 BOM 담당자",
    pain: "변경 부품과 연결된 문서를 여러 시스템에서 반복 검색해야 합니다.",
    pain2:
      "영향 범위 누락이 품질 승인과 양산 일정 지연으로 이어질 수 있습니다.",
    baseline:
      "월평균 20건 · 검토 45분/건 · 담당 2명 · 영향 문서 누락 수기 점검",
    hitl: "Agent는 영향 후보만 제시하며 변경 승인과 최종 영향 판정은 개발·품질 담당자가 수행합니다.",
    autonomy: "L1",
    autonomyReason: "영향 분석 초안을 생성하고 사람이 전부 검토",
    business: "검토시간 45분 → 10분",
    secondary: "영향 문서 누락 0건 목표",
    knowledge: "BOM 변경 기준 · 품질 승인 SOP · 부품 연계 규칙",
    data: "SAP BOM 읽기 전용 · Excel 변경 목록 · QMS 문서",
    knowledgeOwner: "개발1팀 BOM 담당자",
    evalSource: "과거 BOM 변경·승인 사례 40건",
    inScope: [
      "변경 부품 식별",
      "연관 품질 문서 검색",
      "영향 후보·근거 정리",
      "담당자 검토 체크리스트 생성",
    ],
    outScope: [
      "BOM 직접 변경",
      "품질 승인 자동 처리",
      "양산 적용 여부 확정",
      "근거 없는 영향 단정",
    ],
    asIs: [
      "담당자가 SAP BOM과 Excel 변경 목록을 내려받는다.",
      "변경 전후 부품을 수기로 비교한다.",
      "QMS에서 연관 품질 문서를 검색한다.",
      "영향 범위를 정리해 개발·품질 검토를 요청한다.",
    ],
    toBe: [
      "담당자가 변경 BOM과 변경 사유를 입력한다.",
      "Agent가 변경 부품과 연결 문서를 탐색한다.",
      "영향 후보·근거·확인 필요 항목을 정리한다.",
      "개발·품질 담당자가 최종 검토와 승인을 수행한다.",
    ],
  },
} as const;

function RequirementDefinitionResult({
  projectNo,
  state,
  reworkMode = false,
  reworkReason,
  onReworkSubmit,
}: {
  projectNo: string;
  state: string;
  reworkMode?: boolean;
  reworkReason?: string;
  onReworkSubmit?: () => void;
}) {
  const profile =
    ardProjectProfiles[projectNo as keyof typeof ardProjectProfiles] ||
    ardProjectProfiles["2026-031"];
  const [completed, setCompleted] = useState(state === "완료" && !reworkMode);
  const [activeSections, setActiveSections] = useState<number[]>(
    reworkMode ? [2, 6] : [0],
  );
  const [input, setInput] = useState("");
  const [inScopeDraft, setInScopeDraft] = useState(
    "승인된 출장 규정 검색 및 적용 기준 안내\n국가·직급·출장 유형별 근거 조항 제시\n예외 문의의 규정 담당자 이관",
  );
  const [outScopeDraft, setOutScopeDraft] = useState(
    "출장비 확정 및 결재 실행\n예외 규정의 임의 승인\n근거 없는 한도·비용 산출",
  );
  const [labelOwner, setLabelOwner] = useState("경영지원팀 규정 담당자");
  const [accuracyTarget, setAccuracyTarget] = useState("90");
  const [evidenceTarget, setEvidenceTarget] = useState("100");
  const reworkReady =
    inScopeDraft.trim().length > 0 &&
    outScopeDraft.trim().length > 0 &&
    labelOwner.trim().length > 0 &&
    accuracyTarget.trim().length > 0 &&
    evidenceTarget.trim().length > 0;
  const sectionItems = [
    ["개요", "에이전트 정의·목적·이해관계자"],
    ["As-Is 프로세스", "현행 흐름·고통 지점·Baseline"],
    ["To-Be 프로세스", "Agent 담당 단계·사람 개입·범위"],
    ["자율성 수준 정의", "L0–L4 수준과 상향 조건"],
    ["기능 요구사항 (FR)", "입력·행동·출력과 우선순위"],
    ["지식·데이터 요구사항", "참조 지식·연동·최신성 책임"],
    ["성공 기준 및 평가 기준", "비즈니스·품질·평가셋 기준"],
    ["실패 시나리오 및 대응", "실패 유형·피해·설계 대응"],
    ["비기능 요구사항", "보안·성능·감사 추적"],
    ["제약 및 전제", "플랫폼·일정·조직 제약"],
  ];
  const [definitionMessages, setDefinitionMessages] = useState([
    {
      role: "agent",
      text: "요구 접수서[INT]와 타당성 평가서[FEA]를 불러왔습니다. Agent가 반드시 해야 하는 업무 범위를 확인할게요.",
    },
    {
      role: "user",
      text: "승인된 출장 규정을 찾아 국가·직급·출장 유형에 맞는 기준과 근거 조항을 안내해야 합니다.",
    },
    {
      role: "agent",
      text: "좋습니다. 반대로 Agent가 하면 안 되는 일과 사용자가 최종 확인해야 하는 지점을 알려주세요.",
    },
    {
      role: "user",
      text: "출장비를 확정하거나 결재를 실행하면 안 되고, 예외 규정은 담당자에게 연결해야 합니다.",
    },
    {
      role: "agent",
      text: "마지막으로 성공 여부를 판단할 정확도와 처리시간 기준을 정해볼까요?",
    },
  ]);
  const sendDefinitionAnswer = () => {
    if (!input.trim()) return;
    setDefinitionMessages((items) => [
      ...items,
      { role: "user", text: input.trim() },
      {
        role: "agent",
        text: "답변을 성공 기준에 반영했습니다. 남은 통제 조건을 확인하면 ARD 작성을 완료할 수 있습니다.",
      },
    ]);
    setInput("");
  };
  const asIsSteps = profile.asIs;
  const toBeSteps = profile.toBe;

  if (state === "생성 전")
    return (
      <section
        className="intake-document ard-document ard-upcoming"
        aria-label="에이전트 요구사항 정의서 생성 전"
      >
        <header>
          <div>
            <small>{projectNo}-ARD · 생성 전</small>
            <h3>에이전트 요구사항 정의서[ARD]</h3>
            <p>G1 착수 승인 후 표준 10개 항목에 따라 작성됩니다.</p>
          </div>
          <Pill tone="gray">생성 전</Pill>
        </header>
        <div className="fea-empty">
          <FileText size={28} weight="duotone" />
          <b>요구 정의 단계 시작 후 작성됩니다</b>
          <p>
            개요부터 제약 및 전제까지 동일한 최신 ARD 양식이 이 과제에
            연결됩니다.
          </p>
        </div>
      </section>
    );

  return (
    <div className={`intake-result-layout ${completed ? "complete" : "draft"}`}>
      <section
        className="intake-document ard-document selectable-document"
        aria-label="에이전트 요구사항 정의서"
      >
        <header>
          <div>
            <small>
              {projectNo}-ARD · v0.8 · AGENT REQUIREMENTS DEFINITION
            </small>
            <h3>에이전트 요구사항 정의서[ARD]</h3>
            <p>G1 승인 범위를 개발·평가 가능한 요구사항으로 구체화합니다.</p>
          </div>
          <div className="document-progress-summary">
            <Pill tone={completed ? "green" : "violet"}>
              {completed ? "작성 완료" : "작성 중 · 자동 저장"}
            </Pill>
            <strong>{completed ? "100%" : "80%"}</strong>
          </div>
        </header>
        <nav
          className="document-section-navigator ard-section-navigator"
          aria-label="에이전트 요구사항 정의서 항목"
        >
          {sectionItems.map(([title, description], index) => {
            const done = completed || ![6, 9].includes(index);
            return (
              <button
                type="button"
                key={title}
                style={{ order: index * 2 + 1 }}
                className={activeSections.includes(index) ? "active" : ""}
                onClick={() =>
                  setActiveSections((current) =>
                    current.includes(index)
                      ? current.filter((item) => item !== index)
                      : [...current, index],
                  )
                }
                aria-expanded={activeSections.includes(index)}
                aria-current={activeSections.includes(index) ? "true" : undefined}
              >
                <span
                  className={`section-check ${done ? "complete" : "pending"}`}
                >
                  {done ? <Check size={14} weight="bold" /> : "…"}
                </span>
                <div>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <b>{title}</b>
                  <p>{description}</p>
                </div>
                <em>{done ? "완료" : index === 6 ? "확인 필요" : "작성 중"}</em>
                <ArrowRight size={14} weight="bold" />
              </button>
            );
          })}
        </nav>
        {reworkMode && (
          <section className="ard-rework-banner" aria-label="G2 반려 보완 안내">
            <div>
              <Pill tone="red">G2 반려 · 보완 필요</Pill>
              <h4>반려 사유를 반영해 ARD를 수정한 뒤 다시 상신하세요.</h4>
              <p>
                {reworkReason ||
                  "Out of Scope와 평가셋 정답 라벨 책임자를 명확히 한 뒤 다시 검토해야 합니다."}
              </p>
            </div>
            <div className="ard-rework-targets">
              <button type="button" onClick={() => setActiveSections([2, 6])}>
                03 To-Be · In/Out Scope
              </button>
              <button type="button" onClick={() => setActiveSections([2, 6])}>
                07 성공·평가 기준
              </button>
            </div>
          </section>
        )}
        <div className="ard-standard-body">
          <section style={{ order: 2 }} hidden={!activeSections.includes(0)}>
            <div className="ard-section-head">
              <span>01</span>
              <div>
                <b>개요</b>
                <small>에이전트 정의·목적·이해관계자</small>
              </div>
            </div>
            <dl className="ard-facts">
              <div>
                <dt>1.1 이름 / 한 줄 정의</dt>
                <dd>
                  <b>{profile.name}</b>
                  <br />
                  {profile.oneLine}
                </dd>
              </div>
              <div>
                <dt>1.2 배경 및 목적</dt>
                <dd>{profile.background}</dd>
              </div>
              <div>
                <dt>1.3 이해관계자</dt>
                <dd>{profile.stakeholders}</dd>
              </div>
            </dl>
          </section>

          <section style={{ order: 4 }} hidden={!activeSections.includes(1)}>
            <div className="ard-section-head">
              <span>02</span>
              <div>
                <b>As-Is 프로세스</b>
                <small>현행 흐름·고통 지점·Baseline</small>
              </div>
            </div>
            <div className="ard-rich-text">
              <h4>2.1 프로세스 맵</h4>
              <p>
                현재 업무는 다음 순서로 진행됩니다. 실제 과제에 따라 필요한 단계
                수만큼 작성하며, 각 단계에 담당자·시스템·소요시간·사용 문서를
                함께 기록합니다.
              </p>
              <ol>
                {asIsSteps.map((step, index) => (
                  <li key={step}>
                    <b>단계 {index + 1}.</b> {step}
                  </li>
                ))}
              </ol>
              <h4>2.2 고통 지점(Pain Point)</h4>
              <p>{profile.pain}</p>
              <p>{profile.pain2}</p>
              <h4>2.3 현행 기준 지표(Baseline)</h4>
              <p>
                {profile.baseline}. 이 값을 도입 후 개선 효과의 측정 원점으로
                사용합니다.
              </p>
            </div>
          </section>

          <section
            style={{ order: 6 }}
            hidden={!activeSections.includes(2)}
            className={reworkMode ? "ard-rework-section" : ""}
          >
            <div className="ard-section-head">
              <span>03</span>
              <div>
                <b>To-Be 프로세스</b>
                <small>Agent 담당 단계·사람 개입·범위 선언</small>
              </div>
            </div>
            <div className="ard-rich-text">
              <h4>3.1 프로세스 맵</h4>
              <ol>
                {toBeSteps.map((step, index) => (
                  <li key={step}>
                    <b>단계 {index + 1}.</b> {step}
                  </li>
                ))}
              </ol>
              <h4>3.2 사람 개입 지점(Human-in-the-loop)</h4>
              <p>{profile.hitl}</p>
              <h4>3.3 에이전트 범위 선언</h4>
              <div className="ard-scope-grid">
                <div>
                  <b>In Scope</b>
                  <ol>
                    {profile.inScope.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <b>Out of Scope</b>
                  <ol>
                    {profile.outScope.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              </div>
              {reworkMode && (
                <div className="ard-rework-editor scope-editor">
                  <label>
                    In Scope 보완
                    <textarea
                      value={inScopeDraft}
                      onChange={(event) => setInScopeDraft(event.target.value)}
                      aria-label="In Scope 보완"
                    />
                  </label>
                  <label>
                    Out of Scope 보완
                    <textarea
                      value={outScopeDraft}
                      onChange={(event) => setOutScopeDraft(event.target.value)}
                      aria-label="Out of Scope 보완"
                    />
                  </label>
                </div>
              )}
            </div>
          </section>

          <section style={{ order: 8 }} hidden={!activeSections.includes(3)}>
            <div className="ard-section-head">
              <span>04</span>
              <div>
                <b>자율성 수준 정의</b>
                <small>필수 · 사람 승인과 향후 상향 조건</small>
              </div>
              <Pill tone="green">{profile.autonomy}</Pill>
            </div>
            <div className="autonomy-scale">
              {[
                "L0 정보 제공",
                "L1 초안 생성",
                "L2 승인 후 실행",
                "L3 자동 실행",
                "L4 완전 자율",
              ].map((label, index) => (
                <span
                  key={label}
                  className={
                    index === Number(profile.autonomy.slice(1))
                      ? "selected"
                      : ""
                  }
                >
                  {label}
                </span>
              ))}
            </div>
            <dl className="ard-inline-list">
              <div>
                <dt>이 에이전트의 수준</dt>
                <dd>
                  <b>{profile.autonomy}</b> · {profile.autonomyReason}
                </dd>
              </div>
              <div>
                <dt>향후 상향 조건</dt>
                <dd>
                  운영 3개월간 오류율 2% 미만, 금칙 위반 0건, Owner 승인 시 상향
                  재심사
                </dd>
              </div>
            </dl>
          </section>

          <section style={{ order: 10 }} hidden={!activeSections.includes(4)}>
            <div className="ard-section-head">
              <span>05</span>
              <div>
                <b>기능 요구사항 (FR)</b>
                <small>입력 → Agent 행동 → 출력 · M/S/C 우선순위</small>
              </div>
            </div>
            <div className="ard-table-wrap">
              <table className="ard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>기능</th>
                    <th>입력 → 에이전트 행동 → 출력</th>
                    <th>우선순위</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>FR-01</td>
                    <td>규정 검색</td>
                    <td>
                      자연어 질문 → 승인 문서 검색·관련 조항 추출 → 근거
                      조항/링크
                    </td>
                    <td>
                      <Pill tone="red">M</Pill>
                    </td>
                  </tr>
                  <tr>
                    <td>FR-02</td>
                    <td>조건별 기준 안내</td>
                    <td>
                      국가·직급·출장 유형 → 적용 규칙 비교 → 금액 한도·적용 기준
                    </td>
                    <td>
                      <Pill tone="red">M</Pill>
                    </td>
                  </tr>
                  <tr>
                    <td>FR-03</td>
                    <td>신뢰도 통제</td>
                    <td>
                      검색 결과 → 근거·신뢰도 검증 → 답변 또는 담당자 이관
                    </td>
                    <td>
                      <Pill tone="red">M</Pill>
                    </td>
                  </tr>
                  <tr>
                    <td>FR-04</td>
                    <td>연관 FAQ 제안</td>
                    <td>사용자 질문 → 유사 문의 탐색 → 후속 질문·관련 FAQ</td>
                    <td>
                      <Pill tone="blue">S</Pill>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ order: 12 }} hidden={!activeSections.includes(5)}>
            <div className="ard-section-head">
              <span>06</span>
              <div>
                <b>지식·데이터 요구사항</b>
                <small>참조 지식·연동·최신성 책임</small>
              </div>
            </div>
            <dl className="ard-facts">
              <div>
                <dt>6.1 참조 지식</dt>
                <dd>{profile.knowledge} · 월 1회 및 개정 즉시 갱신</dd>
              </div>
              <div>
                <dt>6.2 연동 데이터</dt>
                <dd>{profile.data}</dd>
              </div>
              <div>
                <dt>6.3 최신성 책임</dt>
                <dd>
                  <b>{profile.knowledgeOwner}</b>가 개정 자료 등록·구버전
                  폐기·색인 갱신·표본 답변 확인을 수행
                </dd>
              </div>
            </dl>
          </section>

          <section
            style={{ order: 14 }}
            hidden={!activeSections.includes(6)}
            className={reworkMode ? "ard-rework-section" : ""}
          >
            <div className="ard-section-head">
              <span>07</span>
              <div>
                <b>성공 기준 및 평가 기준</b>
                <small>필수 · 개발 전 확정</small>
              </div>
              {!completed && <Pill tone="orange">1건 확인 필요</Pill>}
            </div>
            <div className="ard-metrics">
              <article>
                <small>비즈니스</small>
                <b>{profile.business}</b>
                <span>{profile.secondary}</span>
              </article>
              <article>
                <small>정확도</small>
                <b>평가셋 50건 · 90% 이상</b>
                <span>현업 정답 라벨 기준</span>
              </article>
              <article>
                <small>안전성</small>
                <b>금칙 위반 0건</b>
                <span>실행·예외 승인 금지</span>
              </article>
              <article>
                <small>형식 준수율</small>
                <b>{completed ? "95% 이상" : "목표값 확인 중"}</b>
                <span>기준·근거·출처 포함</span>
              </article>
            </div>
            <dl className="ard-inline-list">
              <div>
                <dt>7.3 평가셋 확보</dt>
                <dd>
                  {profile.evalSource} / {profile.knowledgeOwner}가 정답과 근거
                  라벨 작성
                </dd>
              </div>
            </dl>
            {!completed && (
              <span className="missing-answer">형식 준수율 목표 확인 필요</span>
            )}
            <div className="ard-gate-note">
              <b>G2 확인 항목</b>
              <span>
                이 기준 미달 시 배포하지 않는다는 3자 합의는 개발 착수
                게이트에서 기록합니다.
              </span>
            </div>
            {reworkMode && (
              <div className="ard-rework-editor metrics-editor">
                <label>
                  정답 라벨 책임자
                  <input
                    value={labelOwner}
                    onChange={(event) => setLabelOwner(event.target.value)}
                    aria-label="정답 라벨 책임자"
                  />
                </label>
                <label>
                  정확도 목표(%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={accuracyTarget}
                    onChange={(event) => setAccuracyTarget(event.target.value)}
                    aria-label="정확도 목표"
                  />
                </label>
                <label>
                  근거 제시율 목표(%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={evidenceTarget}
                    onChange={(event) => setEvidenceTarget(event.target.value)}
                    aria-label="근거 제시율 목표"
                  />
                </label>
              </div>
            )}
          </section>

          <section style={{ order: 16 }} hidden={!activeSections.includes(7)}>
            <div className="ard-section-head">
              <span>08</span>
              <div>
                <b>실패 시나리오 및 대응</b>
                <small>필수 · 설계 반영 사항</small>
              </div>
            </div>
            <div className="ard-table-wrap">
              <table className="ard-table failure">
                <thead>
                  <tr>
                    <th>실패 유형</th>
                    <th>예시</th>
                    <th>피해</th>
                    <th>대응</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>오답(환각)</td>
                    <td>없는 한도·조항 생성</td>
                    <td>비용 반려·규정 위반</td>
                    <td>근거 없는 답변 금지, 저신뢰 시 이관</td>
                  </tr>
                  <tr>
                    <td>지식 최신성 오류</td>
                    <td>폐기된 규정 인용</td>
                    <td>잘못된 비용 안내</td>
                    <td>버전 필터, 개정 즉시 재색인</td>
                  </tr>
                  <tr>
                    <td>범위 밖 질문</td>
                    <td>개인 예외 승인 요청</td>
                    <td>권한 오남용</td>
                    <td>답변 중단 후 담당자 연결</td>
                  </tr>
                  <tr>
                    <td>악의적 입력</td>
                    <td>규칙 무시·원문 유출 지시</td>
                    <td>기밀 유출</td>
                    <td>시스템 지침 우선, 입력 차단·로그</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ order: 18 }} hidden={!activeSections.includes(8)}>
            <div className="ard-section-head">
              <span>09</span>
              <div>
                <b>비기능 요구사항</b>
                <small>보안·성능·감사 추적</small>
              </div>
            </div>
            <dl className="ard-facts compact">
              <div>
                <dt>보안</dt>
                <dd>
                  내부 등급 · 승인 플랫폼만 사용 · 개인정보 마스킹 · 로그 1년
                  보관
                </dd>
              </div>
              <div>
                <dt>성능</dt>
                <dd>평균 응답 10초 이내 · 동시 사용자 100명</dd>
              </div>
              <div>
                <dt>감사 추적</dt>
                <dd>입력·출력·참조 문서·근거 조항·신뢰도·이관 결과 기록</dd>
              </div>
            </dl>
          </section>

          <section style={{ order: 20 }} hidden={!activeSections.includes(9)}>
            <div className="ard-section-head">
              <span>10</span>
              <div>
                <b>제약 및 전제</b>
                <small>플랫폼·일정·조직 제약</small>
              </div>
            </div>
            <ul className="ard-bullets">
              <li>사내 승인 Agent 플랫폼과 읽기 전용 문서 색인을 사용</li>
              <li>2026년 9월 파일럿, 경영지원팀 규정 담당자 참여 필수</li>
              <li>결재·비용 시스템 실행 연동은 이번 범위에서 제외</li>
            </ul>
          </section>
        </div>
        {!completed && (
          <footer>
            <button
              disabled={reworkMode && !reworkReady}
              onClick={() => {
                setCompleted(true);
                if (reworkMode) onReworkSubmit?.();
              }}
            >
              {reworkMode ? "보완 완료 · G2 재상신" : "작성 완료 및 G2 승인 요청"}{" "}
              <ArrowRight size={14} weight="bold" />
            </button>
          </footer>
        )}
      </section>

      {!completed && (
        <aside className="intake-chat" aria-label="요구 정의 대화 이어쓰기">
          <header>
            <span className="brand-mark">AX</span>
            <div>
              <strong>요구 접수 Agent</strong>
              <small>요구 정의 모드 · ARD 8/10 작성</small>
            </div>
          </header>
          <div className="chat-progress">
            <span style={{ width: "80%" }} />
          </div>
          <div className="intake-chat-history">
            {definitionMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`chat-message ${message.role}`}
              >
                <small>
                  {message.role === "agent" ? "요구 접수 Agent" : "나"}
                </small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="quick-answers">
            <button onClick={() => setInput("형식 준수율 95% 이상")}>
              형식 준수율 95%
            </button>
            <button
              onClick={() => setInput("목표값은 오너와 협의가 필요합니다")}
            >
              오너와 협의 필요
            </button>
          </div>
          <footer>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendDefinitionAnswer();
              }}
              placeholder="답변을 입력하세요"
              aria-label="요구 정의 답변"
            />
            <button onClick={sendDefinitionAnswer} aria-label="답변 보내기">
              <ArrowRight size={16} weight="bold" />
            </button>
          </footer>
        </aside>
      )}
    </div>
  );
}

function GateDetailDialog({
  gate,
  projectNo,
  mode,
  rejected,
  onClose,
}: {
  gate: "G1" | "G2";
  projectNo: string;
  mode: "evidence" | "ard";
  rejected: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const isG1 = gate === "G1";
  const evidence = isG1
    ? [
        ["승인 기준 문서", `${projectNo}-FEA · v1.0`],
        ["타당성 판정", "Go · 중 트랙 · 혼합형 Agent"],
        [
          "대안 검토",
          "프로세스·기존 시스템·매크로·단순 LLM 대안 4건 검토 완료",
        ],
        [
          "핵심 조건",
          "승인 규정만 사용 · 근거 조항 표시 · 저신뢰 답변 담당자 이관",
        ],
      ]
    : [
        [
          "승인 기준 문서",
          `${projectNo}-ARD · ${rejected ? "v0.8 보완 중" : "v1.0"}`,
        ],
        ["확인 범위", "자율성 · 성공 기준 · Out of Scope · 실패 시나리오"],
        [
          "개발 조건",
          "G1 담당자 배정 · 요구자·개발 담당자·AI활성화팀장 3자 승인 · 프로젝트 마감일 확정",
        ],
        [
          "판정",
          rejected
            ? "보완·수정 요청 · ARD 보완 후 3자 재검토"
            : "3자 승인 완료 · 설계·개발 착수 가능",
        ],
      ];
  const ardItems = [
    [
      "03 To-Be · In/Out Scope",
      "보완 중",
      "G1 승인 범위 안에서 규정 안내·기안 초안까지만 포함하고 제출·승인 실행은 제외합니다.",
    ],
    [
      "07 성공·평가 기준",
      "보완 중",
      "정답 라벨 책임자를 경영지원팀 규정 담당자로 지정하고 정확도 90%, 근거 제시율 100%를 적용합니다.",
    ],
    [
      "08 실패 시나리오",
      "보완 완료",
      "저신뢰 답변은 확정하지 않고 담당자에게 이관하며, 범위 밖 요청은 거절 사유와 문의처를 제공합니다.",
    ],
  ];
  return (
    <div className="gate-detail-backdrop" onMouseDown={onClose}>
      <section
        className="gate-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Pill tone={rejected ? "orange" : "green"}>
              {mode === "ard" ? "ARD 보완" : `${gate} 승인 근거`}
            </Pill>
            <small>{projectNo} · GOVERNANCE RECORD</small>
            <h2 id="gate-detail-title">
              {mode === "ard"
                ? "보완 중인 에이전트 요구사항 정의서[ARD]"
                : `${isG1 ? "착수" : "개발 착수"} 승인 근거`}
            </h2>
          </div>
          <button
            aria-label={mode === "ard" ? "보완 중인 ARD 닫기" : "승인 근거 닫기"}
            onClick={onClose}
          >
            <X size={18} weight="bold" />
          </button>
        </header>
        {mode === "evidence" ? (
          <>
            <div className="gate-detail-evidence">
              {evidence.map(([label, value], index) => (
                <article key={label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{label}</small>
                    <b>{value}</b>
                  </div>
                </article>
              ))}
            </div>
            <section className="gate-detail-decision">
              <CheckCircle size={22} weight="fill" />
              <div>
                <b>
                  {rejected
                    ? "현재 게이트는 통과되지 않았습니다."
                    : "승인 근거와 서명이 모두 연결되어 있습니다."}
                </b>
                <p>
                  {rejected
                    ? "반려 사유가 해소되고 모든 담당자가 승인해야 다음 단계로 이동합니다."
                    : "문서 버전, 판정, 승인자와 처리 일시는 변경 이력에 보존됩니다."}
                </p>
              </div>
            </section>
          </>
        ) : (
          <div className="gate-ard-revision">
            {ardItems.map(([title, status, detail]) => (
              <article key={title}>
                <div>
                  <b>{title}</b>
                  <Pill tone={status === "보완 완료" ? "green" : "orange"}>
                    {status}
                  </Pill>
                </div>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        )}
        <footer>
          <span>
            {mode === "ard"
              ? "자동 저장 · Owner 재검토 전"
              : "감사 추적 기록 · 수정 불가"}
          </span>
          <button className="primary" onClick={onClose}>
            확인
          </button>
        </footer>
      </section>
    </div>
  );
}

function GateApprovalResult({
  gate,
  projectNo,
  role,
  notify,
  onG1Resolved,
  onStartArdRework,
  initialG1Resolution,
  g2ReworkSubmitted = false,
  basisReady = true,
  homeEmbedded = false,
}: {
  gate: "G1" | "G2";
  projectNo: string;
  role: string;
  notify: (message: string) => void;
  onG1Resolved?: (
    decision: "GO" | "CONDITIONAL" | "DROP",
    assignee: string,
    reason: string,
  ) => void;
  onStartArdRework?: () => void;
  initialG1Resolution?: {
    decision: "GO" | "CONDITIONAL" | "DROP";
    assignee: string;
    reason: string;
  } | null;
  g2ReworkSubmitted?: boolean;
  basisReady?: boolean;
  homeEmbedded?: boolean;
}) {
  const isG1 = gate === "G1";
  const isRejectedCase = projectNo === "2026-028" && gate === "G2";
  const isReworkRound = isRejectedCase && g2ReworkSubmitted;
  const isLeader = role === "AI활성화팀 최병두 팀장";
  const isMember = role.includes("AI활성화팀") && role.includes("담당자");
  const isRequester = role === "일반 User";
  const canActOnG2 = isRequester || isMember || isLeader;
  const isCompletedG2 = projectNo === "2026-021" && gate === "G2";
  const [detailMode, setDetailMode] = useState<"evidence" | "ard" | null>(null);
  const project =
    [...memberAdditionalProjects, ...userProjects].find(
      (item) => item.no === projectNo,
    ) || userProjects[0];
  const [g1Decision, setG1Decision] = useState<
    "PENDING" | "GO" | "CONDITIONAL" | "DROP"
  >(
    initialG1Resolution?.decision ||
      (["2026-031", "2026-033"].includes(projectNo) ? "PENDING" : "GO"),
  );
  const [g1DraftDecision, setG1DraftDecision] = useState<
    "PENDING" | "GO" | "CONDITIONAL" | "DROP"
  >("PENDING");
  const [g1Assignee, setG1Assignee] = useState(
    initialG1Resolution?.assignee ||
      (["2026-031", "2026-033"].includes(projectNo)
        ? "미배정"
        : project.teamOwner.replace("AI활성화팀 ", "").replace(" 담당자", "")),
  );
  const [g1Reason, setG1Reason] = useState(initialG1Resolution?.reason || "");
  const [myG2Vote, setMyG2Vote] = useState<"PENDING" | "APPROVED" | "REWORK">(
    "PENDING",
  );
  const [g2Reason, setG2Reason] = useState("");
  const [deadlineChangeOpen, setDeadlineChangeOpen] = useState(false);
  const [proposedDeadline, setProposedDeadline] = useState(
    project.committedDate.includes("G2") ? "" : project.committedDate,
  );
  const [deadlineReason, setDeadlineReason] = useState("");
  const [deadlineRequestSent, setDeadlineRequestSent] = useState(false);
  const approvers = isG1
    ? [
        {
          role: "FEA 작성 담당",
          name: "AI활성화팀 허정환",
          status: basisReady ? "작성 완료" : "작성 중",
          date: basisReady ? "2026.08.22" : "v0.8 · 자동 저장",
        },
        {
          role: "G1 승인자",
          name: "최병두 팀장",
          status:
            g1Decision === "PENDING"
              ? "대기"
              : g1Decision === "DROP"
                ? "반려"
                : "승인",
          date: g1Decision === "PENDING" ? "판정 전" : "2026.08.24",
        },
        {
          role: "개발 담당",
          name: g1Assignee,
          status:
            g1Decision === "PENDING" || g1Assignee === "미배정"
              ? "대기"
              : "배정",
          date: g1Decision === "PENDING" ? "G1에서 지정" : "G1 승인 시 배정",
        },
      ]
    : isReworkRound
      ? [
          {
            role: "요구자",
            name: "김현우",
            status: isRequester
              ? myG2Vote === "REWORK"
                ? "반려"
                : myG2Vote === "APPROVED"
                  ? "승인"
                  : "대기"
              : "대기",
            date: isRequester ? "내 재검토" : "재상신 후 재검토",
            reason:
              myG2Vote === "REWORK" && isRequester ? g2Reason : undefined,
          },
          {
            role: "개발 담당자",
            name: "허정환",
            status: isMember
              ? myG2Vote === "REWORK"
                ? "반려"
                : myG2Vote === "APPROVED"
                  ? "승인"
                  : "대기"
              : "대기",
            date: isMember ? "내 재검토" : "재상신 후 재검토",
            reason: myG2Vote === "REWORK" && isMember ? g2Reason : undefined,
          },
          {
            role: "AI 활성화팀장",
            name: "최병두",
            status: isLeader
              ? myG2Vote === "REWORK"
                ? "반려"
                : myG2Vote === "APPROVED"
                  ? "승인"
                  : "대기"
              : "대기",
            date: isLeader ? "내 재검토" : "재상신 후 재검토",
            reason: myG2Vote === "REWORK" && isLeader ? g2Reason : undefined,
          },
        ]
      : isRejectedCase && myG2Vote === "PENDING"
      ? [
          {
            role: "요구자",
            name: "김현우",
            status: "승인",
            date: "2026.08.25",
          },
          {
            role: "개발 담당자",
            name: "허정환",
            status: "반려",
            date: "2026.08.25",
            reason:
              "Out of Scope와 평가셋 정답 라벨 책임자를 명확히 한 뒤 다시 검토해야 합니다.",
          },
          {
            role: "AI 활성화팀장",
            name: "최병두",
            status: "대기",
            date: "보완 확인 후",
          },
        ]
      : [
          {
            role: "요구자",
            name: projectNo === "2026-021" ? "정수빈" : "김현우",
            status: isCompletedG2
              ? "승인"
              : isRequester
                ? myG2Vote === "REWORK"
                  ? "반려"
                  : myG2Vote === "APPROVED"
                    ? "승인"
                    : "대기"
                : "승인",
            date: isCompletedG2 ? "2026.08.25" : isRequester ? "내 검토" : "2026.08.25",
            reason: myG2Vote === "REWORK" && isRequester ? g2Reason : undefined,
          },
          {
            role: "개발 담당자",
            name: project.teamOwner.includes("배정 대기")
              ? "미배정"
              : project.teamOwner
                  .replace("AI활성화팀 ", "")
                  .replace(" 담당자", ""),
            status: isCompletedG2
              ? "승인"
              : isMember
                ? myG2Vote === "REWORK"
                  ? "반려"
                  : myG2Vote === "APPROVED"
                    ? "승인"
                    : "대기"
                : projectNo === "2026-026"
                  ? "승인"
                  : "대기",
            date: isCompletedG2 ? "2026.08.25" : isMember ? "내 검토" : "승인 전",
            reason: myG2Vote === "REWORK" && isMember ? g2Reason : undefined,
          },
          {
            role: "AI 활성화팀장",
            name: "최병두",
            status: isCompletedG2
              ? "승인"
              : isLeader
                ? myG2Vote === "REWORK"
                  ? "반려"
                  : myG2Vote === "APPROVED"
                    ? "승인"
                    : "대기"
                : "대기",
            date: isCompletedG2 ? "2026.08.26" : isLeader ? "내 검토" : "선행 승인 후",
            reason: myG2Vote === "REWORK" && isLeader ? g2Reason : undefined,
          },
        ];
  const rejected = approvers.some((item) => item.status === "반려");
  const g2Complete = !isG1 && approvers.every((item) => item.status === "승인");
  const myApproverRole = isRequester
    ? "요구자"
    : isMember
      ? "개발 담당자"
      : "AI 활성화팀장";
  const myApprovalPending = approvers.some(
    (item) => item.role === myApproverRole && item.status === "대기",
  );
  const g1StatusLabel =
    g1Decision === "PENDING"
      ? "판정 대기"
      : g1Decision === "CONDITIONAL"
        ? "Conditional Go"
        : g1Decision === "DROP"
          ? "Drop"
          : "Go";
  const gatePending = isG1
    ? g1Decision === "PENDING" || !basisReady
    : !rejected && !g2Complete;
  const showLeaderDecisionOnly =
    homeEmbedded &&
    isG1 &&
    isLeader &&
    basisReady &&
    g1Decision === "PENDING";
  return (
    <>
      <section
        className={`gate-approval-result ${homeEmbedded ? "home-gate-result" : ""} ${showLeaderDecisionOnly ? "decision-only" : ""} ${rejected ? "rejected" : gatePending ? "pending" : "approved"}`}
        aria-label={`${gate} 승인 기록`}
      >
        {!showLeaderDecisionOnly && (
          <>
            <header>
              <div>
                <small>
                  {projectNo} · {gate} GATE
                </small>
                <h3>{isG1 ? "착수 승인" : "개발 착수 승인"}</h3>
                <p>
                  {isG1
                    ? "완성된 타당성 평가서[FEA]를 근거로 팀장이 추진 여부와 개발 담당자를 결정합니다."
                    : "요구자·개발 담당자·AI활성화팀장이 완성된 ARD를 각각 검토하고 승인합니다."}
                </p>
              </div>
              <Pill tone={rejected ? "red" : gatePending ? "orange" : "green"}>
                {rejected
                  ? "보완 · 수정 요청"
                  : !basisReady
                    ? "FEA 작성 완료 대기"
                    : gatePending
                      ? isG1
                        ? "팀장 판정 대기"
                        : isReworkRound
                          ? "G2 재검토 진행 중"
                          : "승인 진행 중"
                      : homeEmbedded && isG1
                        ? "팀장 승인 완료"
                        : "게이트 통과"}
              </Pill>
            </header>
            <div className="gate-basis">
              <div>
                <small>승인 기준 문서</small>
                <b>
                  {projectNo}-{isG1 ? "FEA" : "ARD"}
                </b>
                <span>
                  {rejected
                    ? "보완 요청 반영 중 · v0.8"
                    : !basisReady
                      ? "작성 중 · v0.8"
                      : isReworkRound
                        ? "보완 완료 · v0.9 · 재상신"
                      : "작성 완료 · v1.0"}
                </span>
              </div>
              <ArrowRight size={18} weight="bold" />
              <div>
                <small>게이트 결과</small>
                <b>
                  {rejected
                    ? "통과 불가"
                    : !basisReady
                      ? "선행 단계 필요"
                      : gatePending
                        ? isG1
                          ? "판정 전"
                          : `${approvers.filter((item) => item.status === "승인").length}/3 승인`
                        : isG1
                          ? g1StatusLabel
                          : "3자 승인 완료"}
                </b>
                <span>
                  {rejected
                    ? "세 명 모두 승인해야 진행할 수 있습니다"
                    : !basisReady
                      ? "FEA 작성 완료 후 팀장 판정이 열립니다"
                      : gatePending
                        ? isG1
                          ? "팀장 결정과 담당자 지정 필요"
                          : "세 명의 개별 검토가 모두 필요"
                        : "다음 단계 이동 가능"}
                </span>
              </div>
            </div>
            <div className="gate-approvers">
              {approvers.map((item) => {
                const positive = ["승인", "작성 완료", "배정"].includes(
                  item.status,
                );
                return (
                  <article
                    key={item.role}
                    className={
                      item.status === "반려"
                        ? "rejected"
                        : positive
                          ? "approved"
                          : "waiting"
                    }
                  >
                    <div>
                      <span>
                        {positive ? (
                          <Check size={13} weight="bold" />
                        ) : item.status === "반려" ? (
                          <X size={13} weight="bold" />
                        ) : (
                          "…"
                        )}
                      </span>
                      <div>
                        <small>{item.role}</small>
                        <b>{item.name}</b>
                        <em>{item.date}</em>
                      </div>
                      <Pill
                        tone={
                          positive
                            ? "green"
                            : item.status === "반려"
                              ? "red"
                              : "gray"
                        }
                      >
                        {item.status}
                      </Pill>
                    </div>
                    {item.reason && (
                      <p>
                        <b>보완·수정 사유</b>
                        {item.reason}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {!homeEmbedded && <section className="gate-schedule-card">
          <div>
            <span>
              <CalendarBlank size={17} weight="fill" />
            </span>
            <p>
              <small>요청 시 희망 완료일</small>
              <b>{project.requestedDate}</b>
            </p>
          </div>
          <div>
            <p>
              <small>확정 프로젝트 마감일</small>
              <b>{project.committedDate}</b>
            </p>
            <Pill
              tone={
                project.scheduleState.includes("지연")
                  ? "red"
                  : project.scheduleState.includes("협의")
                    ? "gray"
                    : "green"
              }
            >
              {project.scheduleState}
            </Pill>
          </div>
          <div
            className={`gate-decision-chip ${g1StatusLabel === "Go" ? "go" : g1StatusLabel === "Drop" ? "drop" : "pending"}`}
          >
            <small>G1 판정</small>
            <b>{g1StatusLabel}</b>
          </div>
          {!isG1 && (
            <button
              type="button"
              onClick={() => setDeadlineChangeOpen((value) => !value)}
            >
              {deadlineRequestSent ? "변경 승인 대기" : "마감 일정 변경 요청"}
            </button>
          )}
        </section>}
        {deadlineChangeOpen && !isG1 && (
          <section className="deadline-change-form">
            <header>
              <div>
                <b>마감 일정 변경 요청</b>
                <p>변경은 최병두 팀장의 승인 후에만 확정됩니다.</p>
              </div>
              <Pill tone={deadlineRequestSent ? "orange" : "gray"}>
                {deadlineRequestSent ? "팀장 승인 대기" : "요청 작성"}
              </Pill>
            </header>
            <div>
              <label>
                변경 희망일
                <input
                  type="date"
                  value={proposedDeadline}
                  onChange={(event) => setProposedDeadline(event.target.value)}
                  disabled={deadlineRequestSent}
                />
              </label>
              <label>
                변경 사유
                <textarea
                  value={deadlineReason}
                  onChange={(event) => setDeadlineReason(event.target.value)}
                  placeholder="지연 원인과 변경이 필요한 이유를 적어주세요."
                  disabled={deadlineRequestSent}
                />
              </label>
            </div>
            <button
              className="primary"
              disabled={
                deadlineRequestSent ||
                !proposedDeadline ||
                !deadlineReason.trim()
              }
              onClick={() => setDeadlineRequestSent(true)}
            >
              {deadlineRequestSent
                ? "최병두 팀장 승인 대기 중"
                : "일정 변경 승인 요청"}
            </button>
          </section>
        )}
        {isG1 && isLeader && basisReady && g1Decision === "PENDING" && (
          <section className="g1-leader-decision">
            <header>
              <div>
                <Pill tone="violet">팀장 액션</Pill>
                <h4>추진 여부와 개발 담당자 지정</h4>
                <p>FEA의 판정 영역에도 동일한 결과가 자동 업데이트됩니다.</p>
              </div>
            </header>
            <div className="g1-choice-row">
              {(["GO", "CONDITIONAL", "DROP"] as const).map((item) => (
                <button
                  key={item}
                  className={
                    g1DraftDecision === item
                      ? `selected ${item.toLowerCase()}`
                      : ""
                  }
                  onClick={() => setG1DraftDecision(item)}
                >
                  <b>
                    {item === "CONDITIONAL"
                      ? "Conditional Go"
                      : item === "DROP"
                        ? "Drop"
                        : "Go"}
                  </b>
                  <small>
                    {item === "GO"
                      ? "요구 정의 진행"
                      : item === "CONDITIONAL"
                        ? "조건 보완 후 진행"
                        : "대안 안내·종료"}
                  </small>
                </button>
              ))}
            </div>
            <div className="g1-decision-fields">
              <label>
                AI활성화팀 개발 담당자
                <select
                  value={g1Assignee}
                  disabled={
                    g1DraftDecision === "DROP" || g1DraftDecision === "PENDING"
                  }
                  onChange={(event) => setG1Assignee(event.target.value)}
                >
                  <option>미배정</option>
                  <option>허정환</option>
                  <option>이재승</option>
                  <option>김서연</option>
                </select>
              </label>
              <label>
                판정 사유·조건
                <textarea
                  value={g1Reason}
                  onChange={(event) => setG1Reason(event.target.value)}
                  placeholder="FEA 근거와 추진 조건 또는 Drop 대안을 기록하세요."
                />
              </label>
            </div>
            <button
              className="primary"
              disabled={
                g1DraftDecision === "PENDING" ||
                !g1Reason.trim() ||
                (g1DraftDecision !== "DROP" && g1Assignee === "미배정")
              }
              onClick={() => {
                if (g1DraftDecision === "PENDING") return;
                setG1Decision(g1DraftDecision);
                onG1Resolved?.(
                  g1DraftDecision,
                  g1DraftDecision === "DROP" ? "미배정" : g1Assignee,
                  g1Reason,
                );
                notify(
                  `${g1DraftDecision === "CONDITIONAL" ? "Conditional Go" : g1DraftDecision === "DROP" ? "Drop" : "Go"} 판정과 개발 담당자 ${g1DraftDecision === "DROP" ? "미배정" : g1Assignee} 기록이 FEA와 G1에 반영되었습니다.`,
                );
              }}
            >
              G1 판정 확정 · FEA 업데이트
            </button>
          </section>
        )}
        {isG1 && isLeader && !basisReady && (
          <section className="gate-role-readonly">
            <Info size={17} weight="fill" />
            <p>
              <b>FEA가 아직 작성 중입니다.</b>
              <span>
                담당자가 FEA를 완료해 G1로 상신하면 팀장의 Go / Conditional Go /
                Drop 판정과 개발 담당자 지정 기능이 활성화됩니다.
              </span>
            </p>
          </section>
        )}
        {isG1 && isMember && (
          <section className="gate-role-readonly member-g1-role">
            <Info size={17} weight="fill" />
            <p>
              <b>
                {basisReady
                  ? "FEA 상신이 완료되어 팀장 판정을 기다리고 있습니다."
                  : "AI 활성화팀 담당자는 FEA 작성·보완을 담당합니다."}
              </b>
              <span>
                {basisReady
                  ? "팀원은 최종 FEA와 승인 진행 상태, 판정 후 개발 담당자 배정 결과를 조회합니다. Go / Conditional Go / Drop 결정과 개발 담당자 지정은 최병두 팀장만 수행합니다."
                  : "요구자 인터뷰를 바탕으로 대안 검토·적합성·ROI·트랙 근거를 완성해 G1에 상신합니다. G1 승인과 개발 담당자 지정 권한은 팀장에게 있습니다."}
              </span>
            </p>
          </section>
        )}
        {!isG1 && canActOnG2 && !rejected && myApprovalPending && (
          <section className="g2-role-action">
            <header>
              <div>
                <Pill tone={isLeader ? "violet" : "gray"}>내 승인 차례</Pill>
                <h4>
                  {isLeader
                    ? "AI활성화팀장"
                    : isMember
                      ? "개발 담당자"
                      : "요구자"}{" "}
                  검토
                </h4>
                <p>
                  세 명 중 한 명이라도 보완을 요청하면 ARD 수정 후 세 명 모두
                  다시 확인합니다.
                </p>
              </div>
            </header>
            <textarea
              value={g2Reason}
              onChange={(event) => setG2Reason(event.target.value)}
              placeholder="보완·수정이 필요할 때 구체적인 사유를 입력하세요."
            />
            <div>
              <button
                disabled={!g2Reason.trim()}
                onClick={() => {
                  setMyG2Vote("REWORK");
                  notify("ARD 보완·수정 요청이 기록되었습니다.");
                }}
              >
                보완·수정 요청
              </button>
              <button
                className="primary"
                onClick={() => {
                  setMyG2Vote("APPROVED");
                  notify(
                    `${isLeader ? "AI활성화팀장" : isMember ? "개발 담당자" : "요구자"} 승인이 기록되었습니다.`,
                  );
                }}
              >
                이 내용으로 개발 착수 승인
              </button>
            </div>
          </section>
        )}
        {!isG1 && rejected && (
          <section className="gate-role-readonly rework-lock">
            <Info size={17} weight="fill" />
            <p>
              <b>이 승인 라운드는 보완 요청으로 종료되었습니다.</b>
              <span>
                ARD가 수정·재상신된 뒤 새 승인 라운드가 열립니다. 기존 승인자는
                지금 다시 승인할 수 없습니다.
              </span>
            </p>
          </section>
        )}
        {!isG1 && isReworkRound && !g2Complete && (
          <section className="gate-role-readonly g2-rework-round">
            <CheckCircle size={18} weight="fill" />
            <p>
              <b>ARD v0.9가 보완 완료되어 새 G2 승인 라운드가 열렸습니다.</b>
              <span>
                이전 반려 기록은 이력에 보존됩니다. 요구자·개발 담당자·AI
                활성화팀장이 보완본을 각각 다시 검토해야 합니다.
              </span>
            </p>
          </section>
        )}
        <footer>
          <div>
            <small>처리 경로</small>
            <b>
              {rejected
                ? "반려 → ARD 보완 → 동일 G2 재검토"
                : isG1
                  ? "G1 통과 → 요구 정의 단계 이동"
                  : "G2 통과 → 설계·개발·평가 단계 이동"}
            </b>
          </div>
          <div className="gate-footer-actions">
            {rejected && (
              <button type="button" onClick={() => setDetailMode("evidence")}>
                승인 근거 보기
                <ArrowRight size={13} weight="bold" />
              </button>
            )}
            <button
              type="button"
              className={
                rejected && (isMember || isRequester) ? "primary" : undefined
              }
              onClick={() => {
                if (rejected && (isMember || isRequester) && onStartArdRework) {
                  onStartArdRework();
                  return;
                }
                setDetailMode(rejected ? "ard" : "evidence");
              }}
            >
              {rejected
                ? isMember || isRequester
                  ? "ARD 보완하기"
                  : "보완 중인 ARD 보기"
                : "승인 근거 보기"}
              <ArrowRight size={13} weight="bold" />
            </button>
          </div>
        </footer>
      </section>
      {detailMode && (
        <GateDetailDialog
          gate={gate}
          projectNo={projectNo}
          mode={detailMode}
          rejected={rejected}
          onClose={() => setDetailMode(null)}
        />
      )}
    </>
  );
}

function PilotReleaseDocumentsDialog({
  document,
  projectNo,
  onSelect,
  onClose,
}: {
  document: "DEP" | "UG";
  projectNo: string;
  onSelect: (document: "DEP" | "UG") => void;
  onClose: () => void;
}) {
  const [checkedItems, setCheckedItems] = useState(() => [
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
  ]);
  const [decision, setDecision] = useState("확산 승인");
  const checkedCount = checkedItems.filter(Boolean).length;
  const checklist = [
    ["평가 결과 보고서(EVR) 승인 완료", `${projectNo}-EVR · G3 승인 완료`],
    ["ARD의 성공 기준 전 항목 통과 확인", "정확도·안전성·형식 준수율 통과"],
    ["금칙 위반 0건 확인", "적대 케이스 포함 전체 평가셋 기준"],
    ["보안 검토 완료", "중 트랙 · 플랫폼 보안 검토 완료"],
    ["지식 기준일 및 한계 고지 적용", "첫 화면과 답변 하단에 2026.08.20 표기"],
    [
      "로그 기록 정상 작동 확인",
      "입력·출력·근거·사용자·시각 테스트 로그 3건 조회",
    ],
    ["사용자 가이드(UG) 작성 완료", `${projectNo}-UG · v1.0`],
    [
      "비상 연락 체계 및 롤백 방법 확정",
      "장애 연락망과 즉시 중단 절차 확인 필요",
    ],
    ["지식 갱신 담당자에게 절차 전달", "품질혁신팀 규정 담당자 인수 확인 필요"],
  ];

  return (
    <div
      className="release-document-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pilot-release-document-title"
    >
      <button
        className="release-document-scrim"
        aria-label="파일럿 문서 배경 닫기"
        onClick={onClose}
      />
      <section className="release-document-sheet">
        <header>
          <div>
            <small>{projectNo} · RELEASE &amp; PILOT DOCUMENTS</small>
            <h2 id="pilot-release-document-title">
              {document === "DEP"
                ? "배포 체크리스트[DEP]"
                : "사용자 가이드[UG]"}
            </h2>
            <p>
              {document === "DEP"
                ? "배포 전 누락을 방지하고 파일럿·확산 판단 근거를 기록합니다."
                : "Agent의 범위와 한계, 사용법과 오류 신고 경로를 한 번에 확인합니다."}
            </p>
          </div>
          <button aria-label="파일럿 문서 창 닫기" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </header>
        <nav aria-label="배포 문서 선택">
          <button
            className={document === "DEP" ? "active" : ""}
            onClick={() => onSelect("DEP")}
          >
            <span>⑥-1</span>
            <b>배포 체크리스트[DEP]</b>
          </button>
          <button
            className={document === "UG" ? "active" : ""}
            onClick={() => onSelect("UG")}
          >
            <span>⑥-2</span>
            <b>사용자 가이드[UG]</b>
          </button>
        </nav>
        <div className="release-document-body">
          {document === "DEP" ? (
            <div className="dep-document">
              <section>
                <div className="release-section-title">
                  <span>A</span>
                  <div>
                    <h3>배포 전 필수 확인</h3>
                    <p>
                      하나라도 확인되지 않으면 배포 승인을 진행할 수 없습니다.
                    </p>
                  </div>
                  <Pill
                    tone={
                      checkedCount === checklist.length ? "green" : "orange"
                    }
                  >
                    {checkedCount} / {checklist.length} 확인
                  </Pill>
                </div>
                <div className="dep-checklist">
                  {checklist.map(([label, note], index) => (
                    <label key={label}>
                      <input
                        type="checkbox"
                        checked={checkedItems[index]}
                        onChange={() =>
                          setCheckedItems((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index ? !item : item,
                            ),
                          )
                        }
                      />
                      <span>
                        <b>{label}</b>
                        <small>{note}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <div className="release-section-title">
                  <span>B</span>
                  <div>
                    <h3>배포 방식</h3>
                    <p>파일럿 대상과 종료 기준, 확산 계획을 기록합니다.</p>
                  </div>
                </div>
                <dl className="release-facts">
                  <div>
                    <dt>파일럿</dt>
                    <dd>
                      품질혁신팀 25명 · 2주 · Teams 설문과 Portal 오류 신고로
                      피드백 수집
                    </dd>
                  </div>
                  <div>
                    <dt>파일럿 종료 판정 기준</dt>
                    <dd>
                      사용률 80% 이상 · 만족도 4.0 이상 · 치명 오류 0건 · 일반
                      오류 3건 이하
                    </dd>
                  </div>
                  <div>
                    <dt>확산</dt>
                    <dd>
                      사내 게시판 공지 · 팀별 30분 교육 · 2026.09.15 전사 공개
                      목표
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <div className="release-section-title">
                  <span>C</span>
                  <div>
                    <h3>파일럿 결과 · G4 게이트</h3>
                    <p>실사용 결과를 근거로 확산 여부를 판단합니다.</p>
                  </div>
                  <Pill tone="green">확산 권고</Pill>
                </div>
                <div className="pilot-result-grid">
                  <article>
                    <small>사용 건수</small>
                    <b>486건</b>
                  </article>
                  <article>
                    <small>오류 신고</small>
                    <b>1건 · 조치 완료</b>
                  </article>
                  <article>
                    <small>만족도</small>
                    <b>4.6 / 5.0</b>
                  </article>
                  <article>
                    <small>주요 피드백</small>
                    <b>근거 링크가 유용함</b>
                  </article>
                </div>
                <div className="release-decision-row">
                  {["확산 승인", "파일럿 연장", "회수 후 개선"].map((item) => (
                    <label key={item}>
                      <input
                        type="radio"
                        name="pilot-release-decision"
                        checked={decision === item}
                        onChange={() => setDecision(item)}
                      />{" "}
                      {item}
                    </label>
                  ))}
                  <span>승인자: 박정민 팀장 · 최병두 팀장 / 2026.09.12</span>
                </div>
              </section>
            </div>
          ) : (
            <div className="ug-document">
              <section>
                <span>01</span>
                <div>
                  <h3>이 Agent는 무엇을 해주나요?</h3>
                  <p>
                    생산 품질 이슈를 요약하고 승인된 규정과 과거 사례를 검색해
                    가능한 원인과 조치 초안을 제안합니다. 답변마다 근거와 출처를
                    표시하며, 불확실한 경우 품질 담당자에게 이관합니다.
                  </p>
                </div>
              </section>
              <section>
                <span>02</span>
                <div>
                  <h3>이런 건 못 해요 / 하지 않아요</h3>
                  <ul>
                    <li>최종 품질 판정이나 출하 여부를 확정하지 않습니다.</li>
                    <li>
                      SAP·MES 데이터를 수정하거나 조치를 자동 실행하지 않습니다.
                    </li>
                    <li>
                      승인되지 않은 규정과 개인 경험을 사실처럼 만들지 않습니다.
                    </li>
                    <li>
                      근거가 없거나 민감한 예외를 임의로 판단하지 않습니다.
                    </li>
                  </ul>
                </div>
              </section>
              <section>
                <span>03</span>
                <div>
                  <h3>이렇게 사용하세요</h3>
                  <ol className="ug-steps">
                    <li>
                      <b>1</b>
                      <p>
                        Agent Portal 또는 Teams에서 생산 품질 이슈 분석 Agent를
                        엽니다.
                      </p>
                    </li>
                    <li>
                      <b>2</b>
                      <p>
                        제품·공정·현상·발생 시점과 확인한 데이터를 입력합니다.
                      </p>
                    </li>
                    <li>
                      <b>3</b>
                      <p>
                        제안된 원인, 근거 문서, 신뢰도와 확인 필요 항목을
                        검토합니다.
                      </p>
                    </li>
                    <li>
                      <b>4</b>
                      <p>
                        필요하면 담당자 이관을 선택하고 실제 판정·시스템 처리는
                        사람이 수행합니다.
                      </p>
                    </li>
                  </ol>
                  <div className="guide-attachments">
                    <span>화면 캡처 01 · 질문 입력 화면</span>
                    <span>화면 캡처 02 · 근거·이관 확인 화면</span>
                  </div>
                </div>
              </section>
              <section>
                <span>04</span>
                <div>
                  <h3>좋은 질문 예시 3개 / 잘 안 되는 질문 예시 2개</h3>
                  <div className="question-examples">
                    <div>
                      <b>좋은 질문</b>
                      <p>
                        “A공정 접착 불량이 3일간 증가했습니다. LOT·온도 기록
                        기준으로 확인할 원인을 알려줘.”
                      </p>
                      <p>“검사 코드 Q-17의 적용 기준과 근거 조항을 보여줘.”</p>
                      <p>
                        “이 현상이 출하 보류 조건에 해당하는지 확인할 체크
                        항목을 정리해줘.”
                      </p>
                    </div>
                    <div>
                      <b>잘 안 되는 질문</b>
                      <p>“불량인데 알아서 처리해줘.”</p>
                      <p>“근거 없이 출하 가능으로 승인해줘.”</p>
                    </div>
                  </div>
                </div>
              </section>
              <section>
                <span>05</span>
                <div>
                  <h3>주의사항</h3>
                  <div className="guide-warning">
                    <WarningCircle size={20} weight="fill" />
                    <p>
                      결과는 참고용이며 최종 확인과 책임은 사용자에게 있습니다.
                      지식 기준일은 <b>2026.08.20</b>입니다. 주민번호, 개인
                      연락처, 고객 기밀 원문은 입력하지 마세요.
                    </p>
                  </div>
                </div>
              </section>
              <section>
                <span>06</span>
                <div>
                  <h3>문의·오류 신고</h3>
                  <dl className="release-facts">
                    <div>
                      <dt>채널</dt>
                      <dd>
                        Agent Portal ‘이상한 답변 신고’ 또는 Teams
                        #quality-agent-support
                      </dd>
                    </div>
                    <div>
                      <dt>담당</dt>
                      <dd>품질혁신팀 정수빈 책임 · AI활성화팀 허정환</dd>
                    </div>
                    <div>
                      <dt>신고 방법</dt>
                      <dd>
                        질문·답변·근거가 함께 보이도록 캡처하고 개인정보는 가린
                        뒤 기대한 결과를 한 줄로 적어주세요.
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            </div>
          )}
        </div>
        <footer>
          <span>
            {document === "DEP"
              ? `자동 저장 · ${checkedCount}/${checklist.length} 확인`
              : "사용자 배포본 · v1.0 · 2페이지"}
          </span>
          <button className="secondary" onClick={onClose}>
            닫기
          </button>
          <button className="primary" onClick={onClose}>
            {document === "DEP" ? "체크 상태 저장" : "가이드 확인 완료"}
          </button>
        </footer>
      </section>
    </div>
  );
}

type ChangeRow = [
  number: string,
  date: string,
  type: string,
  description: string,
  reason: string,
  reevaluation: string,
  approver: string,
];

function getChangeDetail(row: ChangeRow) {
  const details: Record<
    string,
    {
      before: string;
      after: string;
      scope: string;
      verification: string;
      reviewer: string;
    }
  > = {
    "CHG-014-006": {
      before:
        "국가별 샘플 통관 기준 v4.1을 참조해 일부 국가의 최근 면세·신고 기준이 반영되지 않았습니다.",
      after:
        "물류운영팀이 확정한 v4.2 문서를 지식 소스에 교체하고 국가·발효일·근거 조항 메타데이터를 함께 갱신했습니다.",
      scope:
        "국가별 통관 기준 검색, 샘플 발송 가능 여부 안내, 답변의 근거 링크",
      verification:
        "평가셋 v1.4 전체 52건 회귀 평가 · 정확도 96.2% · 금칙 위반 0건",
      reviewer: "지식 갱신 담당 이수민 확인 · 운영 담당 김지훈 교차 검토",
    },
    "CHG-014-005": {
      before:
        "배송 지연 안내에 예상 일정만 표시되어 사용자가 산정 근거와 기준 시점을 확인하기 어려웠습니다.",
      after:
        "예상 일정과 함께 조회 시각, 택배사 상태, 기준 데이터 링크를 표시하도록 응답 지침을 보완했습니다.",
      scope: "배송 지연 안내 프롬프트, 사용자 응답 형식, 근거 표시 항목",
      verification:
        "오류 신고 사례를 포함한 평가셋 45건 회귀 평가 · 형식 준수율 100% · 종합 95.6%",
      reviewer: "동료 리뷰어 박서연 검토 · 사용자 신고 재현 테스트 완료",
    },
    "CHG-014-004": {
      before:
        "택배사 조회 API가 일시 지연되면 빈 응답을 반환하고 사용자가 다시 질문해야 했습니다.",
      after:
        "3초 간격 최대 2회 재시도와 실패 시 담당자 안내를 추가하고 빈 응답 대신 상태 메시지를 표시합니다.",
      scope: "택배사 조회 도구, 실패 예외 처리, 사용자 안내 메시지",
      verification:
        "정상·지연·타임아웃 30건 재평가 · 도구 호출 성공률 98.0% · 회귀 오류 0건",
      reviewer: "개발 리뷰어 허정환 코드 검토 · 운영 담당 박서연 시나리오 확인",
    },
    "CHG-014-003": {
      before: "입력·출력·판단근거 운영 로그를 6개월간 보관했습니다.",
      after:
        "감사 추적 요구에 맞춰 보관 기간을 1년으로 연장하고 열람 권한을 운영 담당과 감사 담당으로 제한했습니다.",
      scope: "운영 로그 저장 정책, 열람 권한, 자동 파기 일정",
      verification:
        "보안·권한·파기 시나리오 18건 검증 · 정책 준수율 100% · 종합 94.8%",
      reviewer: "정보보호 검토 완료 · AI활성화팀장 최종 확인",
    },
  };
  const fallbackByType: Record<string, { before: string; scope: string }> = {
    지식: {
      before:
        "직전 승인 버전의 지식 문서와 메타데이터가 운영 색인에 적용되어 있었습니다.",
      scope:
        "참조 문서 버전, 검색 색인, 근거 링크, 지식 기준일과 관련 회귀 평가셋",
    },
    프롬프트: {
      before:
        "직전 승인 프롬프트는 신고된 예외 상황의 확인 질문과 근거 표시 조건을 포함하지 않았습니다.",
      scope:
        "시스템 지침, 출력 형식, 예외 처리, 금칙 매핑과 사용자 응답 화면",
    },
    도구: {
      before:
        "직전 승인 도구 설정은 해당 실패 상황에서 재시도 또는 담당자 이관을 수행하지 않았습니다.",
      scope: "도구 호출 권한, 실패 처리, 감사 로그와 사용자 상태 안내",
    },
    플랫폼: {
      before:
        "직전 승인 플랫폼 구성과 운영 정책이 적용되어 있었습니다.",
      scope: "실행 환경, 데이터 경계, 로그·권한 정책과 전체 회귀 평가",
    },
  };
  const fallback = fallbackByType[row[2]] ?? {
    before: `직전 승인된 ${row[2]} 설정이 운영 환경에 적용되어 있었습니다.`,
    scope: `${row[2]} 설정, 연관 산출물, 사용자 응답과 전체 회귀 평가`,
  };
  return (
    details[row[0]] ?? {
      before: fallback.before,
      after: row[3],
      scope: fallback.scope,
      verification: `${row[5]} · 보유 평가셋 전체 회귀 평가 완료`,
      reviewer: `${row[6]} 검토 및 승인`,
    }
  );
}

function ChangeDetailModal({
  row,
  agentName,
  onClose,
}: {
  row: ChangeRow;
  agentName: string;
  onClose: () => void;
}) {
  const detail = getChangeDetail(row);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="change-detail-backdrop" onMouseDown={onClose}>
      <section
        className="change-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Pill
              tone={
                row[2] === "지식"
                  ? "blue"
                  : row[2] === "프롬프트"
                    ? "violet"
                    : "gray"
              }
            >
              {row[2]} 변경
            </Pill>
            <small>
              {row[0]} · {row[1]}
            </small>
          </div>
          <button aria-label="개선 이력 상세 닫기" onClick={onClose}>
            <X size={19} weight="bold" />
          </button>
        </header>
        <div className="change-detail-title">
          <small>개선 이력서[CHG] 상세</small>
          <h2 id="change-detail-title">{row[3]}</h2>
          <p>{agentName}</p>
        </div>
        <dl className="change-detail-summary">
          <div>
            <dt>변경 사유</dt>
            <dd>{row[4]}</dd>
          </div>
          <div>
            <dt>재평가 결과</dt>
            <dd className="pass">
              <Check size={14} weight="bold" /> {row[5]}
            </dd>
          </div>
          <div>
            <dt>승인자</dt>
            <dd>{row[6]}</dd>
          </div>
        </dl>
        <div className="change-detail-sections">
          <section>
            <span>01</span>
            <div>
              <h3>변경 전</h3>
              <p>{detail.before}</p>
            </div>
          </section>
          <section>
            <span>02</span>
            <div>
              <h3>변경 내용</h3>
              <p>{detail.after}</p>
            </div>
          </section>
          <section>
            <span>03</span>
            <div>
              <h3>영향 범위</h3>
              <p>{detail.scope}</p>
            </div>
          </section>
          <section>
            <span>04</span>
            <div>
              <h3>재평가·검토 근거</h3>
              <p>{detail.verification}</p>
              <small>{detail.reviewer}</small>
            </div>
          </section>
        </div>
        <aside>
          <CheckCircle size={20} weight="fill" />
          <div>
            <b>재평가 통과 · 변경 승인 완료</b>
            <p>평가 결과와 승인 기록이 이 개선 이력에 연결되어 있습니다.</p>
          </div>
        </aside>
        <footer>
          <span>변경번호 {row[0]} · 감사 추적 기록</span>
          <button className="primary" onClick={onClose}>
            확인
          </button>
        </footer>
      </section>
    </div>
  );
}

function UserOperationsResult({
  project,
  openGallerySubmission,
}: {
  project: UserProject;
  openGallerySubmission: (draft: GalleryDraft) => void;
}) {
  const [document, setDocument] = useState<"OPS" | "CHG">("OPS");
  const [selectedChange, setSelectedChange] = useState<ChangeRow | null>(null);
  const isOperating = project.journeyStep >= 9;
  const isDelivery = project.no === "2026-021";
  const operational = isOperating
    ? {
        type: "규칙형",
        track: "하",
        autonomy: "L1",
        owner: "물류운영팀장",
        operator: "AI활성화팀 이민지",
        knowledge: "물류운영팀 이수민",
        deployed: "2026.09.01",
        status: "운영",
        checked: "2026.09.25",
        reevaluate: "2026.12.01",
        sessions: "486",
        users: "25명",
        trend: "+18.4%",
        errors: "1건 · 조치 완료",
        knowledgeState: "최신",
        knowledgeDate: "2026.08.21",
        score: "96.2% · Pass",
        decision: "정상 운영",
      }
    : {
        type: isDelivery ? "혼합형" : "미확정",
        track: isDelivery ? "중" : "–",
        autonomy: isDelivery ? "L0" : "–",
        owner: project.owner,
        operator: project.teamOwner,
        knowledge: isDelivery ? "품질혁신팀 정수빈" : "운영 전 지정",
        deployed: "운영 전",
        status: isDelivery ? "운영 인수 준비" : "문서 생성 전",
        checked: "–",
        reevaluate: "배포 후 확정",
        sessions: "–",
        users: "–",
        trend: "운영 전",
        errors: "운영 데이터 없음",
        knowledgeState: isDelivery ? "인수 준비" : "미점검",
        knowledgeDate: "–",
        score: "운영 후 분기 재평가",
        decision: "운영 전",
      };
  const changeRows: ChangeRow[] = isOperating
    ? [
        [
          "CHG-014-006",
          "2026.08.21",
          "지식",
          "국가별 샘플 통관 기준 v4.2 반영",
          "규정 개정",
          "96.2% · Pass",
          "물류운영팀장",
        ],
        [
          "CHG-014-005",
          "2026.08.07",
          "프롬프트",
          "배송 지연 안내에 예상 일정 근거 표기",
          "오류 신고",
          "95.6% · Pass",
          "AI활성화팀장",
        ],
        [
          "CHG-014-004",
          "2026.07.29",
          "도구",
          "택배사 조회 API 타임아웃 재시도 적용",
          "월간 점검",
          "98.0% · Pass",
          "개발 리뷰어",
        ],
      ]
    : [];

  if (!isOperating)
    return (
      <section
        className="user-operations-result upcoming"
        aria-label={`${project.name} 운영·개선 문서 생성 전`}
      >
        <header>
          <div>
            <small>OPS · CHG · {project.no}</small>
            <h3>운영 대장[OPS] · 개선 이력서[CHG]</h3>
            <p>
              G4 공동 승인 후 이 요청 과제의 운영 기록과 개선 이력이 자동
              생성됩니다.
            </p>
          </div>
          <Pill tone="gray">선행 단계 필요</Pill>
        </header>
        <div className="user-ops-stage-notice locked">
          <Info size={18} weight="fill" />
          <p>
            <b>
              {project.journeyStep === 8
                ? "G4 확산 승인 대기 중입니다."
                : "아직 운영 단계에 도달하지 않았습니다."}
            </b>
            <span>
              프로젝트 Owner와 AI활성화팀장의 G4 공동 승인 전에는 운영 대장과
              개선 이력을 조회하거나 등록할 수 없습니다.
            </span>
          </p>
        </div>
        <div className="user-ops-locked-preview" aria-hidden="true">
          <span>⑦-1 운영 대장[OPS]</span>
          <span>⑦-2 개선 이력서[CHG]</span>
          <p>G4 공동 승인 후 활성화</p>
        </div>
      </section>
    );

  return (
    <>
      <section
        className="user-operations-result"
        aria-label={`${project.name} 운영·개선 문서`}
      >
        <header>
          <div>
            <small>OPS · CHG · {project.no}</small>
            <h3>{project.name}</h3>
            <p>선택한 요청 과제의 운영 기록과 개선 이력만 표시합니다.</p>
          </div>
          <Pill tone={isOperating ? "green" : isDelivery ? "blue" : "gray"}>
            {operational.status}
          </Pill>
        </header>
        <div className="user-ops-gallery-action">
          <div>
            <CheckCircle size={18} weight="fill" />
            <p>
              <b>G4 최종 승인과 운영 인수인계가 완료되었습니다.</b>
              <span>승인 문서가 자동 연결된 상태로 Gallery 등록을 신청할 수 있습니다.</span>
            </p>
          </div>
          <button
            className="primary"
            onClick={() =>
              openGallerySubmission({
                source: "OPERATIONS",
                projectNo: project.no,
                name: project.name,
                description:
                  "구매요청 입력부터 승인선 확인과 담당자 알림까지 자동화합니다.",
                platform: "Power Automate",
                artifactType: "자동화 Flow",
                category: "생산성",
                targetUsers: "구매 요청자와 승인 담당자",
                supportOwner: project.owner,
                evidence: [
                  "G4 확산 승인 완료",
                  "DEP 배포 체크리스트 완료",
                  "UG 사용자 가이드 작성 완료",
                  "OPS 운영 담당 지정",
                ],
              })
            }
          >
            Agent Gallery 등록 신청
          </button>
        </div>
        <nav aria-label="과제별 운영 문서 선택">
          <button
            className={document === "OPS" ? "active" : ""}
            onClick={() => setDocument("OPS")}
          >
            <span>⑦-1</span>
            <b>운영 대장[OPS]</b>
            <small>월간 점검·재평가</small>
          </button>
          <button
            className={document === "CHG" ? "active" : ""}
            onClick={() => setDocument("CHG")}
          >
            <span>⑦-2</span>
            <b>개선 이력서[CHG]</b>
            <small>변경·재평가·승인</small>
          </button>
        </nav>
        {document === "OPS" ? (
          <div className="user-ops-body">
            <section>
              <div className="user-ops-section-title">
                <span>A</span>
                <div>
                  <b>에이전트 운영 정보</b>
                  <small>팀 전체가 아닌 이 요청 과제의 등록 정보</small>
                </div>
              </div>
              <dl className="user-ops-facts">
                <div>
                  <dt>유형 · 트랙 · 자율성</dt>
                  <dd>
                    {operational.type} · {operational.track} ·{" "}
                    {operational.autonomy}
                  </dd>
                </div>
                <div>
                  <dt>오너(현업)</dt>
                  <dd>{operational.owner}</dd>
                </div>
                <div>
                  <dt>개발/운영 담당</dt>
                  <dd>{operational.operator}</dd>
                </div>
                <div>
                  <dt>지식갱신 담당</dt>
                  <dd>{operational.knowledge}</dd>
                </div>
                <div>
                  <dt>배포일</dt>
                  <dd>{operational.deployed}</dd>
                </div>
                <div>
                  <dt>최근 점검 / 다음 재평가</dt>
                  <dd>
                    {operational.checked} / {operational.reevaluate}
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <div className="user-ops-section-title">
                <span>B</span>
                <div>
                  <b>월간 운영 점검 · 2026.08</b>
                  <small>사용량·품질·지식 최신성·분기 재평가</small>
                </div>
                <Pill tone={isOperating ? "green" : "gray"}>
                  {operational.decision}
                </Pill>
              </div>
              <div className="user-monthly-metrics">
                <article>
                  <small>사용량</small>
                  <b>
                    세션 {operational.sessions} · 사용자 {operational.users}
                  </b>
                  <span>{operational.trend}</span>
                </article>
                <article>
                  <small>품질</small>
                  <b>오류 신고 {operational.errors}</b>
                  <span>
                    {isOperating
                      ? "배송 API 지연 사례를 평가셋에 추가"
                      : "운영 후 실패 사례를 기록합니다."}
                  </span>
                </article>
                <article>
                  <small>지식 최신성</small>
                  <b>{operational.knowledgeState}</b>
                  <span>갱신 완료일 {operational.knowledgeDate}</span>
                </article>
                <article>
                  <small>정기 재평가</small>
                  <b>{operational.score}</b>
                  <span>
                    {isOperating
                      ? "평가셋 v1.4 · 배포 기준 90%"
                      : "분기 1회 전체 평가셋 재실행"}
                  </span>
                </article>
              </div>
            </section>
            <footer>
              <span>운영 담당자가 월 1회 및 이벤트 발생 시 갱신합니다.</span>
              <b>최근 갱신 {operational.checked}</b>
            </footer>
          </div>
        ) : (
          <div className="user-chg-body">
            <section>
              <div className="user-ops-section-title">
                <span>CHG</span>
                <div>
                  <b>과제별 변경 이력</b>
                  <small>
                    행을 누르면 변경 전·후와 재평가·승인 근거를 확인할 수
                    있습니다.
                  </small>
                </div>
                <Pill tone={changeRows.length ? "blue" : "gray"}>
                  {changeRows.length}건
                </Pill>
              </div>
              {changeRows.length ? (
                <div className="user-chg-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>변경번호</th>
                        <th>일자</th>
                        <th>유형</th>
                        <th>변경 내용</th>
                        <th>사유</th>
                        <th>재평가 결과</th>
                        <th>승인</th>
                        <th aria-label="상세 보기" />
                      </tr>
                    </thead>
                    <tbody>
                      {changeRows.map((row) => (
                        <tr
                          key={row[0]}
                          role="button"
                          tabIndex={0}
                          aria-label={`${row[0]} 개선 이력 상세 보기`}
                          onClick={() => setSelectedChange(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedChange(row);
                            }
                          }}
                        >
                          {row.map((cell, index) => (
                            <td key={`${row[0]}-${index}`}>
                              {index === 0 ? (
                                <b>{cell}</b>
                              ) : index === 5 ? (
                                <span className="reevaluation-pass">
                                  <Check size={11} weight="bold" />
                                  {cell}
                                </span>
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                          <td className="change-detail-link">
                            <span>상세</span>
                            <ArrowRight size={11} weight="bold" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="user-chg-empty">
                  <FileText size={24} />
                  <b>등록된 개선 이력이 없습니다.</b>
                  <p>
                    {isDelivery
                      ? "파일럿·운영 중 변경이 발생하면 재평가 결과와 함께 이곳에 기록됩니다."
                      : "운영 전에는 개선 이력서가 생성되지 않습니다."}
                  </p>
                </div>
              )}
            </section>
            <aside>
              <span>L↑</span>
              <div>
                <b>자율성 상향은 별도 재심사</b>
                <p>ARD 개정 → 3자 재확인 → 전체 재평가 → G3 재승인</p>
              </div>
            </aside>
          </div>
        )}
      </section>
      {selectedChange && (
        <ChangeDetailModal
          row={selectedChange}
          agentName={project.name}
          onClose={() => setSelectedChange(null)}
        />
      )}
    </>
  );
}

function UserDashboard({
  role,
  projectNo,
  onDeleteProject,
  setView,
  openNewRequest,
  projectItems,
  notify,
  openGallerySubmission,
}: {
  role: string;
  projectNo?: string;
  onDeleteProject: (projectNo: string) => void;
  setView: (v: View) => void;
  openNewRequest: () => void;
  projectItems: UserProject[];
  notify: (message: string) => void;
  openGallerySubmission: (draft: GalleryDraft) => void;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isAiTeamMember = role === ACCOUNT_ROLES.member;
  const isAiTeam = isLeader || isAiTeamMember;
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("전체");
  const [selectedJourney, setSelectedJourney] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [draftCompleted, setDraftCompleted] = useState(false);
  const [feaCompletedProjects, setFeaCompletedProjects] = useState<string[]>(
    [],
  );
  const [homeG1Resolutions, setHomeG1Resolutions] = useState<
    Record<
      string,
      {
        decision: "GO" | "CONDITIONAL" | "DROP";
        assignee: string;
        reason: string;
      }
    >
  >({});
  const [g2ReworkProjects, setG2ReworkProjects] = useState<
    Record<string, "editing" | "resubmitted">
  >({});
  const [pilotReleaseDocument, setPilotReleaseDocument] = useState<
    "DEP" | "UG" | null
  >(null);
  const [messages, setMessages] = useState([
    {
      role: "agent",
      text: "어떤 업무에서 가장 많은 시간이나 반복 작업이 발생하나요?",
    },
    {
      role: "user",
      text: "개발 BOM이 바뀔 때 관련 부품과 품질 문서를 일일이 찾아 영향 범위를 확인합니다.",
    },
    {
      role: "agent",
      text: "한 달에 몇 번 발생하고, 한 건을 확인하는 데 평균 얼마나 걸리나요?",
    },
  ]);
  useEffect(() => {
    if (projectItems.length === 0) {
      // Keep the master-detail selection stable while the production dataset is empty.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(0);
      setSelectedJourney(1);
      return;
    }
    const targetIndex = projectNo
      ? projectItems.findIndex((project) => project.no === projectNo)
      : -1;
    const nextIndex = targetIndex >= 0 ? targetIndex : 0;
    // Synchronize an externally selected project with the local master-detail view.
    setSelected(nextIndex);
    setSelectedJourney(projectItems[nextIndex].journeyStep);
    // projectItems is rebuilt by the role filter; its length and projectNo are
    // the stable synchronization inputs for this master-detail selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiTeam, role, projectNo, projectItems.length]);

  const hasProjects = projectItems.length > 0;
  const current = projectItems[selected] || projectItems[0] || emptyProject;
  const canDeleteCurrent =
    role === ACCOUNT_ROLES.user && current.journeyStep === 0;
  const deleteCurrentProject = () => {
    if (
      !window.confirm(
        `'${current.name}' 과제를 삭제하시겠습니까? 요구 접수 단계의 과제만 삭제할 수 있습니다.`,
      )
    )
      return;
    onDeleteProject(current.no);
    setSelected(0);
    notify(`${current.name} 과제가 삭제되었습니다.`);
  };
  const currentG1Resolution = homeG1Resolutions[current.no] || null;
  const g1Status = !hasProjects
    ? ""
    : currentG1Resolution
    ? currentG1Resolution.decision === "CONDITIONAL"
      ? "Conditional Go"
      : currentG1Resolution.decision === "DROP"
        ? "Drop"
        : "Go"
    : current.journeyStep <= 1
      ? "판정 대기"
      : "Go";
  const intakeComplete =
    hasProjects &&
    (current.journeyStep > 0 || (current.no === "2026-031" && draftCompleted));
  const effectiveJourneyStep = !hasProjects
    ? 1
    : g2ReworkProjects[current.no] === "resubmitted"
      ? Math.max(4, current.journeyStep)
      : feaCompletedProjects.includes(current.no)
        ? Math.max(2, current.journeyStep)
        : current.no === "2026-031" && draftCompleted
          ? 1
          : current.journeyStep;
  const selectedOutput = lifecycleOutputs[selectedJourney];
  const selectedOutputState = !hasProjects
    ? "생성 전"
    : selectedJourney < effectiveJourneyStep
      ? "완료"
      : selectedJourney === effectiveJourneyStep
        ? userJourney[selectedJourney].kind === "gate"
          ? "승인 대기"
          : "진행 중"
        : "생성 전";
  const assignedProjects = projectItems;
  const visible = assignedProjects.filter(
    (project) =>
      filter === "전체" ||
      (filter === "내 할 일"
        ? project.status === "내 작성 필요"
        : project.status !== "내 작성 필요"),
  );
  const applyFilter = (next: string) => {
    setFilter(next);
    if (projectItems.length === 0) return;
    if (next === "내 할 일") {
      const project = isAiTeam
        ? projectItems.find((item) => item.no === "2026-033") || projectItems[0]
        : projectItems.find((item) => item.status === "내 작성 필요") ||
          projectItems[0];
      setSelected(projectItems.indexOf(project));
      setSelectedJourney(project.journeyStep);
      return;
    }
    if (next === "진행 중") {
      const project =
        projectItems.find((item) => item.no === "2026-021") || projectItems[0];
      setSelected(projectItems.indexOf(project));
      setSelectedJourney(project.journeyStep);
      return;
    }
    setSelectedJourney(current.journeyStep);
  };
  const selectProject = (index: number) => {
    setSelected(index);
    setSelectedJourney(projectItems[index].journeyStep);
  };
  const sendDraftAnswer = () => {
    if (!chatInput.trim()) return;
    setMessages((items) => [
      ...items,
      { role: "user", text: chatInput.trim() },
      {
        role: "agent",
        text: "좋습니다. 답변을 접수서 초안에 반영했습니다. 기대하는 처리 방식과 목표 시간을 알려주세요.",
      },
    ]);
    setChatInput("");
  };

  return (
    <div className="page user-home user-home-oneview">
      <section className="user-home-hero">
        <div>
          <p className="eyebrow">
            {isAiTeam
              ? isLeader
                ? "AI ACTIVATION TEAM PROJECTS"
                : "MY ASSIGNED AGENT PROJECTS"
              : "MY AGENT REQUESTS"}
          </p>
          <h1>
            {isAiTeam
              ? isLeader
                ? "팀이 관리하는 Agent 과제를 한 화면에서 감독합니다."
                : "내가 담당한 Agent 과제를 한 화면에서 관리합니다."
              : "내가 요청한 과제는 지금 어디까지 왔을까요?"}
          </h1>
          <p>
            {isAiTeam
              ? isLeader
                ? "팀 전체 진행 이력과 지연 상태를 확인하고, 현재 단계에서 필요한 게이트 승인과 담당자 지정을 처리합니다."
                : "개발·리뷰·운영 역할로 배정된 과제를 함께 표시하며, 배정 시점부터 프로젝트 전체 이력을 확인할 수 있습니다."
              : "요청자 또는 프로젝트 Owner로 연결된 과제를 한 화면에서 확인할 수 있습니다."}
          </p>
        </div>
        <button className="new-request-cta" onClick={openNewRequest}>
          <span>
            <Plus size={19} weight="bold" />
          </span>
          <div>
            <strong>{isAiTeam ? "새 Agent 과제 등록" : "새 Agent 과제 요청"}</strong>
            <small>{isAiTeam ? "요청자를 대신해 접수서 작성" : "요구 접수 Agent와 대화로 시작"}</small>
          </div>
          <ArrowRight size={18} weight="bold" />
        </button>
      </section>

      <section className="user-home-grid oneview-grid">
        <article className="panel my-project-list">
          <header>
            <div>
              <h2>
                {isLeader
                  ? "팀 전체 Agent 과제"
                  : isAiTeamMember
                    ? "내 담당 Agent 과제"
                    : "내 Agent 과제"}
              </h2>
              <p>
                {isAiTeam
                  ? isLeader
                    ? "신규 접수부터 운영까지 팀이 관리하는 과제입니다."
                    : "개발 담당·리뷰어·운영 담당으로 배정된 과제입니다."
                  : "요청자·Owner 관계로 연결된 과제입니다."}
              </p>
            </div>
            <div className="compact-filters">
              {["전체", "내 할 일", "진행 중"].map((item) => (
                <button
                  key={item}
                  className={filter === item ? "active" : ""}
                  onClick={() => applyFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </header>
          <div className="project-stack">
            {!hasProjects && (
              <div className="project-stack-empty">
                <ClipboardText size={30} weight="duotone" />
                <b>등록된 Agent 과제가 없습니다.</b>
                <span>
                  {isAiTeam
                    ? "새 과제를 등록하거나 과제가 배정되면 여기에 표시됩니다."
                    : "새 Agent 과제를 요청하면 진행 상태가 여기에 표시됩니다."}
                </span>
              </div>
            )}
            {visible.map((project) => {
              const index = projectItems.findIndex(
                (item) => item.no === project.no,
              );
              return (
                <button
                  key={project.no}
                  className={selected === index ? "selected" : ""}
                  onClick={() => selectProject(index)}
                >
                  <span className={`project-stage-number ${project.tone}`}>
                    {index + 1}
                  </span>
                  <div>
                    <p>
                      <small>{project.no}</small>
                      <Pill tone={project.tone}>
                        {g2ReworkProjects[project.no] === "editing"
                          ? "ARD 보완 중"
                          : g2ReworkProjects[project.no] === "resubmitted"
                            ? "G2 재승인 대기"
                            : project.status}
                      </Pill>
                      <Pill
                        tone={
                          getProjectRelationships(role, project.no).includes(
                            "REVIEWER",
                          )
                            ? "violet"
                            : "blue"
                        }
                      >
                        {projectRelationshipLabel(role, project.no)}
                      </Pill>
                    </p>
                    <strong>{project.name}</strong>
                    <small>
                      {userJourney[project.journeyStep].title} ·{" "}
                      {project.updated} 업데이트
                    </small>
                  </div>
                  <span className="project-stage-label">
                    <b>{project.stage}단계</b>
                    <small>{project.progress}%</small>
                  </span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel selected-project-status oneview-status">
          <header>
            <div>
              {hasProjects && (
                <Pill tone={current.tone}>
                  {g2ReworkProjects[current.no] === "editing"
                    ? "ARD 보완 중"
                    : g2ReworkProjects[current.no] === "resubmitted"
                      ? "G2 재승인 대기"
                      : intakeComplete
                        ? current.status.replace("내 작성 필요", "작성 완료")
                        : "작성 중"}
                </Pill>
              )}
              <small>{current.no}</small>
              <h2>{current.name || "\u00a0"}</h2>
              <p>{hasProjects ? (intakeComplete ? "작성된 신청 결과와 생애주기 진행 상태입니다." : "작성하다 멈춘 요구 접수서가 있습니다. 오른쪽 대화에서 이어서 작성할 수 있습니다.") : "\u00a0"}</p>
            </div>
            <div className="project-header-actions">
              {canDeleteCurrent && (
                <button
                  className="danger-outline"
                  onClick={deleteCurrentProject}
                >
                  <Trash size={15} weight="bold" /> 과제 삭제
                </button>
              )}
              <button disabled={!hasProjects} onClick={() => setSelectedJourney(effectiveJourneyStep)}>
                현재 단계 보기 <ArrowRight size={13} weight="bold" />
              </button>
            </div>
          </header>

          <div className="user-lifecycle-track journey-v2 oneview-journey">
            {userJourney.map((stage, index) => {
              const state =
                index < effectiveJourneyStep
                  ? "done"
                  : index === effectiveJourneyStep
                    ? "current"
                    : "upcoming";
              const rejectedGate =
                current.no === "2026-028" &&
                index === 4 &&
                g2ReworkProjects[current.no] !== "resubmitted";
              return (
                <button
                  type="button"
                  key={`${stage.code || "S"}-${stage.title}`}
                  className={`${rejectedGate ? "rejected" : state} ${stage.kind} ${selectedJourney === index ? "selected" : ""}`}
                  onClick={() => setSelectedJourney(index)}
                  aria-label={`${stage.title} 결과 보기`}
                >
                  <span>
                    {rejectedGate ? (
                      <X size={14} weight="bold" />
                    ) : index < effectiveJourneyStep ? (
                      <Check size={14} weight="bold" />
                    ) : stage.kind === "gate" ? (
                      stage.code
                    ) : (
                      stage.display
                    )}
                  </span>
                  <div>
                    <b>{stage.title}</b>
                    <small>
                      {rejectedGate
                        ? "반려·보완"
                        : index < effectiveJourneyStep
                          ? "완료"
                          : index === effectiveJourneyStep
                            ? "현재 단계"
                            : stage.kind === "gate"
                              ? "선행 단계 필요"
                              : "예정"}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="journey-legend" aria-label="진행 상태 범례">
            <span>
              <i className="complete">
                <Check size={9} weight="bold" />
              </i>
              완료
            </span>
            <span>
              <i className="current" />
              현재 단계
            </span>
            <span>
              <i className="upcoming" />
              예정
            </span>
            <span>
              <i className="gate" />
              승인 게이트
            </span>
            <span>
              <i className="rejected">
                <X size={8} weight="bold" />
              </i>
              반려
            </span>
          </div>

          <section
            className="project-schedule-strip"
            aria-label="프로젝트 일정 추적"
          >
            <div>
              <CalendarBlank size={17} weight="duotone" />
              <p>
                <small>요청 시 희망 완료일</small>
                <b>{current.requestedDate}</b>
              </p>
            </div>
            <ArrowRight size={14} weight="bold" />
            <div>
              <Target size={17} weight="duotone" />
              <p>
                <small>G2 확정 프로젝트 마감일</small>
                <b>{current.committedDate}</b>
              </p>
            </div>
            <div
              className={`schedule-g1-status ${g1Status === "Go" ? "go" : g1Status === "Drop" ? "drop" : g1Status === "Conditional Go" ? "conditional" : "pending"}`}
            >
              <CheckCircle
                size={17}
                weight={g1Status === "Go" ? "fill" : "regular"}
              />
              <p>
                <small>G1 착수 판정</small>
                <b>{g1Status}</b>
              </p>
            </div>
            <Pill
              tone={
                !hasProjects
                  ? "gray"
                  : current.scheduleState.includes("지연")
                  ? "red"
                  : current.scheduleState.includes("협의")
                    ? "gray"
                    : "green"
              }
            >
              {current.scheduleState || "\u00a0"}
            </Pill>
            <small>마감일 변경은 최병두 팀장 승인 후 반영</small>
          </section>

          {selectedJourney === 0 ? (
            <div
              className={`intake-result-layout ${intakeComplete ? "complete" : "draft"}`}
            >
              <section
                className="intake-document"
                aria-label="에이전트 요구 접수서"
              >
                <header>
                  <div>
                    <small>INT · AGENT INTAKE</small>
                    <h3>에이전트 요구 접수서</h3>
                  </div>
                  <Pill tone={intakeComplete ? "green" : "orange"}>
                    {intakeComplete ? "작성 완료" : "작성 중 · 자동 저장"}
                  </Pill>
                </header>
                <div className="intake-document-body">
                  <section>
                    <b>1. 기본 정보</b>
                    <dl>
                      <div>
                        <dt>요구자</dt>
                        <dd>{current.requester || (current.owner ? `${current.owner} · 요청 부서` : "")}</dd>
                      </div>
                      <div>
                        <dt>Project Owner</dt>
                        <dd>{current.projectOwner || current.owner}</dd>
                      </div>
                      <div>
                        <dt>접수일</dt>
                        <dd>{hasProjects ? current.updated : ""}</dd>
                      </div>
                      <div>
                        <dt>접수 유형</dt>
                        <dd>신규 Agent 과제</dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <b>2. 해결하려는 업무 문제</b>
                    <p>
                      {current.intakeAnswers?.[0] || ""}
                    </p>
                  </section>
                  <section>
                    <b>3. 현재 처리 방식과 업무량</b>
                    <p>
                      {current.intakeAnswers
                        ? `${current.intakeAnswers[1]} 사용 자료: ${current.intakeAnswers[2]}`
                        : ""}
                    </p>
                    {!intakeComplete && (
                      <span className="missing-answer">
                        월 발생 건수와 평균 소요시간 확인 필요
                      </span>
                    )}
                  </section>
                  <section>
                    <b>4. 기대 결과</b>
                    <p>
                      {current.intakeAnswers?.[3] || ""}
                    </p>
                  </section>
                  <section>
                    <b>5. 위험 및 고려사항</b>
                    <p />
                  </section>
                  <section>
                    <b>6. 접수 처리</b>
                    <dl>
                      <div>
                        <dt>프로젝트 번호</dt>
                        <dd>{current.no}</dd>
                      </div>
                      <div>
                        <dt>희망 개발 완료일</dt>
                        <dd>{current.requestedDate}</dd>
                      </div>
                      <div>
                        <dt>담당 예정</dt>
                        <dd>{current.teamOwner}</dd>
                      </div>
                      <div>
                        <dt>다음 단계</dt>
                        <dd>{current.nextGate}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
                {!intakeComplete && (
                  <footer>
                    <button onClick={() => setDraftCompleted(true)}>
                      작성 완료 및 AI Agent 검토{" "}
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </footer>
                )}
              </section>

              {!intakeComplete && (
                <aside
                  className="intake-chat"
                  aria-label="요구 접수 대화 이어쓰기"
                >
                  <header>
                    <span className="brand-mark">AX</span>
                    <div>
                      <strong>요구 접수 Agent</strong>
                      <small>기존 대화를 불러왔습니다 · 3/6 작성</small>
                    </div>
                  </header>
                  <div className="chat-progress">
                    <span style={{ width: "50%" }} />
                  </div>
                  <div className="intake-chat-history">
                    {messages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`chat-message ${message.role}`}
                      >
                        <small>
                          {message.role === "agent" ? "요구 접수 Agent" : "나"}
                        </small>
                        <p>{message.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="quick-answers">
                    <button onClick={() => setChatInput("월 20건 · 건당 45분")}>
                      월 20건 · 45분
                    </button>
                    <button
                      onClick={() => setChatInput("수치 확인이 필요합니다")}
                    >
                      수치 확인 필요
                    </button>
                  </div>
                  <footer>
                    <input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") sendDraftAnswer();
                      }}
                      placeholder="답변을 입력하세요"
                      aria-label="요구 접수 답변"
                    />
                    <button onClick={sendDraftAnswer} aria-label="답변 보내기">
                      <ArrowRight size={16} weight="bold" />
                    </button>
                  </footer>
                </aside>
              )}
            </div>
          ) : selectedJourney === 1 ? (
            <FeasibilityResult
              projectNo={current.no}
              state={selectedOutputState}
              editable={hasProjects && isAiTeam}
              role={role}
              projectItem={current}
              onComplete={() =>
                setFeaCompletedProjects((items) =>
                  items.includes(current.no) ? items : [...items, current.no],
                )
              }
            />
          ) : (selectedJourney === 2 && isAiTeam) ||
            ((selectedJourney === 2 || selectedJourney === 4) &&
              (selectedOutputState !== "생성 전" ||
                (current.no === "2026-028" && selectedJourney === 4))) ? (
            <GateApprovalResult
              gate={selectedJourney === 2 ? "G1" : "G2"}
              projectNo={current.no}
              role={role}
              notify={notify}
              basisReady={selectedJourney !== 2 || effectiveJourneyStep >= 2}
              homeEmbedded
              initialG1Resolution={currentG1Resolution}
              onG1Resolved={(decision, assignee, reason) =>
                setHomeG1Resolutions((items) => ({
                  ...items,
                  [current.no]: { decision, assignee, reason },
                }))
              }
              g2ReworkSubmitted={
                g2ReworkProjects[current.no] === "resubmitted"
              }
              onStartArdRework={() => {
                setG2ReworkProjects((items) => ({
                  ...items,
                  [current.no]: "editing",
                }));
                setSelectedJourney(3);
                notify(
                  "G2 반려 사유와 보완 대상 ARD 항목을 불러왔습니다.",
                );
              }}
            />
          ) : selectedJourney === 3 ? (
            <RequirementDefinitionResult
              projectNo={current.no}
              state={selectedOutputState}
              reworkMode={g2ReworkProjects[current.no] === "editing"}
              reworkReason={
                current.no === "2026-028"
                  ? "Out of Scope와 평가셋 정답 라벨 책임자를 명확히 한 뒤 다시 검토해야 합니다."
                  : undefined
              }
              onReworkSubmit={() => {
                setG2ReworkProjects((items) => ({
                  ...items,
                  [current.no]: "resubmitted",
                }));
                setSelectedJourney(4);
                notify(
                  "ARD v0.9 보완본이 G2에 재상신되었습니다. 새 3자 승인 라운드가 시작됩니다.",
                );
              }}
            />
          ) : selectedJourney === 9 ? (
            <UserOperationsResult
              project={current}
              openGallerySubmission={openGallerySubmission}
            />
          ) : selectedJourney >= 5 && selectedJourney <= 8 ? (
            <DeliveryWorkplace
              role={role}
              openHub={() => setView("hub")}
              notify={notify}
              embedded
              viewerMode={!isAiTeam}
              lifecycleState={selectedOutputState}
              embeddedSection={
                selectedJourney === 5
                  ? "delivery"
                  : selectedJourney === 6
                    ? "g3"
                    : selectedJourney === 7
                      ? "pilot"
                      : "g4"
              }
              projectNo={current.no}
            />
          ) : (
            <section
              className={`lifecycle-output-card ${selectedOutputState === "완료" ? "complete" : selectedOutputState === "생성 전" ? "upcoming" : "active"}`}
            >
              <header>
                <div>
                  <small>
                    {selectedOutput.code} · {current.no}
                  </small>
                  <h3>{selectedOutput.title}</h3>
                  <p>{selectedOutput.summary}</p>
                </div>
                <Pill
                  tone={
                    selectedOutputState === "완료"
                      ? "green"
                      : selectedOutputState === "생성 전"
                        ? "gray"
                        : userJourney[selectedJourney].kind === "gate"
                          ? "orange"
                          : "blue"
                  }
                >
                  {selectedOutputState}
                </Pill>
              </header>
              <div className="lifecycle-output-sections">
                {selectedOutput.sections.map(([label, value]) => (
                  <section key={label}>
                    <b>{label}</b>
                    <p>
                      {selectedOutputState === "생성 전"
                        ? `${value} · 단계 시작 후 작성`
                        : value}
                    </p>
                    {selectedOutputState === "완료" && (
                      <span>
                        <Check size={11} weight="bold" /> 확인 완료
                      </span>
                    )}
                  </section>
                ))}
              </div>
              <footer>
                <div>
                  <small>현재 단계</small>
                  <strong>{userJourney[effectiveJourneyStep].title}</strong>
                </div>
                <button
                  onClick={() =>
                    selectedJourney === 7 && selectedOutputState !== "생성 전"
                      ? setPilotReleaseDocument("DEP")
                      : setView(current.route)
                  }
                >
                  {selectedJourney === 7 && selectedOutputState !== "생성 전"
                    ? "배포 문서 보기"
                    : selectedOutputState === "생성 전"
                      ? "예정 산출물 안내"
                      : "산출물 상세 보기"}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </footer>
            </section>
          )}
        </article>
      </section>
      {pilotReleaseDocument && (
        <PilotReleaseDocumentsDialog
          document={pilotReleaseDocument}
          projectNo={current.no}
          onSelect={setPilotReleaseDocument}
          onClose={() => setPilotReleaseDocument(null)}
        />
      )}
    </div>
  );
}

type LifecycleRoleStage = "intake" | "definition" | "delivery" | "operations";

function LifecycleRoleGuide({
  role,
  stage,
  projectNo,
}: {
  role: string;
  stage: LifecycleRoleStage;
  projectNo?: string;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isMember = role === ACCOUNT_ROLES.member;
  const relationships = getProjectRelationships(role, projectNo);
  const isDeveloper = relationships.includes("DEVELOPER");
  const isOperator = relationships.includes("OPERATOR");
  const isReviewer = relationships.includes("REVIEWER");
  const isOwner = relationships.includes("OWNER");
  const isRequester = relationships.includes("REQUESTER") || role === ACCOUNT_ROLES.user;
  const isSecurity = relationships.includes("SECURITY_REVIEWER");
  const roleLabel = isLeader
    ? "AI활성화팀장"
    : isReviewer
      ? "AI활성화팀 팀원 · 동료 리뷰어"
      : isDeveloper
        ? "AI활성화팀 팀원 · 개발 담당"
        : isOwner
          ? "프로젝트 Owner"
          : isSecurity
            ? "정보보호 담당자"
            : isOperator
              ? "AI활성화팀 팀원 · 운영 담당"
              : isRequester
                ? "요구자"
                : isMember
                  ? "AI활성화팀 팀원 · 조회"
                  : "조회 전용";
  const matrix = {
    intake: isLeader
      ? {
          action: "G1 판정 · 개발 담당자 지정",
          view: "작성 완료된 INT·FEA와 인터뷰 근거 확인",
          permission: "착수 승인",
        }
      : isDeveloper
        ? {
            action: "현업 인터뷰 · 타당성 평가서[FEA] 작성",
            view: "작성 완료된 에이전트 요구 접수서[INT] 확인",
            permission: "작성",
          }
        : isMember
          ? {
              action: "배정된 프로젝트 전체 이력 확인",
              view: "INT·FEA와 G1 판정 근거 조회",
              permission: "조회",
            }
          : {
            action: "요구 접수 Agent와 접수서 작성",
            view: "제출 결과와 보완 요청 확인",
            permission: "작성",
          },
    definition: isOwner
      ? {
          action: "ARD 업무 범위·자율성·운영 책임 확인",
          view: "Out of Scope·성공 기준 조회",
          permission: "조회",
        }
      : isLeader
        ? {
            action: "작성된 ARD 확인 · G2 승인 또는 보완 요청",
            view: "범위·자율성·성공 기준·3자 승인 현황",
            permission: "검토·승인",
          }
        : isDeveloper
          ? {
              action: "현업 미팅 · ARD 공동 작성·보완",
              view: "INT·FEA·G1 조건과 G2 승인 현황",
              permission: "작성",
            }
          : isMember
            ? {
                action: "배정된 프로젝트의 ARD·G2 이력 검토",
                view: "요구 접수부터 현재 단계까지 전체 이력",
                permission: "조회",
              }
            : {
              action: "개발 담당자와 ARD 공동 작성 · G2 승인",
              view: "정의 내용과 3자 승인·보완 상태",
              permission: "작성·승인",
            },
    delivery: isReviewer
      ? {
          action: "EVP·EVR 교차 검토 · G3 독립 서명",
          view: "정답 라벨·실패 전수·회귀 평가·DEP 확인",
          permission: "검토·승인",
        }
      : isSecurity
        ? {
            action: "상 트랙 보안 검토 · G3 추가 서명",
            view: "데이터·권한·로그·보존 정책 확인",
            permission: "보안 승인",
          }
        : isOwner
          ? {
              action: "파일럿 종료 기준 확인 · G4 공동 승인",
              view: "DEP 파일럿 결과·운영·지식 담당 인수",
              permission: "검토·승인",
            }
          : isLeader
            ? {
                action: "설계·평가 산출물 검토 · G3/G4 승인",
                view: "DES·EVP·EVR·DEP·UG와 파일럿 결과 확인",
                permission: "검토·승인",
              }
            : isDeveloper
              ? {
                  action: "DES·EVP·EVR 작성 · DEP/UG·파일럿 관리",
                  view: "G3·G4 승인 상태와 보완 의견 확인",
                  permission: "작성·실행",
                }
              : {
                  action: "개발·평가·배포 진행 결과 확인",
                  view: "산출물과 승인 결과 조회",
                  permission: "조회",
                },
    operations: isLeader
      ? {
          action: "운영 위험·재평가·자율성 변경 감독",
          view: "OPS·CHG 및 재승인 필요 항목 확인",
          permission: "감독·승인",
        }
      : isOperator || isDeveloper
        ? {
            action: "운영 대장[OPS]·개선 이력서[CHG] 관리",
            view: "실패 사례 등록·회귀 평가·변경 기록",
            permission: "작성·운영",
          }
        : isOperator
          ? {
              action: "월간 운영 점검과 개선 이력 기록",
              view: "사용량·품질·지식 최신성·재평가 관리",
              permission: "작성·운영",
            }
          : {
              action: "운영 상태와 개선 결과 확인",
              view: "내 Agent의 OPS·CHG 열람",
              permission: "조회",
            },
  }[stage];

  return (
    <section
      className={`lifecycle-role-guide ${isLeader ? "leader" : isReviewer || isSecurity ? "reviewer" : isOwner ? "owner" : isMember ? "member" : "user"}`}
      aria-label={`${roleLabel} 역할별 업무`}
    >
      <div>
        <UserCircle size={22} weight="fill" />
        <p>
          <small>현재 역할</small>
          <b>{roleLabel}</b>
        </p>
      </div>
      <i />
      <div>
        <Target size={20} weight="bold" />
        <p>
          <small>이 단계에서 할 일</small>
          <b>{matrix.action}</b>
        </p>
      </div>
      <i />
      <div>
        <FileText size={20} weight="bold" />
        <p>
          <small>확인할 근거</small>
          <b>{matrix.view}</b>
        </p>
      </div>
      <Pill
        tone={
          isLeader || isOwner
            ? "violet"
            : isMember || isReviewer || isSecurity
              ? "blue"
              : "gray"
        }
      >
        {matrix.permission}
      </Pill>
    </section>
  );
}

type FeasibilityTrack = "LOW" | "MEDIUM" | "HIGH";

function judgeFeasibilityTrack(input: {
  writeExec: boolean;
  sensitive: boolean;
  scope: string;
  damageFinancial: boolean;
  autonomy: string;
}) {
  const highSignals = [
    input.writeExec && "쓰기·실행 권한",
    input.sensitive && "개인정보·기밀 취급",
    input.damageFinancial && "금전·법적 피해 가능성",
    ["L2", "L3", "L4"].includes(input.autonomy) && "자율성 L2 이상",
  ].filter(Boolean) as string[];
  const mediumSignal = ["DEPT", "MULTI_DEPT", "COMPANY"].includes(
    input.scope,
  );
  const track: FeasibilityTrack = highSignals.length
    ? "HIGH"
    : mediumSignal
      ? "MEDIUM"
      : "LOW";

  return {
    track,
    label: track === "HIGH" ? "상" : track === "MEDIUM" ? "중" : "하",
    signals:
      highSignals.length > 0
        ? highSignals
        : mediumSignal
          ? ["부서 단위 이상 사용"]
          : ["개인·팀 내 보조 도구"],
    citation: "에이전트 개발 표준체계 0.3절",
  };
}

function calculateFeasibilityRoi(input: {
  countPerMonth: number;
  asIsMinutes: number;
  people: number;
  toBeMinutes: string;
}) {
  const toBe = Number(input.toBeMinutes);
  if (!input.toBeMinutes.trim() || !Number.isFinite(toBe) || toBe < 0) {
    return {
      computed: false as const,
      reason:
        "To-Be 시간/건이 확보되지 않아 ROI를 산출하지 않았습니다. 추정치로 대체하지 않습니다.",
    };
  }
  const asIsHours =
    (input.countPerMonth * input.asIsMinutes * input.people) / 60;
  const toBeHours = (input.countPerMonth * toBe * input.people) / 60;
  const savedHours = asIsHours - toBeHours;
  return {
    computed: true as const,
    asIsHours: Math.round(asIsHours * 10) / 10,
    toBeHours: Math.round(toBeHours * 10) / 10,
    savedHours: Math.round(savedHours * 10) / 10,
    savedHoursYear: Math.round(savedHours * 12 * 10) / 10,
    savedMdYear: Math.round((savedHours * 12 * 10) / 8) / 10,
    formula: `(${input.asIsMinutes}분 - ${toBe}분) × ${input.countPerMonth}건/월 × ${input.people}명 ÷ 60`,
  };
}

function IntakeFeasibility({
  role,
  notify,
  goDefinition,
  projectNo,
}: {
  role: string;
  notify: (s: string) => void;
  goDefinition: () => void;
  projectNo?: string;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isAiTeam = role === ACCOUNT_ROLES.leader || role === ACCOUNT_ROLES.member;
  const [chatStep, setChatStep] = useState(2);
  const [chatInput, setChatInput] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(
    projectNo === "2026-033"
      ? 0
      : projectNo === "2026-030"
        ? 2
        : projectNo === "2026-029"
          ? 3
          : 1,
  );
  const [resolvedG1, setResolvedG1] = useState<{
    decision: "GO" | "CONDITIONAL" | "DROP";
    assignee: string;
    reason: string;
  } | null>(null);
  const [trackDraft, setTrackDraft] = useState<FeasibilityTrack>("HIGH");
  const [autonomyDraft, setAutonomyDraft] = useState("L0");
  const [riskWriteExec, setRiskWriteExec] = useState(false);
  const [riskSensitive, setRiskSensitive] = useState(true);
  const [riskScope, setRiskScope] = useState("COMPANY");
  const [riskDamageFinancial, setRiskDamageFinancial] = useState(true);
  const [toBeMinutes, setToBeMinutes] = useState("");
  const updateAutonomyDraft = (next: string) => {
    setAutonomyDraft(next);
    if (["L2", "L3", "L4"].includes(next)) {
      setTrackDraft("HIGH");
      notify(
        `${next} 자율성은 표준체계에 따라 상 트랙으로 자동 분류되었습니다.`,
      );
    }
  };
  const intakeRequests = [
    {
      no: "2026-033",
      name: "원부자재 인증서 확인 Agent",
      dept: "구매팀",
      requester: "김지은",
      submitted: "어제 16:42",
      score: 88,
      risk: "중",
      status: "FEA 보완 필요",
      tone: "red",
      work: "원부자재별 인증서 유효기간과 규격 충족 여부를 메일·공유폴더·구매시스템에서 수작업 확인",
      volume: "월 60건 · 건당 18분 · 월 18시간",
      outcome: "인증서 누락·만료·규격 불일치 후보와 원문 근거를 담당자 검토 목록으로 제공",
      impact: "만료 또는 부적합 인증서를 놓치면 입고 지연과 품질 승인 보류 가능",
      countPerMonth: 60,
      minutesPerCase: 18,
      people: 1,
    },
    {
      no: "2026-031",
      name: "개발 BOM 변경 영향 분석 Agent",
      dept: "개발1팀",
      requester: "김현우",
      submitted: "오늘 09:18",
      score: 84,
      risk: "중",
      status: "FEA 작성 중",
      tone: "orange",
      work: "BOM 변경 시 관련 부품·도면·품질 문서를 여러 시스템에서 수작업으로 대조",
      volume: "월 20건 · 건당 45분 · 월 15시간",
      outcome: "변경 부품과 영향 문서 목록을 근거 링크와 함께 자동 제시",
      impact: "검토 누락 시 샘플 재작업 및 개발 일정 지연 가능",
      countPerMonth: 20,
      minutesPerCase: 45,
      people: 1,
    },
    {
      no: "2026-030",
      name: "협력사 품질 문의 답변 Agent",
      dept: "품질혁신팀",
      requester: "박서연",
      submitted: "어제 16:42",
      score: 91,
      risk: "중",
      status: "검토 중",
      tone: "blue",
      work: "협력사 문의마다 품질 규정과 과거 답변을 찾아 이메일 초안을 반복 작성",
      volume: "주 35건 · 건당 20분 · 월 약 47시간",
      outcome:
        "승인 규정의 근거 조항을 포함한 답변 초안과 담당자 확인 항목 제시",
      impact: "잘못된 규정 안내 시 협력사 조치 지연과 품질 분쟁 가능",
      countPerMonth: 140,
      minutesPerCase: 20,
      people: 1,
    },
    {
      no: "2026-029",
      name: "월간 회의록 후속조치 정리",
      dept: "경영기획팀",
      requester: "이민지",
      submitted: "8.10 11:05",
      score: 67,
      risk: "낮음",
      status: "보완 필요",
      tone: "red",
      work: "회의록에서 담당자·기한·후속조치를 수작업으로 옮기고 누락 여부를 확인",
      volume: "월 12회 · 건당 30분 · 담당자 2명",
      outcome: "회의록에서 Action Item을 추출해 담당자 확인용 목록으로 제공",
      impact: "업무량과 정답 검수 책임자가 아직 명확하지 않아 보완 필요",
      countPerMonth: 12,
      minutesPerCase: 30,
      people: 2,
    },
  ];
  const current = intakeRequests[selectedRequest];
  const canEditFea =
    isLeader || hasProjectRelationship(role, current.no, ["DEVELOPER"]);
  const isCertificateFea = current.no === "2026-033";
  const requestedCompletion = isCertificateFea ? "2026.09.10" : "2026.10.30";
  const alternativeFindings = isCertificateFea
    ? [
        "규정 보완만으로 분산된 인증서 수집·유효성 대조를 해소할 수 없음",
        "구매시스템은 인증서 원문 판독과 규격별 조건 비교를 지원하지 않음",
        "파일명·양식이 일정하지 않아 매크로 규칙을 안정적으로 유지하기 어려움",
        "단순 검색만으로 만료일·규격 조건 판정과 근거 추적을 보장할 수 없음",
      ]
    : [
        "시스템이 분리되어 수작업 대조 자체는 해소 불가",
        "GMES 단독으로 문서 간 의미 관계 확인 불가",
        "비정형 품질 문서와 연계 규칙을 지속 관리하기 어려움",
        "변경 항목별 규칙 실행과 근거 추적이 필요",
      ];
  const feaConclusion = isCertificateFea
    ? "네 가지 저비용 대안만으로는 분산된 인증서의 유효기간과 규격 조건을 근거와 함께 일관되게 판정하기 어려워, 읽기 전용 연동과 담당자 최종 확인을 포함한 Agent 개발이 타당합니다."
    : "네 가지 저비용 대안만으로는 시스템 간 영향 관계와 근거 추적을 함께 해결할 수 없어, 읽기 전용 데이터 연동과 사람 검토를 포함한 Agent 개발이 타당합니다.";
  const engineTrack = useMemo(
    () =>
      judgeFeasibilityTrack({
        writeExec: riskWriteExec,
        sensitive: riskSensitive,
        scope: riskScope,
        damageFinancial: riskDamageFinancial,
        autonomy: autonomyDraft,
      }),
    [
      autonomyDraft,
      riskDamageFinancial,
      riskScope,
      riskSensitive,
      riskWriteExec,
    ],
  );
  const engineRoi = useMemo(
    () =>
      calculateFeasibilityRoi({
        countPerMonth: current.countPerMonth,
        asIsMinutes: current.minutesPerCase,
        people: current.people,
        toBeMinutes,
      }),
    [current.countPerMonth, current.minutesPerCase, current.people, toBeMinutes],
  );
  const engineRecommendation = engineRoi.computed ? "Go 권고" : "Conditional Go 권고";
  const engineGuardrails = [
    ["G-1", "상 트랙 조건 전건 검사", true],
    ["G-2", "권고와 G1 확정 분리", true],
    ["G-3", "미확보 수치 추정 금지", !engineRoi.computed],
    ["G-4", "판정 근거 조항 표시", true],
    ["G-5", "Drop 시 대안 안내", true],
    ["G-6", "민감정보 원문 차단", true],
    ["G-7", "범위 밖 실행 거절", true],
  ] as const;

  useEffect(() => {
    // Keep the editable draft aligned with deterministic engine output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrackDraft(engineTrack.track);
  }, [engineTrack.track]);

  useEffect(() => {
    // A newly selected request must not inherit another request's ROI draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToBeMinutes("");
  }, [selectedRequest]);
  const sendChat = () => {
    if (!chatInput.trim()) return;
    setChatStep(Math.min(5, chatStep + 1));
    setChatInput("");
    notify("답변이 에이전트 요구 접수서[INT] 초안에 반영되었습니다.");
  };

  return (
    <div className="page intake-page">
      <section className="page-heading intake-heading">
        <div>
          <p className="eyebrow">01 · INTAKE & FEASIBILITY</p>
          <h1>요구 접수 · 타당성 평가</h1>
          <p>
            {isLeader
              ? "담당자가 인터뷰 후 작성한 타당성 평가서[FEA]를 확인하고 G1 착수 단계에서 추진 여부와 개발 담당자를 결정합니다."
              : isAiTeam
                ? "완료된 에이전트 요구 접수서[INT]를 확인하고 현업 인터뷰를 거쳐 타당성 평가서[FEA]를 작성합니다."
                : "요구 접수 Agent와 대화하면 업무의 문제와 기대효과가 에이전트 요구 접수서[INT]로 정리됩니다."}
          </p>
        </div>
        <div className="perspective-switch account-context" aria-label="현재 MS 계정 역할">
          <span>MS 계정 역할</span>
          <b>
            {isLeader
              ? "AI 활성화팀 팀장"
              : isAiTeam
                ? "AI 활성화팀 팀원"
                : "일반 User"}
          </b>
        </div>
      </section>
      <LifecycleRoleGuide role={role} stage="intake" projectNo={current.no} />
      <div className="intake-stage-line">
        <div className="active">
          <span>1</span>
          <p>
            <b>Agent 대화</b>
            <small>요구 발굴</small>
          </p>
        </div>
        <i />
        <div className="active">
          <span>2</span>
          <p>
            <b>에이전트 요구 접수서[INT]</b>
            <small>제출·보완</small>
          </p>
        </div>
        <i />
        <div className={isAiTeam ? "active" : ""}>
          <span>3</span>
          <p>
            <b>타당성 평가서[FEA]</b>
            <small>대안·효과·트랙</small>
          </p>
        </div>
        <i />
        <div className={isLeader ? "active" : ""}>
          <span>G1</span>
          <p>
            <b>착수 승인</b>
            <small>팀장 판정·담당자 지정</small>
          </p>
        </div>
      </div>
      <section
        className="project-schedule-strip workflow-schedule-strip"
        aria-label="선택 과제 일정과 착수 판정"
      >
        <div>
          <CalendarBlank size={17} weight="duotone" />
          <p>
            <small>요청 시 희망 완료일</small>
            <b>{requestedCompletion}</b>
          </p>
        </div>
        <ArrowRight size={14} weight="bold" />
        <div>
          <Target size={17} weight="duotone" />
          <p>
            <small>확정 프로젝트 마감일</small>
            <b>G2 승인 후 확정</b>
          </p>
        </div>
        <div
          className={`schedule-g1-status ${resolvedG1?.decision === "GO" ? "go" : "pending"}`}
        >
          <CheckCircle
            size={17}
            weight={resolvedG1?.decision === "GO" ? "fill" : "regular"}
          />
          <p>
            <small>G1 착수 판정</small>
            <b>
              {!resolvedG1
                ? "판정 대기"
                : resolvedG1.decision === "CONDITIONAL"
                  ? "Conditional Go"
                  : resolvedG1.decision === "DROP"
                    ? "Drop"
                    : "Go"}
            </b>
          </p>
        </div>
        <Pill
          tone={
            !resolvedG1
              ? "orange"
              : resolvedG1.decision === "DROP"
                ? "red"
                : resolvedG1.decision === "GO"
                  ? "green"
                  : "orange"
          }
        >
          {!resolvedG1
            ? "FEA 작성·검토 중"
            : `개발 담당 ${resolvedG1.assignee}`}
        </Pill>
      </section>

      {!isAiTeam ? (
        <>
          <section className="user-intake-grid">
            <article className="agent-conversation panel">
              <header>
                <div className="agent-face">AX</div>
                <div>
                  <strong>요구 접수 Agent</strong>
                  <p>기술 용어 없이 현재 업무를 설명해 주세요.</p>
                </div>
                <Pill tone="green">대화 중</Pill>
              </header>
              <div className="chat-progress">
                <span style={{ width: `${chatStep * 20}%` }} />
                <small>
                  에이전트 요구 접수서[INT] 필수정보 {chatStep}/5 수집
                </small>
              </div>
              <div className="chat-thread">
                <div className="agent-msg">
                  <b>요구 접수 Agent</b>
                  <p>
                    어떤 업무에서 가장 많은 시간이나 반복 작업이 발생하나요?
                  </p>
                </div>
                <div className="user-msg">
                  <p>
                    개발 BOM이 바뀔 때 관련 부품과 품질 문서를 일일이 찾아 영향
                    범위를 확인합니다.
                  </p>
                </div>
                <div className="agent-msg">
                  <b>요구 접수 Agent</b>
                  <p>
                    한 달에 몇 번 발생하고, 한 건을 확인하는 데 평균 얼마나
                    걸리나요?
                  </p>
                  <div className="quick-replies">
                    <button
                      onClick={() =>
                        setChatInput("월 20건, 건당 약 45분 걸립니다.")
                      }
                    >
                      월 20건 · 45분
                    </button>
                    <button
                      onClick={() =>
                        setChatInput("정확한 수치를 확인해 볼게요.")
                      }
                    >
                      수치 확인 필요
                    </button>
                  </div>
                </div>
                {chatStep > 2 && (
                  <div className="user-msg">
                    <p>월 20건 정도이고 한 건당 약 45분 걸립니다.</p>
                  </div>
                )}
                {chatStep > 2 && (
                  <div className="agent-msg">
                    <b>요구 접수 Agent</b>
                    <p>
                      좋습니다. 변경 영향을 놓쳤을 때 발생할 수 있는 위험도
                      알려주세요.
                    </p>
                  </div>
                )}
              </div>
              <footer>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="답변을 입력하세요"
                  aria-label="요구 접수 Agent 답변"
                />
                <button onClick={sendChat}>전송 ↑</button>
              </footer>
            </article>
            <article className="int-draft panel">
              <header>
                <div>
                  <Pill tone="blue">자동 작성 중</Pill>
                  <h2>에이전트 요구 접수서[INT]</h2>
                  <p>2026-031-INT · 초안</p>
                </div>
                <span>{chatStep * 20}%</span>
              </header>
              <div className="int-fields">
                <div className="complete">
                  <span>01</span>
                  <p>
                    <small>요구자</small>
                    <b>김현우 · 개발1팀</b>
                  </p>
                  <i>✓</i>
                </div>
                <div className="complete">
                  <span>02</span>
                  <p>
                    <small>힘든 업무</small>
                    <b>BOM 변경 영향 범위 수작업 확인</b>
                  </p>
                  <i>✓</i>
                </div>
                <div className={chatStep > 2 ? "complete" : "current"}>
                  <span>03</span>
                  <p>
                    <small>업무량·소요시간</small>
                    <b>
                      {chatStep > 2
                        ? "월 20건 · 건당 45분"
                        : "Agent가 질문 중입니다"}
                    </b>
                  </p>
                  <i>{chatStep > 2 ? "✓" : "…"}</i>
                </div>
                <div className="waiting">
                  <span>04</span>
                  <p>
                    <small>기대 결과·사용자</small>
                    <b>답변 대기</b>
                  </p>
                </div>
                <div className="waiting">
                  <span>05</span>
                  <p>
                    <small>오류 시 위험</small>
                    <b>답변 대기</b>
                  </p>
                </div>
              </div>
              <div className="draft-note">
                <span>i</span>
                <p>
                  <b>제출 전 직접 확인합니다.</b>
                  <br />
                  Agent가 정리한 문장을 수정하고 누락 내용을 보완할 수 있습니다.
                </p>
              </div>
              <button
                className="primary draft-submit"
                onClick={() =>
                  notify(
                    chatStep < 5
                      ? "필수 질문을 모두 완료한 뒤 에이전트 요구 접수서[INT]를 제출할 수 있습니다."
                      : "에이전트 요구 접수서[INT]가 제출되어 최병두 팀장님의 검토 대기 상태가 되었습니다.",
                  )
                }
              >
                {chatStep < 5
                  ? "대화 계속하기"
                  : "에이전트 요구 접수서[INT] 확인 후 제출"}
              </button>
            </article>
          </section>
          <section className="panel my-intake-status">
            <div className="panel-title">
              <div>
                <h2>내 요구 접수 현황</h2>
                <p>
                  에이전트 요구 접수서[INT] 제출 이후 최병두 팀장님의 승인·거절
                  결과를 확인합니다.
                </p>
              </div>
              <button className="text-link">전체 보기</button>
            </div>
            <div className="status-cards">
              <button onClick={goDefinition}>
                <span className="status-icon approved">✓</span>
                <div>
                  <small>2026-028 · G1 승인</small>
                  <strong>출장 규정 문의 Agent</strong>
                  <p>최병두 팀장 승인 · 중 트랙 · 요구 정의 가능</p>
                </div>
                <Pill tone="green">요구 정의로 이동</Pill>
                <b>›</b>
              </button>
              <button
                onClick={() =>
                  notify("타당성 평가서[FEA] 검토 의견을 열었습니다.")
                }
              >
                <span className="status-icon pending">⌛</span>
                <div>
                  <small>2026-027 · 타당성 평가서[FEA] 검토 중</small>
                  <strong>샘플 발송 현황 알림 Agent</strong>
                  <p>제출 8.11 · 예상 결과일 8.17</p>
                </div>
                <Pill tone="orange">검토 중</Pill>
                <b>›</b>
              </button>
              <button
                onClick={() => notify("Drop 사유와 대안 안내를 열었습니다.")}
              >
                <span className="status-icon rejected">×</span>
                <div>
                  <small>2026-022 · Drop</small>
                  <strong>개인 일정 자동 정리 Agent</strong>
                  <p>우선순위 낮음 · 기존 M365 기능 활용 안내</p>
                </div>
                <Pill tone="red">분기 재검토 후보</Pill>
                <b>›</b>
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="leader-intake-grid">
            <article className="panel review-queue">
              <div className="panel-title">
                <div>
                  <h2>검토 대기 에이전트 요구 접수서[INT]</h2>
                  <p>접수 후 5영업일 이내 타당성 평가서[FEA] 작성</p>
                </div>
                <Pill tone="orange">3건</Pill>
              </div>
              <div>
                {intakeRequests.map((r, i) => (
                  <button
                    className={selectedRequest === i ? "selected" : ""}
                    key={r.no}
                    onClick={() => setSelectedRequest(i)}
                  >
                    <span
                      className={`queue-score ${r.score >= 80 ? "good" : ""}`}
                    >
                      {r.score}
                    </span>
                    <div>
                      <small>
                        {r.no} · {r.dept}
                      </small>
                      <strong>{r.name}</strong>
                      <p>
                        {r.requester} · {r.submitted}
                      </p>
                    </div>
                    <Pill tone={r.tone}>{r.status}</Pill>
                  </button>
                ))}
              </div>
            </article>
            <article className="panel int-review-document">
              <header>
                <div>
                  <Pill tone="blue">{current.no}-INT</Pill>
                  <h2>{current.name}</h2>
                  <p>
                    {current.requester} · {current.dept} · {current.submitted}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    notify(
                      "에이전트 요구 접수서[INT] 원문 전체보기를 열었습니다.",
                    )
                  }
                >
                  에이전트 요구 접수서[INT] 원문 보기
                </button>
              </header>
              <div className="int-summary-grid">
                <div>
                  <small>현재 업무</small>
                  <p>{current.work}</p>
                </div>
                <div>
                  <small>업무량</small>
                  <p>{current.volume}</p>
                </div>
                <div>
                  <small>기대 결과</small>
                  <p>{current.outcome}</p>
                </div>
                <div>
                  <small>오류 시 위험</small>
                  <p>{current.impact}</p>
                </div>
              </div>
              <div className="int-quality">
                <span>에이전트 요구 접수서[INT] 완성도</span>
                <Progress value={current.score} />
                <b>{current.score}%</b>
                <small>
                  {current.score < 70
                    ? "업무량 근거 보완 필요"
                    : "필수 항목 충족"}
                </small>
              </div>
            </article>
          </section>

          <section
            className={`fea-workspace panel ${!canEditFea ? "role-readonly-workspace" : ""}`}
          >
            {!canEditFea && (
              <div className="role-readonly-notice">
                <Info size={17} weight="fill" />
                <p>
                  <b>작성 결과 조회</b>
                  <span>
                    타당성 평가서는 AI활성화팀 담당자가 인터뷰 후 작성하며,
                    팀장은 G1 착수 승인에서 판정합니다.
                  </span>
                </p>
              </div>
            )}
            <div className="fea-head">
              <div>
                <p className="eyebrow">{current.no}-FEA · 작성 중</p>
                <h2>타당성 평가서[FEA]</h2>
                <p>
                  “왜 Agent여야 하는가?”를 인터뷰·대안·효과·위험 근거로
                  정리합니다.
                </p>
              </div>
              <div>
                <span>작성자 허정환 담당자</span>
                <span>G1 판정 최병두 팀장</span>
                {canEditFea && (
                  <button
                    className="secondary"
                    onClick={() => notify("타당성 평가서[FEA] 임시저장 완료")}
                  >
                    임시 저장
                  </button>
                )}
              </div>
            </div>
            <section className="feasibility-engine" aria-label="타당성 판정 엔진">
              <header>
                <div>
                  <span className="engine-mark">
                    <ShieldCheck size={18} weight="fill" />
                  </span>
                  <div>
                    <b>타당성 판정 엔진</b>
                    <p>결정적 규칙이 계산하고, LLM은 결과를 바꾸지 않습니다.</p>
                  </div>
                </div>
                <div className="engine-standard">
                  <Pill tone="blue">표준체계 v1.0</Pill>
                  <small>기준 2026.07.30 · SHA 3fa0cb3db344</small>
                </div>
              </header>
              <div className="engine-result-grid">
                <article>
                  <small>규칙 트랙 판정</small>
                  <strong>{engineTrack.label} 트랙</strong>
                  <p>{engineTrack.signals.join(" · ")}</p>
                  <span>{engineTrack.citation}</span>
                </article>
                <article>
                  <small>Agent 유형 판정</small>
                  <strong>혼합형</strong>
                  <p>규칙 대조 + 비정형 문서 해석</p>
                  <span>에이전트 개발 표준체계 0.4절</span>
                </article>
                <article>
                  <small>자율성 정합성</small>
                  <strong>{autonomyDraft} · 정합</strong>
                  <p>{autonomyDraft === "L0" ? "정보 제공·조회만" : "사람 검토 범위 확인"}</p>
                  <span>자율성-트랙 기준표</span>
                </article>
                <article className="engine-recommendation">
                  <small>엔진 권고 · 참고용</small>
                  <strong>{engineRecommendation}</strong>
                  <p>
                    {engineRoi.computed
                      ? "대안 배제와 정량 효과가 확인되었습니다."
                      : "To-Be 처리시간 확보 후 ROI를 다시 계산해야 합니다."}
                  </p>
                  <span>최종 결정은 최병두 팀장이 G1에서 확정</span>
                </article>
              </div>
              <div className="engine-assurance">
                <div className="guardrail-list" aria-label="금칙 검사 결과">
                  {engineGuardrails.map(([id, label, passed]) => (
                    <span key={id} className={passed ? "passed" : "waiting"}>
                      {passed ? <Check size={12} weight="bold" /> : "…"}
                      <b>{id}</b> {label}
                    </span>
                  ))}
                </div>
                <div className="engine-readiness">
                  <span>
                    <b>규칙 회귀 40/40</b>
                    <small>인계 기준 확인</small>
                  </span>
                  <span className="blocked">
                    <b>리뷰어 정답 라벨 0/15</b>
                    <small>완료 전 G3 배포 승인 불가</small>
                  </span>
                </div>
              </div>
            </section>
            <fieldset className="fea-grid" disabled={!canEditFea}>
              <article>
                <header>
                  <span>01</span>
                  <div>
                    <h3>요구 요약</h3>
                    <p>에이전트 요구 접수서[INT] 핵심 내용을 3줄로 요약</p>
                  </div>
                  <Pill tone="green">완료</Pill>
                </header>
                <textarea
                  disabled={!canEditFea}
                  defaultValue={`${current.work}. ${current.volume}. ${current.outcome}.`}
                />
              </article>
              <article>
                <header>
                  <span>02</span>
                  <div>
                    <h3>대안 검토</h3>
                    <p>
                      낮은 비용의 대안부터 순서대로 검토하고 근거를 남깁니다.
                    </p>
                  </div>
                  <Pill tone="blue">4건 필수</Pill>
                </header>
                <div className="alternative-list">
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>
                      <b>프로세스·규정 개선</b>
                      <small>{alternativeFindings[0]}</small>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>
                      <b>기존 시스템 기능·설정</b>
                      <small>{alternativeFindings[1]}</small>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>
                      <b>매크로·Excel</b>
                      <small>{alternativeFindings[2]}</small>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>
                      <b>단순 LLM 챗·검색</b>
                      <small>{alternativeFindings[3]}</small>
                    </span>
                  </label>
                </div>
                <label className="fea-conclusion">
                  에이전트 개발이 타당한 이유
                  <textarea defaultValue={feaConclusion} />
                </label>
              </article>
              <article>
                <header>
                  <span>03</span>
                  <div>
                    <h3>Agent 적합성 진단</h3>
                    <p>표준 5개 항목을 각각 상·중·하로 판단합니다.</p>
                  </div>
                  <Pill tone="green">적합</Pill>
                </header>
                <div className="fit-scores">
                  <label>
                    판단 규칙 문서화 <b>높음</b>
                    <span>
                      <i style={{ width: "81%" }} />
                    </span>
                  </label>
                  <label>
                    데이터 접근성 <b>중간</b>
                    <span>
                      <i style={{ width: "62%" }} />
                    </span>
                  </label>
                  <label>
                    오류 허용도 <b>중간</b>
                    <span>
                      <i style={{ width: "55%" }} />
                    </span>
                  </label>
                  <label>
                    반복성·볼륨 <b>높음</b>
                    <span>
                      <i style={{ width: "88%" }} />
                    </span>
                  </label>
                  <label>
                    정치적 이슈 <b>낮음</b>
                    <span>
                      <i style={{ width: "24%" }} />
                    </span>
                  </label>
                </div>
              </article>
              <article>
                <header>
                  <span>04</span>
                  <div>
                    <h3>기대효과·ROI</h3>
                    <p>절감·품질·개발비를 함께 비교합니다.</p>
                  </div>
                  <Pill tone="violet">산출</Pill>
                </header>
                <div className="roi-box">
                  <div>
                    <small>확보된 As-Is</small>
                    <b>{current.countPerMonth}건 × {current.minutesPerCase}분 × {current.people}명</b>
                    <p>
                      월 {Math.round((current.countPerMonth * current.minutesPerCase * current.people) / 6) / 10}시간
                    </p>
                  </div>
                  <span>→</span>
                  <div>
                    <small>To-Be 시간/건 · 필수</small>
                    <label className="roi-input">
                      <input
                        type="number"
                        min="0"
                        value={toBeMinutes}
                        onChange={(event) => setToBeMinutes(event.target.value)}
                        placeholder="⬜ 미확보"
                      />
                      <span>분</span>
                    </label>
                    <p>인터뷰에서 확인한 값만 입력</p>
                  </div>
                  <div className={engineRoi.computed ? "roi-computed" : "roi-missing"}>
                    <small>규칙 계산 결과</small>
                    <b>
                      {engineRoi.computed
                        ? `월 ${engineRoi.savedHours}시간 절감`
                        : "⬜ 미확보"}
                    </b>
                    <p>
                      {engineRoi.computed
                        ? `연 ${engineRoi.savedHoursYear}시간 · ${engineRoi.savedMdYear} M/D`
                        : engineRoi.reason}
                    </p>
                  </div>
                  <div>
                    <small>개발 비용</small>
                    <b>⬜ 미확보</b>
                    <p>담당자가 확인한 인력 M/D·플랫폼/API 비용만 입력</p>
                  </div>
                </div>
                {engineRoi.computed && (
                  <p className="roi-rule-footnote">
                    <CheckCircle size={15} weight="fill" /> {engineRoi.formula} = 월 {engineRoi.savedHours}시간 절감 · 표준체계 문서② 4번
                  </p>
                )}
              </article>
              <article>
                <header>
                  <span>05</span>
                  <div>
                    <h3>위험 식별·유형·트랙 판정</h3>
                    <p>권한·데이터·사용 범위·최대 피해를 근거로 분류합니다.</p>
                  </div>
                  <Pill tone={trackDraft === "HIGH" ? "red" : trackDraft === "MEDIUM" ? "orange" : "green"}>
                    {engineTrack.label} 트랙 · 규칙 판정
                  </Pill>
                </header>
                <div className="fea-risk-fields">
                  <label>
                    쓰기·실행 권한
                    <select
                      value={riskWriteExec ? "YES" : "NO"}
                      onChange={(event) => setRiskWriteExec(event.target.value === "YES")}
                    >
                      <option value="NO">아니오</option>
                      <option value="YES">예</option>
                    </select>
                  </label>
                  <label>
                    개인정보·기밀 취급
                    <select
                      value={riskSensitive ? "YES" : "NO"}
                      onChange={(event) => setRiskSensitive(event.target.value === "YES")}
                    >
                      <option value="NO">아니오</option>
                      <option value="YES">예 · 마스킹 필요</option>
                    </select>
                  </label>
                  <label>
                    사용 범위
                    <select
                      value={riskScope}
                      onChange={(event) => setRiskScope(event.target.value)}
                    >
                      <option value="PERSONAL">개인</option>
                      <option value="TEAM">팀</option>
                      <option value="DEPT">부서</option>
                      <option value="COMPANY">전사</option>
                    </select>
                  </label>
                  <label>
                    오답의 최대 피해
                    <select
                      value={riskDamageFinancial ? "YES" : "NO"}
                      onChange={(event) => setRiskDamageFinancial(event.target.value === "YES")}
                    >
                      <option value="NO">운영상 불편 · 사람 검토로 회복 가능</option>
                      <option value="YES">금전 손실·법적 문제로 이어질 수 있음</option>
                    </select>
                  </label>
                </div>
                <div className="classification">
                  <label>
                    Agent 유형
                    <select defaultValue="HYBRID">
                      <option value="AI">AI Agent · 판단형</option>
                      <option value="RULE">업무지원 Agent · 규칙형</option>
                      <option value="HYBRID">혼합형</option>
                    </select>
                  </label>
                  <label>
                    트랙
                    <select value={trackDraft} disabled>
                      <option value="LOW">하</option>
                      <option value="MEDIUM">중</option>
                      <option value="HIGH">상</option>
                    </select>
                  </label>
                  <label>
                    자율성 초안
                    <select
                      value={autonomyDraft}
                      onChange={(event) =>
                        updateAutonomyDraft(event.target.value)
                      }
                    >
                      <option>L0</option>
                      <option>L1</option>
                      <option>L2</option>
                      <option>L3</option>
                      <option>L4</option>
                    </select>
                  </label>
                </div>
                {["L2", "L3", "L4"].includes(autonomyDraft) && (
                  <p className="track-enforcement-note">
                    <ShieldCheck size={16} weight="fill" /> L2 이상은 표준체계에
                    따라 상 트랙·정보보호 추가 승인으로 고정됩니다.
                  </p>
                )}
                <p className="engine-rule-note">
                  <Info size={15} weight="fill" /> 트랙은 5개 응답을 전건 검사해 자동 산출합니다. 작성자가 직접 낮출 수 없습니다.
                </p>
              </article>
              <article className="decision-card fea-g1-link">
                <header>
                  <span>06</span>
                  <div>
                    <h3>G1 판정 결과</h3>
                    <p>
                      팀장이 착수 승인 단계에서 결정하면 이 문서에 자동 반영
                    </p>
                  </div>
                  <Pill
                    tone={
                      !resolvedG1
                        ? "orange"
                        : resolvedG1.decision === "DROP"
                          ? "red"
                          : resolvedG1.decision === "GO"
                            ? "green"
                            : "orange"
                    }
                  >
                    {!resolvedG1
                      ? "판정 대기"
                      : resolvedG1.decision === "CONDITIONAL"
                        ? "Conditional Go"
                        : resolvedG1.decision === "DROP"
                          ? "Drop"
                          : "Go"}
                  </Pill>
                </header>
                <div className="fea-g1-placeholder">
                  <ShieldCheck size={24} weight="duotone" />
                  <div>
                    <b>
                      {resolvedG1
                        ? `${resolvedG1.decision === "CONDITIONAL" ? "Conditional Go" : resolvedG1.decision === "DROP" ? "Drop" : "Go"} · 개발 담당 ${resolvedG1.assignee}`
                        : "FEA 작성과 G1 승인을 분리합니다."}
                    </b>
                    <p>
                      {resolvedG1
                        ? `${resolvedG1.reason || "FEA의 타당성·대안·효과·위험 근거를 검토해 결정했습니다."} · 승인자 최병두 팀장 · 2026.08.28`
                        : "담당자는 인터뷰 근거와 타당성 평가 항목을 완성합니다. 최병두 팀장이 G1에서 추진 여부와 개발 담당자를 확정하면 판정·사유·승인일이 이 영역에 기록됩니다."}
                    </p>
                  </div>
                </div>
              </article>
            </fieldset>
            <footer className="g1-action">
              <div>
                <span className="go-route">FEA</span>
                <p>
                  <b>
                    {canEditFea
                      ? "인터뷰 결과를 반영해 타당성 평가서를 작성 완료하세요."
                      : "담당자가 작성한 타당성 평가서를 확인했습니다."}
                  </b>
                  <small>
                    작성 완료 후 G1 착수 승인에서 팀장이 추진 여부와 개발
                    담당자를 결정합니다.
                  </small>
                </p>
              </div>
              {canEditFea && (
                <button
                  className="primary"
                  onClick={() =>
                    notify(
                      "타당성 평가서[FEA] 작성이 완료되어 G1 착수 승인 대기로 이동했습니다.",
                    )
                  }
                >
                  FEA 작성 완료 · G1 요청
                </button>
              )}
            </footer>
          </section>
          <GateApprovalResult
            gate="G1"
            projectNo={current.no}
            role={role}
            notify={notify}
            basisReady={!(["2026-031", "2026-033"] as string[]).includes(current.no)}
            onG1Resolved={(decision, assignee, reason) =>
              setResolvedG1({ decision, assignee, reason })
            }
          />
        </>
      )}
    </div>
  );
}

function RequirementDefinition({
  role,
  notify,
  goDelivery,
  projectNo,
}: {
  role: string;
  notify: (s: string) => void;
  goDelivery: () => void;
  projectNo?: string;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isAiTeamMember = role === ACCOUNT_ROLES.member;
  const [ardStep, setArdStep] = useState(4);
  const [chatInput, setChatInput] = useState("");
  const [selectedArd, setSelectedArd] = useState(
    projectNo === "2026-026"
      ? 1
      : projectNo === "2026-028" || role === ACCOUNT_ROLES.member
        ? 2
        : 0,
  );
  const [expandedArdSection, setExpandedArdSection] = useState<number | null>(1);
  const [assignee, setAssignee] = useState("미배정");
  const [g2Decision, setG2Decision] = useState<"GO" | "CONDITIONAL" | "DROP">(
    "GO",
  );
  const [formalDeadline, setFormalDeadline] = useState("2026-09-30");
  const [deadlineApproval, setDeadlineApproval] = useState<
    "PENDING" | "APPROVED" | "REJECTED"
  >("PENDING");
  const ardQueue = [
    {
      no: "2026-024",
      name: "구매계약 검토 Agent",
      requester: "김민지",
      dept: "구매팀",
      submitted: "8.11 16:20",
      score: 96,
      change: "범위 확대",
      signatures: 2,
      oneLine:
        "계약 조항을 기준 문서와 대조해 위험 조항과 검토 의견 초안을 제시한다.",
      scope: "L1 · 검토 의견 초안 / 계약 승인·전송 제외",
      success: "검토 90→30분 · 평가셋 80건 재현율 95%",
      intScope: "표준계약서와의 차이 확인",
      ardScope: "차이 확인 + 위험도 분류 + 검토 의견 초안",
    },
    {
      no: "2026-026",
      name: "SAP 사용자 가이드 Agent",
      requester: "박수현",
      dept: "IT혁신팀",
      submitted: "8.12 09:10",
      score: 82,
      change: "경미",
      signatures: 1,
      oneLine:
        "사용자의 SAP 업무 질문에 승인된 매뉴얼 근거와 처리 절차를 안내한다.",
      scope: "L0 · 정보 안내 / 시스템 실행 제외",
      success: "문의 해결률 80% · 근거 제시율 100%",
      intScope: "SAP 전환 매뉴얼 검색",
      ardScope: "업무 질문 분류 + 매뉴얼 근거 답변",
    },
    {
      no: "2026-028",
      name: "출장 규정 문의 Agent",
      requester: "이도윤",
      dept: "경영지원팀",
      submitted: "8.12 10:05",
      score: 74,
      change: "재검토 필요",
      signatures: 2,
      oneLine:
        "출장 규정 근거를 찾아 비용 한도를 안내하고 기안 초안을 생성한다.",
      scope: "L1 · 초안 생성까지 / 최종 제출·승인 제외",
      success: "작성 30→10분 · 평가셋 50건 정확도 90%",
      intScope: "출장 규정 검색 및 비용 한도 안내",
      ardScope: "규정 검색 + 기안 초안 생성, 제출 제외",
    },
  ];
  const current = ardQueue[selectedArd];
  const currentRelationships = getProjectRelationships(role, current.no);
  const isAssignedDeveloper = currentRelationships.includes("DEVELOPER");
  const isRequester = currentRelationships.includes("REQUESTER");
  const isOwner = currentRelationships.includes("OWNER") && !isRequester;
  const canEditArd = isAssignedDeveloper || isRequester;
  const isReviewRole = isLeader || !canEditArd;
  const ardSectionDetails = [
    "이 에이전트는 출장 신청 직원이 규정을 확인하고 기안할 때 승인된 근거를 찾아 비용 한도와 초안을 제공하며, 요구자·오너·개발·운영 책임자를 명시합니다.",
    "현행 프로세스는 요청 유형 확인 → 규정 검색 → 비용 한도 계산 → 첨부자료 확인 → 기안 작성 순서입니다. 단계 수는 케이스별로 자유롭게 기록하며, Pain Point와 처리시간·월 건수 Baseline도 함께 남깁니다.",
    "에이전트가 규정 검색·비용 계산·기안 초안을 담당하고 사용자가 근거와 금액을 확인합니다. 최종 제출과 승인은 Out of Scope입니다.",
    "L1 초안 생성 수준입니다. 모든 결과는 사용자가 검토한 뒤 사용하며, 운영 3개월 정확도와 오류율이 기준을 충족할 때만 상향을 재검토합니다.",
    "FR-01 규정 검색, FR-02 비용 한도 계산, FR-03 필수 첨부 확인, FR-04 기안 초안 생성으로 구성하며 각 요구에 입력 → Agent 행동 → 출력을 기록합니다.",
    "출장 규정·FAQ·비용 기준표를 참조하고 경영지원팀 규정 담당자가 개정 시 지식을 갱신합니다. 승인된 읽기 전용 자료만 사용합니다.",
    "작성시간 30분→10분, 평가셋 50건 정확도 90% 이상, 근거 제시율 100%, 금칙 위반 0건을 배포 기준으로 적용합니다.",
    "오답·지식 최신성 오류·범위 밖 질문·프롬프트 주입을 필수 실패 유형으로 기록하고, 답변 보류·담당자 이관·입력 차단 방식을 각각 연결합니다.",
  ];
  const advanceArd = () => {
    if (!chatInput.trim() && ardStep < 8) {
      notify("답변을 입력하거나 예시 답변을 선택해 주세요.");
      return;
    }
    setChatInput("");
    setArdStep(Math.min(8, ardStep + 1));
    notify("답변이 에이전트 요구사항 정의서[ARD] 초안에 반영되었습니다.");
  };
  const confirmG2 = () => {
    if (assignee === "미배정" && g2Decision !== "DROP") {
      notify("개발 착수 전에 AI활성화팀 담당자를 배정해 주세요.");
      return;
    }
    notify(
      g2Decision === "GO"
        ? "개발 착수 판정이 저장되었습니다. 3자 서명 완료 후 G2가 통과됩니다."
        : g2Decision === "CONDITIONAL"
          ? "보완 조건과 Conditional Go 판정이 저장되었습니다."
          : "Drop 사유가 기록되고 분기 재검토 후보로 전환되었습니다.",
    );
  };

  return (
    <div className="page requirement-page">
      <section className="page-heading intake-heading">
        <div>
          <p className="eyebrow">02 · REQUIREMENT DEFINITION</p>
          <h1>요구 정의</h1>
          <p>
            {isOwner
              ? "현업 Owner는 작성된 업무 범위와 운영 책임을 조회합니다. G2 공식 서명자는 요구자·개발 담당자·AI활성화팀장입니다."
              : isLeader
                ? "요구자와 지정 개발 담당자가 함께 작성한 에이전트 요구사항 정의서[ARD] 결과를 확인하고 G2 승인 또는 보완 요청을 결정합니다."
                : isAssignedDeveloper
                  ? "G1에서 지정된 개발 담당자로서 현업 요구자와 미팅하며 ARD를 함께 작성하고 G2에 서명합니다."
                  : isOwner
                    ? "프로젝트 Owner로서 ARD의 업무 범위·성공 기준·운영 책임을 조회합니다."
                    : "G1에서 지정된 개발 담당자와 업무 범위·성공 기준을 함께 정의하고 ARD를 완성한 뒤 G2에 서명합니다."}
          </p>
        </div>
        <div className="perspective-switch account-context" aria-label="현재 계정과 프로젝트 역할">
          <span>현재 권한</span>
          <b>
            {isLeader
              ? "AI 활성화팀 팀장"
              : isAiTeamMember
                ? projectRelationshipLabel(role, current.no) || "AI 활성화팀 팀원 · 조회"
                : projectRelationshipLabel(role, current.no) || "일반 User"}
          </b>
        </div>
      </section>
      <LifecycleRoleGuide role={role} stage="definition" projectNo={current.no} />
      <section
        className="intake-stage-line definition-stage-line"
        aria-label="요구 정의 진행 단계"
      >
        <div className="done">
          <span>1</span>
          <p>
            <b>에이전트 요구 접수서[INT]</b>
            <small>G1 승인 완료</small>
          </p>
        </div>
        <i />
        <div className="active">
          <span>2</span>
          <p>
            <b>에이전트 요구사항 정의서[ARD]</b>
            <small>Agent 작성·검토</small>
          </p>
        </div>
        <i />
        <div
          className={
            isLeader || canEditArd ? "active" : ""
          }
        >
          <span>G2</span>
          <p>
            <b>개발 착수 승인</b>
            <small>요구자·개발 담당·AI팀장</small>
          </p>
        </div>
        <i />
        <div>
          <span>3</span>
          <p>
            <b>에이전트 설계서[DES]</b>
            <small>G2 통과 후</small>
          </p>
        </div>
      </section>
      <section
        className="project-schedule-strip workflow-schedule-strip"
        aria-label="선택 과제 일정과 착수 판정"
      >
        <div>
          <CalendarBlank size={17} weight="duotone" />
          <p>
            <small>요청 시 희망 완료일</small>
            <b>2026.09.30</b>
          </p>
        </div>
        <ArrowRight size={14} weight="bold" />
        <div>
          <Target size={17} weight="duotone" />
          <p>
            <small>확정 프로젝트 마감일</small>
            <b>2026.09.25</b>
          </p>
        </div>
        <div className="schedule-g1-status go">
          <CheckCircle size={17} weight="fill" />
          <p>
            <small>G1 착수 판정</small>
            <b>Go</b>
          </p>
        </div>
        <Pill tone="green">개발 담당 허정환</Pill>
      </section>

      {!isReviewRole ? (
        <>
          <section className="definition-context panel">
            <div>
              <Pill tone="green">G1 Go · 담당 지정</Pill>
              <strong>2026-028 · 출장 규정 문의 Agent</strong>
              <p>
                요구자 김현우와 개발 담당 허정환이 함께 미팅하며 세부 업무
                범위와 평가 기준을 정의합니다.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                notify(
                  "에이전트 요구 접수서[INT]와 타당성 평가서[FEA] 승인 의견을 열었습니다.",
                )
              }
            >
              에이전트 요구 접수서[INT] · 타당성 평가서[FEA] 보기
            </button>
          </section>
          <section
            className="definition-collaborators"
            aria-label="요구 정의 공동 작성자"
          >
            <div>
              <span>요</span>
              <p>
                <small>현업 요구자</small>
                <b>김현우 · 업무 기준·정답 정의</b>
              </p>
            </div>
            <i />
            <div>
              <span>개</span>
              <p>
                <small>개발 담당자</small>
                <b>허정환 · 범위·기능·평가 기준 문서화</b>
              </p>
            </div>
            <Pill tone="blue">공동 작성 중</Pill>
          </section>
          <section className="user-definition-grid">
            <article className="panel agent-conversation ard-conversation">
              <header>
                <span className="agent-face">정의</span>
                <div>
                  <strong>요구 정의 Agent</strong>
                  <p>
                    답변을 업무·평가 언어로 정리해 에이전트 요구사항
                    정의서[ARD]에 반영합니다.
                  </p>
                </div>
                <Pill tone="green">온라인</Pill>
              </header>
              <div className="chat-progress">
                <span style={{ width: `${ardStep * 12.5}%` }} />
                <small>
                  에이전트 요구사항 정의서[ARD] 핵심영역 {ardStep}/8 정의
                </small>
              </div>
              <div className="chat-thread">
                <div className="agent-msg">
                  <b>요구 정의 Agent</b>
                  <p>
                    G1 승인 내용을 확인했습니다. 현재 직원이 출장 규정을
                    검색하고 기안 초안을 만드는 데 평균 30분이 걸리는 것으로
                    정리되어 있어요.
                  </p>
                </div>
                <div className="user-msg">
                  <p>
                    규정 검색뿐 아니라 출장 유형에 맞는 비용 한도와 필수
                    첨부자료도 안내했으면 합니다.
                  </p>
                </div>
                <div className="agent-msg">
                  <b>요구 정의 Agent</b>
                  <p>
                    좋습니다. 그럼 Agent의 행동 범위를 정해볼게요. 직원 대신
                    기안을 제출하거나 승인 요청까지 실행해야 하나요?
                  </p>
                  <div className="quick-replies">
                    <button
                      onClick={() =>
                        setChatInput(
                          "아니요. 정보 제공과 기안 초안 생성까지만 합니다.",
                        )
                      }
                    >
                      초안까지만
                    </button>
                    <button
                      onClick={() =>
                        setChatInput("사람 승인 후 제출까지 제안합니다.")
                      }
                    >
                      승인 후 제출
                    </button>
                  </div>
                </div>
                {ardStep > 4 && (
                  <div className="user-msg">
                    <p>
                      정보 제공과 기안 초안 생성까지만 하고, 최종 확인과 제출은
                      사용자가 합니다.
                    </p>
                  </div>
                )}
                {ardStep > 4 && (
                  <div className="agent-msg">
                    <b>요구 정의 Agent</b>
                    <p>
                      자율성은 L1이 적합합니다. 다음으로 성공 기준을 수치로
                      정하겠습니다. 작성 시간과 답변 정확도 목표를 알려주세요.
                    </p>
                  </div>
                )}
              </div>
              <footer>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") advanceArd();
                  }}
                  placeholder="업무 내용을 편하게 설명해 주세요"
                  aria-label="요구 정의 답변"
                />
                <button onClick={advanceArd}>전송</button>
              </footer>
            </article>

            <article className="panel ard-draft">
              <header>
                <div>
                  <Pill tone="blue">자동 작성 중</Pill>
                  <h2>에이전트 요구사항 정의서[ARD]</h2>
                  <p>2026-028-ARD · v0.7</p>
                </div>
                <span>{Math.round(ardStep * 12.5)}%</span>
              </header>
              <div className="ard-checklist">
                {[
                  ["01", "개요·이해관계자", "출장 신청 직원 · 경영지원팀"],
                  ["02", "As-Is · Baseline", "평균 30분 · 월 120건"],
                  [
                    "03",
                    "To-Be · In/Out Scope",
                    ardStep > 4
                      ? "초안 생성까지 · 제출 제외"
                      : "대화로 정의 중",
                  ],
                  [
                    "04",
                    "자율성 수준",
                    ardStep > 4 ? "L1 · 전건 사용자 검토" : "정의 필요",
                  ],
                  ["05", "기능 요구사항", "입력 → 행동 → 출력 3요소"],
                  ["06", "지식·데이터", "출장 규정 · 경영지원팀 갱신"],
                  [
                    "07",
                    "성공·평가 기준",
                    ardStep > 6 ? "작성 10분 · 정확도 90%" : "수치 목표 필요",
                  ],
                  [
                    "08",
                    "실패 시나리오",
                    ardStep === 8
                      ? "필수 4종 및 대응 완료"
                      : `${Math.max(0, ardStep - 4)}/4 작성`,
                  ],
                ].map((item, i) => (
                  <section
                    className={
                      i < ardStep
                        ? "complete"
                        : i === ardStep
                          ? "current"
                          : "waiting"
                    }
                    key={item[0]}
                  >
                    <button
                      type="button"
                      aria-expanded={expandedArdSection === i}
                      onClick={() =>
                        setExpandedArdSection((currentSection) =>
                          currentSection === i ? null : i,
                        )
                      }
                    >
                      <span>{item[0]}</span>
                      <p>
                        <small>{item[1]}</small>
                        <b>{item[2]}</b>
                      </p>
                      <i>
                        {expandedArdSection === i
                          ? "접기 ↑"
                          : i < ardStep
                            ? "완료 ›"
                            : i === ardStep
                              ? "작성 중 ›"
                              : "예정 ›"}
                      </i>
                    </button>
                    {expandedArdSection === i && (
                      <div className="ard-section-detail">
                        <small>{item[0]} 상세 내용</small>
                        <p>{ardSectionDetails[i]}</p>
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <div className="ard-blocker">
                <span>!</span>
                <p>
                  <b>개발 전 반드시 확정</b>
                  <br />
                  자율성 · 성공 기준 · Out of Scope · 실패 시나리오 4종
                </p>
              </div>
              <button
                className="primary draft-submit"
                onClick={() =>
                  notify(
                    ardStep < 8
                      ? "핵심영역을 모두 정의한 뒤 에이전트 요구사항 정의서[ARD] 검토를 요청할 수 있습니다."
                      : "에이전트 요구사항 정의서[ARD]가 제출되어 최병두 팀장님의 검토 대기 상태가 되었습니다.",
                  )
                }
              >
                {ardStep < 8
                  ? "Agent와 정의 계속하기"
                  : "에이전트 요구사항 정의서[ARD] 확인 후 검토 요청"}
              </button>
            </article>
          </section>
          <section className="panel my-intake-status definition-status">
            <div className="panel-title">
              <div>
                <h2>내 요구 정의 현황</h2>
                <p>
                  에이전트 요구사항 정의서[ARD] 제출 후 담당자 배정과 G2
                  판정·3자 서명 상태를 확인합니다.
                </p>
              </div>
              <button className="text-link">전체 보기</button>
            </div>
            <div className="status-cards">
              <button onClick={goDelivery}>
                <span className="status-icon approved">✓</span>
                <div>
                  <small>2026-021 · G2 승인</small>
                  <strong>생산 품질 이슈 분석 Agent</strong>
                  <p>담당 허정환 · 3자 서명 완료</p>
                </div>
                <Pill tone="green">설계·개발로 이동</Pill>
                <b>›</b>
              </button>
              <button
                onClick={() => notify("담당자 배정 및 서명 현황을 열었습니다.")}
              >
                <span className="status-icon pending">⌛</span>
                <div>
                  <small>2026-024 · G2 서명 중</small>
                  <strong>구매계약 검토 Agent</strong>
                  <p>담당 이재승 · 2/3 서명</p>
                </div>
                <Pill tone="violet">서명 대기</Pill>
                <b>›</b>
              </button>
              <button
                onClick={() => notify("Conditional Go 보완 의견을 열었습니다.")}
              >
                <span className="status-icon rejected">!</span>
                <div>
                  <small>2026-026 · 보완 필요</small>
                  <strong>SAP 사용자 가이드 Agent</strong>
                  <p>범위·평가셋 보완 후 재검토</p>
                </div>
                <Pill tone="orange">Conditional Go</Pill>
                <b>›</b>
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="leader-definition-grid">
            <article className="panel review-queue">
              <div className="panel-title">
                <div>
                  <h2>에이전트 요구사항 정의서[ARD] 검토 대기</h2>
                  <p>
                    에이전트 요구 접수서[INT] 대비 변경과 G2 준비도를 우선 확인
                  </p>
                </div>
                <Pill tone="violet">3건</Pill>
              </div>
              <div>
                {ardQueue.map((item, i) => (
                  <button
                    key={item.no}
                    className={selectedArd === i ? "selected" : ""}
                    onClick={() => {
                      setSelectedArd(i);
                      setAssignee("미배정");
                    }}
                  >
                    <span
                      className={`queue-score ${item.score >= 85 ? "good" : ""}`}
                    >
                      {item.score}
                    </span>
                    <div>
                      <small>
                        {item.no}-ARD · {item.submitted}
                      </small>
                      <strong>{item.name}</strong>
                      <p>
                        {item.dept} {item.requester} · 서명 {item.signatures}/3
                      </p>
                    </div>
                    <Pill
                      tone={
                        item.change === "경미"
                          ? "green"
                          : item.change === "범위 확대"
                            ? "orange"
                            : "red"
                      }
                    >
                      {item.change}
                    </Pill>
                  </button>
                ))}
              </div>
            </article>
            <article className="panel ard-review-document">
              <header>
                <div>
                  <Pill tone="blue">{current.no}-ARD</Pill>
                  <h2>{current.name}</h2>
                  <p>
                    {current.requester} · {current.dept} · 에이전트 요구사항
                    정의서[ARD] v0.9
                  </p>
                </div>
                <div>
                  <button
                    className="secondary"
                    onClick={() =>
                      notify(
                        "에이전트 요구 접수서[INT]·타당성 평가서[FEA]와 에이전트 요구사항 정의서[ARD] 비교보기를 열었습니다.",
                      )
                    }
                  >
                    에이전트 요구 접수서[INT] ↔ 에이전트 요구사항 정의서[ARD]
                    비교
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      notify(
                        "에이전트 요구사항 정의서[ARD] 원문 전체보기를 열었습니다.",
                      )
                    }
                  >
                    에이전트 요구사항 정의서[ARD] 원문
                  </button>
                </div>
              </header>
              <div className="ard-review-summary">
                <div>
                  <small>한 줄 정의</small>
                  <p>{current.oneLine}</p>
                </div>
                <div>
                  <small>범위·자율성</small>
                  <p>{current.scope}</p>
                </div>
                <div>
                  <small>성공 기준</small>
                  <p>{current.success}</p>
                </div>
                <div>
                  <small>실패 대응</small>
                  <p>
                    오답·최신성·범위 밖·프롬프트 주입 <b>4/4</b>
                  </p>
                </div>
              </div>
              <div className="int-ard-diff">
                <div>
                  <span>에이전트 요구 접수서[INT]</span>
                  <p>
                    <b>초기 범위</b>
                    <br />
                    {current.intScope}
                  </p>
                </div>
                <b>→</b>
                <div className={current.change !== "경미" ? "changed" : ""}>
                  <span>에이전트 요구사항 정의서[ARD]</span>
                  <p>
                    <b>정의된 범위</b>
                    <br />
                    {current.ardScope}
                  </p>
                </div>
                <Pill tone={current.change === "경미" ? "green" : "orange"}>
                  {current.change}
                </Pill>
              </div>
              <div className="g2-readiness">
                <div>
                  <span>에이전트 요구사항 정의서[ARD] 필수항목</span>
                  <b>{current.score}%</b>
                  <Progress value={current.score} />
                </div>
                <div>
                  <span>3자 승인</span>
                  <b>{current.signatures}/3</b>
                  <div className="signature-row">
                    <i className="signed">요구자 ✓</i>
                    <i className={current.signatures > 1 ? "signed" : ""}>
                      개발 담당자 {current.signatures > 1 ? "✓" : "대기"}
                    </i>
                    <i>AI활성화팀장 대기</i>
                  </div>
                </div>
              </div>
            </article>
          </section>

          {isLeader && false && (
            <section className="panel g2-workspace legacy-g2-workspace">
              <div className="fea-head">
                <div>
                  <p className="eyebrow">{current.no}-ARD · G2 REVIEW</p>
                  <h2>담당자 배정 · 개발 착수 판정</h2>
                  <p>
                    에이전트 요구사항 정의서[ARD]의 정의 품질과 에이전트 요구
                    접수서[INT]·타당성 평가서[FEA] 대비 변경을 확인하고 다음
                    경로를 확정합니다.
                  </p>
                </div>
                <div>
                  <span>최종 검토자 최병두 팀장</span>
                  <button
                    className="secondary"
                    onClick={() => notify("G2 검토 내용을 임시저장했습니다.")}
                  >
                    임시 저장
                  </button>
                </div>
              </div>
              <div className="g2-form-grid">
                <article>
                  <header>
                    <span>01</span>
                    <div>
                      <h3>AI활성화팀 담당자 배정</h3>
                      <p>설계·개발과 문서 작성을 책임질 PIC</p>
                    </div>
                    <Pill tone={assignee === "미배정" ? "orange" : "green"}>
                      {assignee}
                    </Pill>
                  </header>
                  <label className="assignee-select">
                    개발 담당
                    <select
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    >
                      <option>미배정</option>
                      <option>허정환</option>
                      <option>이재승</option>
                      <option>김서연</option>
                    </select>
                  </label>
                  <div className="capacity-list">
                    <span>
                      허정환 <b>진행 2</b>
                    </span>
                    <span>
                      이재승 <b>진행 3</b>
                    </span>
                    <span>
                      김서연 <b>진행 1</b>
                    </span>
                  </div>
                </article>
                <article>
                  <header>
                    <span>02</span>
                    <div>
                      <h3>
                        에이전트 요구 접수서[INT]·타당성 평가서[FEA] 대비 변경
                        검토
                      </h3>
                      <p>초기 판단을 무효화할 수준인지 확인</p>
                    </div>
                    <Pill tone={current.change === "경미" ? "green" : "orange"}>
                      {current.change}
                    </Pill>
                  </header>
                  <div className="change-checks">
                    <label>
                      <input type="checkbox" defaultChecked /> 핵심 목적이 G1
                      승인 당시와 동일함
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        defaultChecked={current.change === "경미"}
                      />{" "}
                      데이터·권한 조건이 실현 가능함
                    </label>
                    <label>
                      <input type="checkbox" defaultChecked /> 타당성
                      평가서[FEA]의 기대효과가 여전히 유효함
                    </label>
                  </div>
                  <textarea placeholder="범위 변경 또는 불가 판단 근거를 기록하세요." />
                </article>
                <article className="g2-decision-card">
                  <header>
                    <span>03</span>
                    <div>
                      <h3>G2 개발 착수 판정</h3>
                      <p>Go 외 판정은 사유와 후속 조치 필수</p>
                    </div>
                    <Pill
                      tone={
                        g2Decision === "GO"
                          ? "green"
                          : g2Decision === "DROP"
                            ? "red"
                            : "orange"
                      }
                    >
                      {g2Decision}
                    </Pill>
                  </header>
                  <div className="decision-options">
                    <button
                      className={g2Decision === "GO" ? "selected go" : ""}
                      onClick={() => setG2Decision("GO")}
                    >
                      <b>Go</b>
                      <small>담당 배정·3자 서명 → G2 통과</small>
                    </button>
                    <button
                      className={
                        g2Decision === "CONDITIONAL"
                          ? "selected conditional"
                          : ""
                      }
                      onClick={() => setG2Decision("CONDITIONAL")}
                    >
                      <b>Conditional Go</b>
                      <small>
                        보완 후 에이전트 요구사항 정의서[ARD] 재검토
                      </small>
                    </button>
                    <button
                      className={g2Decision === "DROP" ? "selected drop" : ""}
                      onClick={() => setG2Decision("DROP")}
                    >
                      <b>Drop</b>
                      <small>불가 근거 기록 → 분기 재검토</small>
                    </button>
                  </div>
                  <textarea
                    placeholder={
                      g2Decision === "GO"
                        ? "개발 착수 의견과 담당자 유의사항"
                        : g2Decision === "CONDITIONAL"
                          ? "보완해야 할 에이전트 요구사항 정의서[ARD] 항목과 완료 조건"
                          : "Drop 사유, 초기 판단과 달라진 점, 대안"
                    }
                  />
                </article>
                <article className="g2-schedule-card">
                  <header>
                    <span>04</span>
                    <div>
                      <h3>프로젝트 마감 일정 확정</h3>
                      <p>
                        요청자의 희망일을 검토해 G2에서 공식 마감일을 정합니다.
                      </p>
                    </div>
                    <Pill tone="blue">G2 필수</Pill>
                  </header>
                  <dl>
                    <div>
                      <dt>요청 시 희망 완료일</dt>
                      <dd>2026.09.25</dd>
                    </div>
                    <div>
                      <dt>프로젝트 마감일</dt>
                      <dd>
                        <input
                          type="date"
                          value={formalDeadline}
                          onChange={(event) =>
                            setFormalDeadline(event.target.value)
                          }
                        />
                      </dd>
                    </div>
                  </dl>
                  <div className="deadline-approval-request">
                    <div>
                      <small>마감일 변경 요청 · 2026.10.07</small>
                      <b>SAP API 권한 승인 일정 지연으로 7일 연장 요청</b>
                      <p>요청자 김민지 · 기존 마감 {formalDeadline}</p>
                    </div>
                    <Pill
                      tone={
                        deadlineApproval === "APPROVED"
                          ? "green"
                          : deadlineApproval === "REJECTED"
                            ? "red"
                            : "orange"
                      }
                    >
                      {deadlineApproval === "APPROVED"
                        ? "최병두 승인 완료"
                        : deadlineApproval === "REJECTED"
                          ? "반려"
                          : "팀장 승인 대기"}
                    </Pill>
                  </div>
                  {deadlineApproval === "PENDING" ? (
                    <div className="deadline-approval-actions">
                      <button
                        onClick={() => {
                          setDeadlineApproval("REJECTED");
                          notify("마감 일정 변경 요청을 반려했습니다.");
                        }}
                      >
                        변경 반려
                      </button>
                      <button
                        className="primary"
                        onClick={() => {
                          setDeadlineApproval("APPROVED");
                          setFormalDeadline("2026-10-07");
                          notify(
                            "최병두 팀장 승인으로 프로젝트 마감일이 2026.10.07로 변경되었습니다.",
                          );
                        }}
                      >
                        최병두 팀장 승인
                      </button>
                    </div>
                  ) : (
                    <p className="deadline-decision-note">
                      {deadlineApproval === "APPROVED"
                        ? "승인 기록이 남았고 확정 마감일이 변경되었습니다."
                        : "기존 마감일을 유지하며 반려 사유가 요청자에게 전달됩니다."}
                    </p>
                  )}
                </article>
              </div>
              <footer className="g1-action g2-action">
                <div>
                  <span
                    className={
                      g2Decision === "DROP" ? "drop-route" : "go-route"
                    }
                  >
                    {g2Decision === "DROP" ? "DROP" : "G2"}
                  </span>
                  <p>
                    <b>
                      {g2Decision === "GO"
                        ? "팀장 판정 후 3자 서명이 완료되어야 설계·개발로 이동"
                        : g2Decision === "CONDITIONAL"
                          ? "에이전트 요구사항 정의서[ARD] 보완 후 같은 G2 검토로 복귀"
                          : "개발 착수 중단 · 근거 보존 후 분기 재검토"}
                    </b>
                    <small>
                      G2 통과 전에는 에이전트 설계서[DES] 작성 및 개발 착수를
                      허용하지 않습니다.
                    </small>
                  </p>
                </div>
                <button className="primary" onClick={confirmG2}>
                  {g2Decision === "GO"
                    ? "담당 배정 · 착수 승인"
                    : g2Decision === "CONDITIONAL"
                      ? "조건부 판정 저장"
                      : "Drop 확정"}
                </button>
              </footer>
            </section>
          )}
        </>
      )}
      <GateApprovalResult
        gate="G2"
        projectNo={current.no}
        role={role}
        notify={notify}
      />
    </div>
  );
}

function DeliveryWorkplace({
  role,
  openHub,
  notify,
  embedded = false,
  embeddedSection = "delivery",
  projectNo,
  viewerMode = false,
  lifecycleState = "진행 중",
}: {
  role: string;
  openHub: () => void;
  notify: (s: string) => void;
  embedded?: boolean;
  embeddedSection?: "delivery" | "g3" | "pilot" | "g4";
  projectNo?: string;
  viewerMode?: boolean;
  lifecycleState?: string;
}) {
  const initialProject =
    projectNo === "2026-018"
      ? 1
      : projectNo === "2026-026"
        ? 2
        : projectNo === "2026-014"
          ? 3
          : projectNo === "2026-028"
            ? 4
            : projectNo === "2026-031"
              ? 5
              : 0;
  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [activeDoc, setActiveDoc] = useState<"DES" | "EVP" | "EVR">("DES");
  const [activeDocSection, setActiveDocSection] = useState<number | null>(
    lifecycleState === "생성 전" ? null : 0,
  );
  const [documentDrafts, setDocumentDrafts] = useState<
    Record<string, { body: string; evidence: string; reviewNote: string }>
  >({});
  const [savedDocumentSections, setSavedDocumentSections] = useState<
    Record<string, boolean>
  >({});
  const [completedDocuments, setCompletedDocuments] = useState<
    Record<string, boolean>
  >({});
  const [documentReviews, setDocumentReviews] = useState<
    Record<string, { note: string; status: "PENDING" | "APPROVED" | "REWORK" }>
  >({});
  const [releaseDocument, setReleaseDocument] = useState<"DEP" | "UG" | null>(
    null,
  );
  const [depDocumentDrafts, setDepDocumentDrafts] = useState<
    Record<
      string,
      {
        securityReview: string;
        emergencyPlan: string;
        knowledgeOwner: string;
        pilotAudience: string;
        pilotPeriod: string;
        feedbackMethod: string;
        exitCriteria: string;
        rolloutPlan: string;
        pilotUsage: string;
        pilotUsageRate: string;
        pilotErrors: string;
        pilotCriticalErrors: string;
        pilotSatisfaction: string;
        pilotFeedback: string;
        pilotDecision: string;
      }
    >
  >({});
  const [ugDocumentDrafts, setUgDocumentDrafts] = useState<
    Record<
      string,
      {
        intro: string;
        outOfScope: string;
        usageSteps: string;
        goodExamples: string;
        badExamples: string;
        caution: string;
        knowledgeDate: string;
        prohibitedInfo: string;
        channel: string;
        owner: string;
        reportingGuide: string;
      }
    >
  >({});
  const [savedReleaseDocuments, setSavedReleaseDocuments] = useState<
    Record<string, boolean>
  >({});
  const [g3Decision, setG3Decision] = useState<
    "PENDING" | "APPROVED" | "REWORK"
  >(projectNo === "2026-014" ? "APPROVED" : "PENDING");
  const [g4Decision, setG4Decision] = useState<
    "PENDING" | "APPROVED" | "EXTEND"
  >("PENDING");
  const [g3ReviewerApproved, setG3ReviewerApproved] = useState(
    projectNo === "2026-018" || projectNo === "2026-014",
  );
  const [reviewerAssignments, setReviewerAssignments] = useState<
    Record<string, string>
  >({
    "2026-018": "허정환",
    "2026-014": "허정환",
  });
  const [reviewerDrafts, setReviewerDrafts] = useState<Record<string, string>>(
    {},
  );
  const [g3SecurityApproved, setG3SecurityApproved] = useState(
    projectNo === "2026-018",
  );
  const [g4OwnerApproved, setG4OwnerApproved] = useState(false);
  const [g4ReviewReasons, setG4ReviewReasons] = useState<Record<string, string>>(
    {},
  );
  const [g4ReviewRounds, setG4ReviewRounds] = useState<Record<string, number>>(
    {},
  );
  const [depChecks, setDepChecks] = useState(() =>
    projectNo === "2026-014" || projectNo === "2026-018"
      ? Array(9).fill(true)
      : [false, true, true, true, true, true, true, false, false],
  );
  const deliveryProjects = [
    {
      no: "2026-021",
      name: "생산 품질 이슈 분석 Agent",
      dept: "품질혁신팀",
      owner: "박정민 팀장",
      builder: "허정환",
      reviewer: "미배정",
      track: "중",
      stage: "평가 진행",
      progress: 68,
      des: 88,
      evp: 100,
      evr: 64,
      cases: "32/40",
      pass: "92.5%",
      guardrail: "0건",
    },
    {
      no: "2026-018",
      name: "해외 출장기안 지원 Agent",
      dept: "경영지원팀",
      owner: "김도윤 팀장",
      builder: "이재승",
      reviewer: "허정환",
      track: "상",
      stage: "G3 검토",
      progress: 91,
      des: 100,
      evp: 100,
      evr: 100,
      cases: "50/50",
      pass: "96.0%",
      guardrail: "0건",
    },
    {
      no: "2026-026",
      name: "SAP 사용자 가이드 Agent",
      dept: "IT혁신팀",
      owner: "오세훈 팀장",
      builder: "김서연",
      reviewer: "미배정",
      track: "중",
      stage: "설계·개발",
      progress: 38,
      des: 52,
      evp: 45,
      evr: 0,
      cases: "0/30",
      pass: "-",
      guardrail: "-",
    },
    {
      no: "2026-014",
      name: "샘플 발송 현황 알림 Agent",
      dept: "물류운영팀",
      owner: "물류운영팀장",
      builder: "이민지",
      reviewer: "허정환",
      track: "하",
      stage: "파일럿",
      progress: 88,
      des: 100,
      evp: 100,
      evr: 100,
      cases: "60/60",
      pass: "96.2%",
      guardrail: "0건",
    },
    {
      no: "2026-028",
      name: "출장 규정 문의 Agent",
      dept: "경영지원팀",
      owner: "경영지원팀장",
      builder: "허정환",
      reviewer: "미배정",
      track: "중",
      stage: "G2 보완",
      progress: 38,
      des: 0,
      evp: 0,
      evr: 0,
      cases: "0/40",
      pass: "-",
      guardrail: "-",
    },
    {
      no: "2026-031",
      name: "개발 BOM 변경 영향 분석 Agent",
      dept: "개발1팀",
      owner: "개발1팀장",
      builder: "미배정",
      reviewer: "미배정",
      track: "미정",
      stage: "요구 접수",
      progress: 18,
      des: 0,
      evp: 0,
      evr: 0,
      cases: "0/0",
      pass: "-",
      guardrail: "-",
    },
  ];
  const current = deliveryProjects[selectedProject];
  const reviewerCandidates = [
    "정지헌",
    "허정환",
    "허시영",
    "황수정",
    "박혜빈",
    "이재승",
  ].filter((name) => name !== current.builder);
  const assignedReviewer =
    reviewerAssignments[current.no] ||
    (current.reviewer === "미배정" ? "" : current.reviewer);
  const reviewerDraft =
    reviewerDrafts[current.no] || assignedReviewer || reviewerCandidates[0];
  useEffect(() => {
    // Reset the checklist when the selected delivery project changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDepChecks(
      current.no === "2026-014" || current.no === "2026-018"
        ? Array(9).fill(true)
        : [
            current.evr === 100 && current.guardrail === "0건",
            true,
            true,
            true,
            true,
            true,
            true,
            false,
            false,
          ],
    );
  }, [current.no, current.evr, current.guardrail]);
  const isPlanned = lifecycleState === "생성 전";
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isAiTeamMember = role === ACCOUNT_ROLES.member;
  const isGeneralUser = role === ACCOUNT_ROLES.user;
  const currentRelationships = getProjectRelationships(role, current.no);
  const isDeveloper = currentRelationships.includes("DEVELOPER");
  const isReviewer =
    currentRelationships.includes("REVIEWER") ||
    (isAiTeamMember && assignedReviewer === "허정환");
  const isOwner = currentRelationships.includes("OWNER");
  const isSecurity = currentRelationships.includes("SECURITY_REVIEWER");
  const visibleDeliveryProjectIndexes = deliveryProjects
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      isLeader ? true : hasProjectRelationship(role, item.no),
    );
  const canEditCurrentProject =
    isDeveloper && !current.stage.includes("G2");
  const deliveryDocSections = {
    DES: [
      {
        title: "아키텍처 개요",
        summary: "구성도·플랫폼 선정 근거·에이전트 구조",
        content: (
          <div className="delivery-detail-stack">
            <h4>1.1 구성도</h4>
            <p className="flow-line">
              사용자 → Teams·웹 인터페이스 → {current.name} → 승인된
              업무지식·읽기 전용 시스템 → 근거 포함 답변
            </p>
            <h4>1.2 플랫폼·모델 선정</h4>
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>후보</th>
                    <th>기능</th>
                    <th>보안·감사</th>
                    <th>비용·운영</th>
                    <th>결론</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>사내 Agent 플랫폼 + GPT-5</td>
                    <td>상</td>
                    <td>승인 환경·전체 로그</td>
                    <td>중</td>
                    <td>
                      <b>선정</b>
                    </td>
                  </tr>
                  <tr>
                    <td>외부 SaaS 챗봇</td>
                    <td>중</td>
                    <td>데이터 반출 제약</td>
                    <td>하</td>
                    <td>제외</td>
                  </tr>
                  <tr>
                    <td>규칙 기반 검색</td>
                    <td>하</td>
                    <td>상</td>
                    <td>상</td>
                    <td>복합 판단 부족</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <b>선정 근거:</b> 승인된 내부 데이터 경계, 도구별 권한 통제, 판단
              근거와 사용자 로그 추적을 동시에 만족합니다.
            </p>
            <h4>1.3 에이전트 구조</h4>
            <p>
              단일 오케스트레이터가 검색·분류·답변을 수행하고, 저신뢰·예외
              케이스는 {current.dept} 담당자에게 이관합니다.
            </p>
          </div>
        ),
      },
      {
        title: "프롬프트·지침 설계",
        summary: "역할·절차·출력·금칙·버전 관리",
        content: (
          <div className="delivery-detail-stack">
            <h4>2.1 시스템 지침 구조</h4>
            <ol>
              <li>
                <b>역할:</b> 승인된 {current.dept} 업무 기준만 근거로 답변하는
                지원 Agent
              </li>
              <li>
                <b>절차:</b> 입력 확인 → 규정 검색 → 원인 후보 비교 → 근거와
                신뢰도 표시
              </li>
              <li>
                <b>출력:</b> 이슈 요약 / 근거 / 권고 조치 / 담당자 확인 필요
                여부
              </li>
              <li>
                <b>예외:</b> 근거 부족·상충 시 답변 확정 금지 후 담당자 이관
              </li>
            </ol>
            <h4>2.2 프롬프트 버전 관리</h4>
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>버전</th>
                    <th>변경일</th>
                    <th>변경 사유</th>
                    <th>평가 점수</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>v0.7</td>
                    <td>2026.08.12</td>
                    <td>근거 조항 형식 통일</td>
                    <td>89.0%</td>
                  </tr>
                  <tr>
                    <td>v0.8</td>
                    <td>2026.08.18</td>
                    <td>저신뢰 이관 조건 강화</td>
                    <td>92.5%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h4>2.3 금칙 목록</h4>
            <p>
              GR-01 승인되지 않은 규정 생성 금지 · GR-02 업무 결과 자동 확정
              금지 · GR-03 개인정보 원문 출력 금지. 각각 ADV-01~03 적대 평가
              케이스와 1:1 매핑합니다.
            </p>
          </div>
        ),
      },
      {
        title: "지식·검색 설계",
        summary: "지식 소스 처리·청킹·갱신 절차",
        content: (
          <div className="delivery-detail-stack">
            <h4>3.1 지식 소스별 처리</h4>
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>소스</th>
                    <th>분할 방식</th>
                    <th>저장 위치</th>
                    <th>갱신</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{current.dept} 업무 표준서</td>
                    <td>조항·표 단위 500~800자</td>
                    <td>사내 Vector Index</td>
                    <td>개정 즉시</td>
                  </tr>
                  <tr>
                    <td>업무 분류·사유 코드</td>
                    <td>코드 레코드 단위</td>
                    <td>승인 DB 읽기 전용</td>
                    <td>매일</td>
                  </tr>
                  <tr>
                    <td>과거 조치 사례</td>
                    <td>사례 1건 단위</td>
                    <td>마스킹 사례 저장소</td>
                    <td>월 1회</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h4>3.2 갱신 절차</h4>
            <p>
              {current.dept} 지식 갱신 담당자가 개정 문서를 등록하면 구버전
              비활성화 → 재색인 → 표본 10건 검증 → 게시 순서로 갱신합니다. ARD
              6.3의 지식 최신성 책임과 동일합니다.
            </p>
          </div>
        ),
      },
      {
        title: "도구·연동 설계",
        summary: "도구 기능·권한·실패 동작·최소 권한",
        content: (
          <div className="delivery-detail-stack">
            <h4>4.1 도구 목록</h4>
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>도구</th>
                    <th>기능</th>
                    <th>권한</th>
                    <th>실패 시 동작</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>품질규정 Search</td>
                    <td>승인 조항 검색</td>
                    <td>읽기</td>
                    <td>답변 중단·담당자 이관</td>
                  </tr>
                  <tr>
                    <td>업무 시스템 조회</td>
                    <td>승인된 업무 데이터 확인</td>
                    <td>읽기</td>
                    <td>재시도 1회 후 수동 조회 안내</td>
                  </tr>
                  <tr>
                    <td>담당자 Routing</td>
                    <td>검토 요청 생성</td>
                    <td>쓰기 제한</td>
                    <td>연락처 안내만 제공</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="detail-confirm">
              ✓ 모든 도구 권한은 ARD 자율성 L1 범위를 초과하지 않으며, 품질
              판정·SAP 변경 권한은 부여하지 않습니다.
            </p>
          </div>
        ),
      },
      {
        title: "데이터·보안 설계",
        summary: "데이터 흐름·마스킹·차단·로그",
        content: (
          <div className="delivery-detail-stack">
            <h4>5.1 데이터 흐름</h4>
            <p className="flow-line">
              사용자 입력 → 개인정보 사전 마스킹 → Agent 처리 → 승인 데이터 조회
              → 응답·근거 생성 → 감사 로그 저장
            </p>
            <h4>5.2 분류 및 처리</h4>
            <p>
              내부 데이터는 승인 플랫폼 안에서만 처리합니다. 사번·이름·연락처는
              토큰화하고 고객 기밀과 미승인 첨부는 검색 색인과 모델 입력에서
              차단합니다.
            </p>
            <h4>5.3 로그 설계</h4>
            <p>
              입력 요약, 출력, 참조 문서·조항, 신뢰도, 사용자, 처리 시각, 이관
              결과를 1년간 보관하며 운영 담당과 감사 담당만 열람합니다.
            </p>
          </div>
        ),
      },
      {
        title: "인터페이스 설계",
        summary: "사용자 진입점·첫 화면 고지",
        content: (
          <div className="delivery-detail-stack">
            <h4>6.1 사용자 화면과 진입점</h4>
            <p>
              Teams 앱과 Agent Portal의 품질혁신팀 업무 화면에서 진입합니다.
              질문, 근거 문서, 권고 조치, 담당자 이관 상태를 한 화면에
              표시합니다.
            </p>
            <h4>6.2 첫 화면 고지</h4>
            <blockquote>
              이 Agent는 승인된 {current.dept} 문서를 기준으로 정보와 초안을
              제공합니다. 최종 확인과 시스템 변경은 담당자가 수행해야 합니다.
              지식 기준일: 2026.08.20 / 문의: {current.dept}.
            </blockquote>
          </div>
        ),
      },
      {
        title: "설계 결정 기록 (Decision Log)",
        summary: "결정·검토 대안·선택 이유·일자",
        content: (
          <div className="delivery-detail-stack">
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>결정 사항</th>
                    <th>검토한 대안</th>
                    <th>선택 이유</th>
                    <th>일자</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>DL-01</td>
                    <td>단일 Agent 구조</td>
                    <td>검색·판정 멀티 Agent</td>
                    <td>초기 범위와 운영 복잡도 최소화</td>
                    <td>08.08</td>
                  </tr>
                  <tr>
                    <td>DL-02</td>
                    <td>읽기 전용 SAP 연동</td>
                    <td>판정 결과 자동 입력</td>
                    <td>L1 자율성과 권한 최소화 준수</td>
                    <td>08.11</td>
                  </tr>
                  <tr>
                    <td>DL-03</td>
                    <td>조항 단위 청킹</td>
                    <td>페이지 단위</td>
                    <td>근거 정확도와 출처 표시 개선</td>
                    <td>08.14</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
    ],
    EVP: [
      {
        title: "평가 기준 요약",
        summary: "ARD 7번 기준 복사·상세화",
        content: (
          <div className="delivery-detail-stack">
            <h4>1. 평가 기준</h4>
            <div className="delivery-metric-grid">
              <article>
                <small>정확도</small>
                <b>90% 이상</b>
                <span>현업 라벨과 일치</span>
              </article>
              <article>
                <small>금칙 위반</small>
                <b>0건</b>
                <span>GR-01~03</span>
              </article>
              <article>
                <small>형식 준수율</small>
                <b>95% 이상</b>
                <span>요약·근거·조치</span>
              </article>
              <article>
                <small>응답 시간</small>
                <b>10초 이내</b>
                <span>P95 기준</span>
              </article>
            </div>
            <p>
              ARD에서 승인된 통과 기준을 그대로 사용하며 평가 단계에서 낮추지
              않습니다.
            </p>
          </div>
        ),
      },
      {
        title: "평가셋 구성",
        summary: "핵심·경계·금칙 케이스와 확장 원칙",
        content: (
          <div className="delivery-detail-stack">
            <h4>2. 초기 평가셋</h4>
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>건수</th>
                    <th>목적</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>핵심 업무</td>
                    <td>24</td>
                    <td>일반 품질 이슈 분류·근거</td>
                  </tr>
                  <tr>
                    <td>경계·예외</td>
                    <td>10</td>
                    <td>근거 부족·상충·범위 밖</td>
                  </tr>
                  <tr>
                    <td>금칙 확인</td>
                    <td>6</td>
                    <td>GR-01~03 각 2건, 위반 0건 확인</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              초기 40건으로 시작하고 운영 중 확인된 실패와 문의 사례를 회귀
              평가셋으로 승격해 분기마다 확장합니다.
            </p>
          </div>
        ),
      },
      {
        title: "정답(라벨) 정의",
        summary: "기대 출력·판정 기준·현업 작성자",
        content: (
          <div className="delivery-detail-stack">
            <h4>3. 케이스별 정답 기준</h4>
            <p>
              각 케이스에 기대 이슈 분류, 필수 근거 조항, 허용 가능한 조치 범위,
              이관 필요 여부를 기록합니다. 부분 정답은 필수 항목 누락 여부에
              따라 0·0.5·1점으로 채점합니다.
            </p>
            <dl className="delivery-detail-facts">
              <div>
                <dt>라벨 작성자</dt>
                <dd>품질혁신팀 박정민 팀장·정수빈 책임</dd>
              </div>
              <div>
                <dt>검수자</dt>
                <dd>동료 리뷰어 이재승</dd>
              </div>
              <div>
                <dt>개발자 역할</dt>
                <dd>포맷 지원만 수행하며 정답 확정·채점에서 제외</dd>
              </div>
            </dl>
          </div>
        ),
      },
      {
        title: "채점 방식",
        summary: "규칙·LLM·사람 채점과 표본 검증",
        content: (
          <div className="delivery-detail-stack">
            <h4>4. 혼합 채점</h4>
            <ul className="check-list">
              <li>
                ✓ 규칙 기반 자동 채점: 필수 항목, 출처 링크, 금칙 문자열, 출력
                형식
              </li>
              <li>
                ✓ LLM 채점: 근거 충실도·조치 적절성, 고정 평가 프롬프트 v1.0
                사용
              </li>
              <li>
                ✓ 사람 채점: 전체의 20% 무작위 표본과 모든 Fail 케이스를
                현업·리뷰어가 교차 검증
              </li>
            </ul>
            <p>자동·LLM 판정이 충돌하면 사람 채점을 최종 결과로 사용합니다.</p>
          </div>
        ),
      },
      {
        title: "통과 기준",
        summary: "ARD와 동일한 배포 차단 기준",
        content: (
          <div className="delivery-detail-stack">
            <h4>5. 배포 통과 조건</h4>
            <p className="detail-confirm">
              정확도 ≥90% · 형식 준수율 ≥95% · 금칙 위반 0건 · 치명 오류 0건을
              모두 만족해야 합니다.
            </p>
            <p>
              하나라도 미달하면 EVR은 Fail로 기록하고 G3 배포 승인을 요청할 수
              없습니다.
            </p>
          </div>
        ),
      },
      {
        title: "평가 일정 및 반복 계획",
        summary: "1·2차 평가와 회귀 평가",
        content: (
          <div className="delivery-detail-stack">
            <div className="evaluation-timeline">
              <span>
                <b>08.18</b> 평가셋·라벨 확정
              </span>
              <span>
                <b>08.20</b> 1차 평가
              </span>
              <span>
                <b>08.22</b> 실패 분석·개선
              </span>
              <span>
                <b>08.24</b> 2차 전체 회귀 평가
              </span>
            </div>
            <p>
              프롬프트·검색 설정·모델·지식 버전이 변경될 때마다 보유 평가셋
              전체를 다시 실행합니다.
            </p>
          </div>
        ),
      },
    ],
    EVR: [
      {
        title: "평가 개요",
        summary: "대상·평가셋·일자·채점자",
        content: (
          <div className="delivery-detail-stack">
            <dl className="delivery-detail-facts">
              <div>
                <dt>대상 버전</dt>
                <dd>Agent build 0.8 · Prompt v0.8 · Knowledge 2026.08.20</dd>
              </div>
              <div>
                <dt>평가셋</dt>
                <dd>QEA-40 v1.1 · 핵심 24 / 경계 10 / 금칙 6</dd>
              </div>
              <div>
                <dt>일자</dt>
                <dd>2026.08.24</dd>
              </div>
              <div>
                <dt>채점</dt>
                <dd>자동·LLM Judge + 현업 정수빈 책임 / 리뷰어 이재승</dd>
              </div>
            </dl>
          </div>
        ),
      },
      {
        title: "결과 요약표",
        summary: "목표 대비 결과와 Pass/Fail",
        content: (
          <div className="delivery-detail-stack">
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>지표</th>
                    <th>목표</th>
                    <th>결과</th>
                    <th>판정</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>정확도</td>
                    <td>≥90%</td>
                    <td>{current.pass}</td>
                    <td>
                      <b className="pass-text">Pass</b>
                    </td>
                  </tr>
                  <tr>
                    <td>금칙 위반</td>
                    <td>0건</td>
                    <td>{current.guardrail}</td>
                    <td>
                      <b className="pass-text">Pass</b>
                    </td>
                  </tr>
                  <tr>
                    <td>형식 준수율</td>
                    <td>≥95%</td>
                    <td>97.5%</td>
                    <td>
                      <b className="pass-text">Pass</b>
                    </td>
                  </tr>
                  <tr>
                    <td>P95 응답시간</td>
                    <td>≤10초</td>
                    <td>8.2초</td>
                    <td>
                      <b className="pass-text">Pass</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
      {
        title: "실패 케이스 분석",
        summary: "실패 전수·원인 분류·조치",
        content: (
          <div className="delivery-detail-stack">
            <div className="delivery-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>입력 요약</th>
                    <th>기대 / 실제</th>
                    <th>원인</th>
                    <th>조치</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Q-17</td>
                    <td>복합 불량 원인</td>
                    <td>이관 / 단일 원인 제안</td>
                    <td>지침 모호</td>
                    <td>복합 원인 시 이관 조건 추가</td>
                  </tr>
                  <tr>
                    <td>Q-29</td>
                    <td>개정 직전 기준</td>
                    <td>최신 조항 / 구버전 인용</td>
                    <td>지식 부족</td>
                    <td>버전 필터 강화·재색인</td>
                  </tr>
                  <tr>
                    <td>Q-34</td>
                    <td>약어만 입력</td>
                    <td>확인 질문 / 원인 추정</td>
                    <td>평가셋 오류</td>
                    <td>입력 맥락과 라벨 보완</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              실패 케이스는 전수 원인 분류 후 조치하고 다음 회귀 평가셋에 고정
              편입했습니다.
            </p>
          </div>
        ),
      },
      {
        title: "버전별 개선 이력",
        summary: "프롬프트 버전별 점수 추이",
        content: (
          <div className="delivery-detail-stack">
            <div className="version-score-row">
              <span>
                v0.6 <b>84.0%</b>
              </span>
              <i>→</i>
              <span>
                v0.7 <b>89.0%</b>
              </span>
              <i>→</i>
              <span>
                v0.8 <b>92.5%</b>
              </span>
            </div>
            <p>
              근거 출력 형식 통일과 저신뢰 이관 조건 강화 후 정확도와 안전성
              점수가 함께 개선되었습니다.
            </p>
          </div>
        ),
      },
      {
        title: "잔여 위험 및 완화책",
        summary: "통과 후 약점과 운영 보완",
        content: (
          <div className="delivery-detail-stack">
            <ul>
              <li>
                <b>신규 불량 코드:</b> 일일 동기화 전까지 담당자 이관
              </li>
              <li>
                <b>복합 원인:</b> 신뢰도 0.75 미만 자동 이관과 주간 표본 리뷰
              </li>
              <li>
                <b>규정 개정 시차:</b> 지식 기준일 고지와 개정 즉시 재색인
              </li>
            </ul>
          </div>
        ),
      },
      {
        title: "배포 권고 및 승인",
        summary: "권고·조건·리뷰어·G3 승인",
        content: (
          <div className="delivery-detail-stack">
            <div className="release-recommendation">
              <CheckCircle size={22} weight="fill" />
              <div>
                <small>배포 권고</small>
                <b>조건부 배포 권고</b>
                <p>
                  품질혁신팀 25명 대상 2주 파일럿, 저신뢰 자동 이관, 주간 실패
                  케이스 리뷰를 조건으로 배포를 권고합니다.
                </p>
              </div>
            </div>
            <dl className="delivery-detail-facts">
              <div>
                <dt>개발</dt>
                <dd>{current.builder} · 2026.08.24</dd>
              </div>
              <div>
                <dt>리뷰어</dt>
                <dd>{assignedReviewer || "미배정"} · 검토 완료</dd>
              </div>
              <div>
                <dt>승인(G3)</dt>
                <dd>AI활성화팀장 승인 대기</dd>
              </div>
            </dl>
          </div>
        ),
      },
    ],
  };
  const activeSections = deliveryDocSections[activeDoc];
  const baseDocProgress = (doc: "DES" | "EVP" | "EVR") =>
    doc === "DES" ? current.des : doc === "EVP" ? current.evp : current.evr;
  const documentSectionKey = (
    doc: "DES" | "EVP" | "EVR",
    sectionIndex: number,
  ) => `${current.no}:${doc}:${sectionIndex}`;
  const documentKey = (doc: "DES" | "EVP" | "EVR") =>
    `${current.no}:${doc}`;
  const sectionComplete = (
    doc: "DES" | "EVP" | "EVR",
    sectionIndex: number,
  ) => {
    const sections = deliveryDocSections[doc];
    return (
      savedDocumentSections[documentSectionKey(doc, sectionIndex)] ||
      baseDocProgress(doc) >=
        Math.ceil(((sectionIndex + 1) / sections.length) * 100)
    );
  };
  const documentProgress = (doc: "DES" | "EVP" | "EVR") => {
    const sections = deliveryDocSections[doc];
    const completed = sections.filter((_, index) =>
      sectionComplete(doc, index),
    ).length;
    return Math.max(
      baseDocProgress(doc),
      Math.round((completed / sections.length) * 100),
    );
  };
  const defaultDocumentDraft = (
    doc: "DES" | "EVP" | "EVR",
    title: string,
    summary: string,
  ) => ({
    body:
      doc === "DES"
        ? `${title}\n${summary}\n\n선택한 설계와 적용 범위, 예외 처리 방식을 구체적으로 기록합니다.`
        : doc === "EVP"
          ? `${title}\n${summary}\n\n평가 케이스 구성, 판정 기준과 반복 평가 계획을 구체적으로 기록합니다.`
          : `${title}\n${summary}\n\n실행 결과, 실패 원인과 후속 조치를 근거와 함께 기록합니다.`,
    evidence:
      doc === "DES"
        ? `${current.no}-ARD · 승인된 설계 기준 및 Decision Log`
        : doc === "EVP"
          ? `${current.no}-ARD 7번 · 평가셋 및 정답 라벨`
          : `${current.no}-EVP · 평가 실행 로그 및 실패 케이스`,
    reviewNote:
      doc === "EVP"
        ? `현업 정답 라벨 담당자와 리뷰어 ${assignedReviewer || "미배정"}의 독립 검토 필요`
        : doc === "EVR"
          ? `리뷰어 ${assignedReviewer || "미배정"} 검토 후 G3 승인 근거로 사용`
          : "개발 중 변경 시 설계 결정 사유와 버전을 함께 갱신",
  });
  const docData = {
    DES: {
      title: "에이전트 설계서",
      version: "v0.8",
      owner: current.builder,
      progress: documentProgress("DES"),
      status:
        completedDocuments[documentKey("DES")] ||
        documentProgress("DES") === 100
          ? "작성 완료"
          : "작성 중",
    },
    EVP: {
      title: "평가 계획서",
      version: "v1.0",
      owner: `${current.builder} · ${assignedReviewer || "리뷰어 미배정"}`,
      progress: documentProgress("EVP"),
      status:
        completedDocuments[documentKey("EVP")] ||
        documentProgress("EVP") === 100
          ? "검토 완료"
          : "작성 중",
    },
    EVR: {
      title: "평가 결과 보고서",
      version: "v0.6",
      owner: `${current.builder} · ${assignedReviewer || "리뷰어 미배정"}`,
      progress: documentProgress("EVR"),
      status:
        completedDocuments[documentKey("EVR")] ||
        documentProgress("EVR") === 100
          ? "승인 요청 가능"
          : documentProgress("EVR")
            ? "평가 중"
            : "평가 전",
    },
  }[activeDoc];
  const visibleDocData = isPlanned
    ? { ...docData, progress: 0, status: "예정" }
    : docData;
  const isLowTrack = current.track === "하";
  const documentsReady =
    !isPlanned &&
    (isLowTrack ||
      (current.des === 100 && current.evp === 100 && current.evr === 100)) &&
    current.guardrail === "0건";
  const depReady = depChecks.every(Boolean);
  const securityRequired = current.track === "상";
  const canReviewerApproveG3 =
    Boolean(assignedReviewer) && documentsReady && depReady;
  const canLeaderApproveG3 =
    canReviewerApproveG3 &&
    g3ReviewerApproved &&
    (!securityRequired || g3SecurityApproved);
  const canRequestG3 = isLowTrack
    ? documentsReady && depReady
    : canLeaderApproveG3;
  const visibleG3Decision =
    viewerMode && (lifecycleState === "완료" || projectNo === "2026-014")
      ? "APPROVED"
      : g3Decision;
  const g3Approved =
    current.no === "2026-014" || visibleG3Decision === "APPROVED";
  const releaseProfile = {
    "2026-018": {
      intro:
        "해외 출장 규정과 비용 한도를 근거와 함께 안내하고 출장기안 초안을 작성합니다. 최종 제출과 승인은 사용자가 수행합니다.",
      outOfScope: [
        "출장기안을 사용자 대신 제출하거나 승인 요청하지 않습니다.",
        "근거가 없는 비용·예외 승인을 확정하지 않습니다.",
        "개인정보와 결제정보를 저장하지 않습니다.",
      ],
      input: "출장 국가·기간·목적과 필요한 비용 항목을 입력합니다.",
      channel: "Teams #travel-agent-support",
    },
    "2026-026": {
      intro:
        "승인된 SAP 사용자 가이드에서 업무 질문에 맞는 처리 절차와 근거 문서를 찾아 안내합니다.",
      outOfScope: [
        "SAP 데이터를 직접 생성·수정·삭제하지 않습니다.",
        "권한 신청이나 결재를 대신 수행하지 않습니다.",
        "승인되지 않은 매뉴얼을 근거로 답하지 않습니다.",
      ],
      input: "업무 메뉴·오류 메시지·하려는 작업을 입력합니다.",
      channel: "Teams #sap-guide-support",
    },
    "2026-014": {
      intro:
        "샘플 발송 상태를 조회해 지연 여부와 확인이 필요한 후속조치를 안내합니다.",
      outOfScope: [
        "배송 상태나 예정일을 임의로 변경하지 않습니다.",
        "택배사 시스템에서 발송을 취소하거나 재접수하지 않습니다.",
        "근거가 없는 도착 예정일을 확정하지 않습니다.",
      ],
      input: "샘플 번호·발송일·수신 국가를 입력합니다.",
      channel: "Teams #sample-delivery-support",
    },
  }[current.no] || {
    intro:
      "생산 품질 이슈를 요약하고 승인된 규정과 과거 사례에서 가능한 원인과 조치 초안을 근거와 함께 제안합니다.",
    outOfScope: [
      "최종 품질 판정이나 출하 여부를 확정하지 않습니다.",
      "SAP·MES 데이터를 수정하거나 조치를 자동 실행하지 않습니다.",
      "근거가 없거나 민감한 예외를 임의로 판단하지 않습니다.",
    ],
    input: "제품·공정·현상·발생 시점과 확인한 데이터를 입력합니다.",
    channel: "Teams #quality-agent-support",
  };
  const depDraft = depDocumentDrafts[current.no] || {
    securityReview:
      current.track === "상"
        ? "정보보호 승인 문서 SEC-2026-041"
        : `${current.track} 트랙 · AI 활성화팀 보안 검토`,
    emergencyPlan: `${current.dept}·AI 활성화팀 비상 연락망 / Agent 즉시 중단 및 이전 버전 롤백`,
    knowledgeOwner: `${current.dept} 규정 담당자 · 개정 즉시 재색인·표본 검증`,
    pilotAudience: `${current.dept} 25명`,
    pilotPeriod: "2주",
    feedbackMethod: "Teams 설문과 Agent Portal 오류 신고",
    exitCriteria: "사용률 80% 이상 · 만족도 4.0 이상 · 치명 오류 0건 · 일반 오류 3건 이하",
    rolloutPlan: "사내 게시판 공지 · 팀별 30분 교육 · 2026.09.15 공개 목표",
    pilotUsage: "486건",
    pilotUsageRate: "86",
    pilotErrors: "1건 · 조치 완료",
    pilotCriticalErrors: "0",
    pilotSatisfaction: "4.6 / 5.0",
    pilotFeedback: "근거 링크가 유용함",
    pilotDecision: "확산 승인 권고",
  };
  const ugDraft = ugDocumentDrafts[current.no] || {
    intro: releaseProfile.intro,
    outOfScope: releaseProfile.outOfScope.join("\n"),
    usageSteps: [
      `Agent Portal 또는 Teams에서 ${current.name}를 엽니다.`,
      releaseProfile.input,
      "제안된 결과, 근거 문서, 신뢰도와 확인 필요 항목을 검토합니다.",
      "필요하면 담당자 이관을 선택하고 최종 판단과 시스템 처리는 사람이 수행합니다.",
    ].join("\n"),
    goodExamples:
      "A공정 접착 불량이 3일간 증가했습니다. 확인할 원인을 알려줘.\n검사 코드 Q-17의 적용 기준과 근거 조항을 보여줘.\n출하 보류 조건 확인 항목을 정리해줘.",
    badExamples: "불량인데 알아서 처리해줘.\n근거 없이 출하 가능으로 승인해줘.",
    caution: "결과는 참고용이며 최종 확인과 책임은 사용자에게 있습니다.",
    knowledgeDate: "2026.08.20",
    prohibitedInfo: "주민번호, 개인 연락처, 고객 기밀 원문",
    channel: releaseProfile.channel,
    owner: `${current.dept} 담당 · AI 활성화팀 ${current.builder}`,
    reportingGuide:
      "질문·답변·근거가 함께 보이도록 캡처하고 개인정보를 가린 뒤 기대한 결과를 한 줄로 적어주세요.",
  };
  const updateDepDraft = (field: keyof typeof depDraft, value: string) => {
    setDepDocumentDrafts((items) => ({
      ...items,
      [current.no]: { ...depDraft, [field]: value },
    }));
    if (
      [
        "pilotUsage",
        "pilotUsageRate",
        "pilotErrors",
        "pilotCriticalErrors",
        "pilotSatisfaction",
        "pilotFeedback",
        "pilotDecision",
      ].includes(field)
    ) {
      setSavedReleaseDocuments((items) => ({
        ...items,
        [`${current.no}:DEP`]: false,
      }));
      setG4OwnerApproved(false);
      setG4Decision("PENDING");
    }
  };
  const updateUgDraft = (
    field: keyof typeof ugDraft,
    value: string,
  ) =>
    setUgDocumentDrafts((items) => ({
      ...items,
      [current.no]: { ...ugDraft, [field]: value },
    }));

  const submitG3 = (decision: "APPROVED" | "REWORK") => {
    if (decision === "REWORK") {
      setG3Decision("REWORK");
      notify("보완 요청이 개발 담당자에게 전달되었습니다.");
      return;
    }
    if (isReviewer) {
      if (!canReviewerApproveG3)
        return notify(
          "EVR·DEP와 배포 차단 기준을 모두 충족한 뒤 리뷰어 승인을 기록할 수 있습니다.",
        );
      setG3ReviewerApproved(true);
      notify("동료 리뷰어의 독립 검토 승인이 기록되었습니다.");
      return;
    }
    if (isSecurity) {
      if (!securityRequired)
        return notify("정보보호 추가 승인은 상 트랙에만 적용됩니다.");
      if (!canReviewerApproveG3)
        return notify(
          "평가 및 DEP 조건을 충족한 뒤 정보보호 승인을 기록할 수 있습니다.",
        );
      setG3SecurityApproved(true);
      notify("상 트랙 정보보호 승인이 기록되었습니다.");
      return;
    }
    if (!isLeader)
      return notify(
        "G3 최종 승인은 동료 리뷰어와 AI활성화팀장에게만 허용됩니다.",
      );
    if (!canLeaderApproveG3 && !isLowTrack)
      return notify(
        "DEP 완료, 동료 리뷰어 서명과 상 트랙 정보보호 서명을 모두 확인한 뒤 G3를 승인할 수 있습니다.",
      );
    if (!canRequestG3)
      return notify(
        "필수 문서·DEP·금칙 위반 0건 확인 후 배포를 승인할 수 있습니다.",
      );
    setG3Decision(decision);
    notify(
      isLowTrack
        ? "하 트랙 간소화 배포 승인이 기록되었습니다."
        : "리뷰어·팀장 G3 배포 승인이 기록되었습니다.",
    );
  };
  const pilotUsageRate = Number.parseFloat(depDraft.pilotUsageRate) || 0;
  const pilotSatisfaction =
    Number.parseFloat(depDraft.pilotSatisfaction.match(/[\d.]+/)?.[0] || "0") ||
    0;
  const pilotCriticalErrors =
    Number.parseInt(depDraft.pilotCriticalErrors.replace(/\D/g, ""), 10) || 0;
  const pilotResultsSaved =
    Boolean(savedReleaseDocuments[`${current.no}:DEP`]) ||
    current.no === "2026-014";
  const pilotCriteria = [
    {
      label: "파일럿 사용률 80% 이상",
      value: `${pilotUsageRate}%`,
      passed: pilotUsageRate >= 80,
    },
    {
      label: "만족도 4.0 이상",
      value: `${pilotSatisfaction} / 5.0`,
      passed: pilotSatisfaction >= 4,
    },
    {
      label: "치명 오류 0건",
      value: `${pilotCriticalErrors}건`,
      passed: pilotCriticalErrors === 0,
    },
    {
      label: "운영·지식 담당 인수 완료",
      value: depReady ? "완료" : "미완료",
      passed: depReady,
    },
  ];
  const pilotGateReady =
    g3Approved &&
    pilotResultsSaved &&
    pilotCriteria.every((criterion) => criterion.passed);
  const g4ReviewReason = g4ReviewReasons[current.no] || "";
  const g4ReviewRound = g4ReviewRounds[current.no] || 1;

  const submitG4 = (decision: "APPROVED" | "EXTEND") => {
    if (decision === "EXTEND") {
      if (!g4ReviewReason.trim())
        return notify("파일럿 연장 또는 보완 사유를 먼저 입력해 주세요.");
      setG4Decision("EXTEND");
      setG4OwnerApproved(false);
      setG4ReviewRounds((items) => ({
        ...items,
        [current.no]: g4ReviewRound + 1,
      }));
      setSavedReleaseDocuments((items) => ({
        ...items,
        [`${current.no}:DEP`]: false,
      }));
      notify("파일럿 연장·보완 사유가 기록되었습니다. DEP 수정 후 재심사합니다.");
      return;
    }
    if (!pilotGateReady)
      return notify(
        "저장된 파일럿 결과가 종료 기준을 모두 충족한 뒤 G4 승인을 진행할 수 있습니다.",
      );
    if (isOwner) {
      setG4OwnerApproved(true);
      notify("프로젝트 Owner의 확산·운영 책임 승인이 기록되었습니다.");
      return;
    }
    if (!isLeader)
      return notify(
        "G4 공동 승인은 프로젝트 Owner와 AI활성화팀장만 수행할 수 있습니다.",
      );
    if (!g4OwnerApproved)
      return notify("프로젝트 Owner의 공동 승인이 먼저 필요합니다.");
    setG4Decision(decision);
    notify(
      "프로젝트 Owner·팀장 확산 승인이 완료되어 운영·개선 단계로 이동합니다.",
    );
  };

  const deliveryRoleClass = isLeader
    ? "role-leader-delivery"
    : isReviewer
        ? "role-reviewer-delivery"
        : isDeveloper
          ? "role-builder-delivery"
        : isOwner
          ? "role-owner-delivery"
          : isSecurity
            ? "role-security-delivery"
            : "role-viewer-delivery";

  return (
    <div
      className={`page delivery-page ${embedded ? "embedded-delivery-page" : ""} ${deliveryRoleClass}`}
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest("button");
        if (
          button?.textContent?.includes(
            "배포 체크리스트[DEP] · 사용자 가이드[UG] 보기",
          )
        ) {
          event.stopPropagation();
          setReleaseDocument("DEP");
        }
      }}
    >
      {!embedded && (
        <>
          <section className="page-heading delivery-heading">
            <div>
              <p className="eyebrow">03 · DESIGN, BUILD, EVALUATE & RELEASE</p>
              <h1>설계 · 개발 / 평가 · 배포 · 인수인계</h1>
              <p>
                에이전트 요구사항 정의서[ARD]를 설계와 평가 기준으로 전환하고,
                객관적 근거와 역할별 독립 승인을 거쳐 운영 가능한 Agent로
                인계합니다.
              </p>
            </div>
            <div className="delivery-actions">
              <div className="perspective-switch account-context" aria-label="현재 계정과 프로젝트 역할">
                <span>현재 권한</span>
                <b>
                  {isLeader
                    ? "AI 활성화팀 팀장"
                    : projectRelationshipLabel(role, current.no) || "조회 전용"}
                </b>
              </div>
              <button className="secondary" onClick={openHub}>
                일정·작업은 AX Projects Hub →
              </button>
            </div>
          </section>
          <LifecycleRoleGuide role={role} stage="delivery" projectNo={current.no} />
        </>
      )}

      {!embedded && (
        <section
          className="delivery-stage-line"
          aria-label="설계 개발 및 배포 단계"
        >
          <div className="done">
            <span>G2</span>
            <p>
              <b>개발 착수</b>
              <small>에이전트 요구사항 정의서[ARD] 승인·담당 배정</small>
            </p>
          </div>
          <i />
          <div className="active">
            <span>1</span>
            <p>
              <b>에이전트 설계서[DES]</b>
              <small>평가 계획서[EVP]와 병렬 진행</small>
            </p>
          </div>
          <i />
          <div className="active">
            <span>2</span>
            <p>
              <b>평가 결과 보고서[EVR]</b>
              <small>실패 분석·회귀 평가</small>
            </p>
          </div>
          <i />
          <div>
            <span>G3</span>
            <p>
              <b>배포 승인</b>
              <small>리뷰어·팀장</small>
            </p>
          </div>
          <i />
          <div>
            <span>G4</span>
            <p>
              <b>확산 승인</b>
              <small>Owner·팀장</small>
            </p>
          </div>
        </section>
      )}

      {!embedded && (
        <section className="delivery-context panel">
          <div>
            <Pill tone="blue">{current.stage}</Pill>
            <strong>
              {current.no} · {current.name}
            </strong>
            <p>
              {current.dept} · 프로젝트 Owner {current.owner} · 개발 담당{" "}
              {current.builder} · 리뷰어 {assignedReviewer || "미배정"}
            </p>
          </div>
          <label>
            과제 선택
            <select
              value={selectedProject}
              onChange={(e) => {
                const next = Number(e.target.value);
                const nextProject = deliveryProjects[next];
                setSelectedProject(next);
                setG3Decision(
                  nextProject.no === "2026-014" ? "APPROVED" : "PENDING",
                );
                setG4Decision("PENDING");
                setG3ReviewerApproved(
                  nextProject.no === "2026-018" ||
                    nextProject.no === "2026-014",
                );
                setG3SecurityApproved(nextProject.no === "2026-018");
                setG4OwnerApproved(false);
              }}
            >
              {visibleDeliveryProjectIndexes.map(({ item, index }) => (
                <option key={item.no} value={index}>
                  {item.no} {item.name.replace(" Agent", "")}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {(!embedded || embeddedSection === "delivery") && (
        <>
          <section className="parallel-banner">
            <div>
              <span>기준</span>
              <p>
                <b>에이전트 요구사항 정의서[ARD]</b>
                <small>범위·자율성·성공 기준·실패 시나리오</small>
              </p>
            </div>
            <b>→</b>
            <div className="parallel-work">
              <span>1</span>
              <p>
                <b>에이전트 설계서[DES]</b>
                <small>개발하며 계속 갱신</small>
              </p>
              <em>병렬</em>
              <span>2</span>
              <p>
                <b>평가 계획서[EVP]</b>
                <small>개발과 동시에 준비</small>
              </p>
            </div>
            <b>→</b>
            <div>
              <span>3</span>
              <p>
                <b>평가 결과 보고서[EVR]</b>
                <small>1차 개발 완료 후 실행</small>
              </p>
            </div>
          </section>

          <section className="delivery-work-grid">
            <article className="panel delivery-projects">
              <div className="panel-title">
                <div>
                  <h2>{isAiTeamMember ? "내 담당 과제" : "검토 대상 과제"}</h2>
                  <p>
                    {isAiTeamMember
                      ? "G2에서 배정된 AI활성화팀 담당자의 작업 공간"
                      : "역할에 맞는 검토·승인 대상을 선택합니다."}
                  </p>
                </div>
                <Pill tone="blue">{visibleDeliveryProjectIndexes.length}건</Pill>
              </div>
              <div className="delivery-project-list">
                {visibleDeliveryProjectIndexes.map(({ item, index: i }) => (
                  <button
                    key={item.no}
                    className={selectedProject === i ? "selected" : ""}
                    onClick={() => {
                      setSelectedProject(i);
                      setG3Decision(
                        item.no === "2026-014" ? "APPROVED" : "PENDING",
                      );
                      setG4Decision("PENDING");
                      setG3ReviewerApproved(
                        item.no === "2026-018" || item.no === "2026-014",
                      );
                      setG3SecurityApproved(item.no === "2026-018");
                      setG4OwnerApproved(false);
                    }}
                  >
                    <span className="project-progress">{item.progress}%</span>
                    <div>
                      <small>
                        {item.no} · {item.stage}
                      </small>
                      <strong>{item.name}</strong>
                      <p>
                        담당 {item.builder} · {item.track} 트랙
                      </p>
                    </div>
                    <b>›</b>
                  </button>
                ))}
              </div>
            </article>
            <article
              className={`panel document-workspace ${isPlanned ? "planned-document-workspace" : ""}`}
            >
              <header>
                <div>
                  <p className="eyebrow">PARALLEL DOCUMENT WORKSPACE</p>
                  <h2>설계·평가 산출문서</h2>
                  <p>
                    에이전트 요구사항 정의서[ARD] 기준을 바꾸지 않고 에이전트
                    설계서[DES]·평가 계획서[EVP]·평가 결과 보고서[EVR]를 병렬로
                    작성합니다.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    notify(
                      "승인된 에이전트 요구사항 정의서[ARD] 원문을 열었습니다.",
                    )
                  }
                >
                  에이전트 요구사항 정의서[ARD] 기준 보기
                </button>
              </header>
              <div className="doc-tabs">
                {(["DES", "EVP", "EVR"] as const).map((doc) => (
                  <button
                    key={doc}
                    className={activeDoc === doc ? "active" : ""}
                    disabled={isPlanned}
                    onClick={() => {
                      setActiveDoc(doc);
                      setActiveDocSection(0);
                    }}
                  >
                    <span>
                      {doc === "DES" ? "1" : doc === "EVP" ? "2" : "3"}
                    </span>
                    <b>
                      {doc === "DES"
                        ? "에이전트 설계서[DES]"
                        : doc === "EVP"
                          ? "평가 계획서[EVP]"
                          : "평가 결과 보고서[EVR]"}
                    </b>
                    <small>
                      {isPlanned
                        ? "예정"
                        : `${documentProgress(doc)}%`}
                    </small>
                  </button>
                ))}
              </div>
              {isPlanned && (
                <div className="planned-document-notice">
                  <Info size={17} weight="fill" />
                  <p>
                    <b>G2 개발 착수 승인 후 활성화됩니다.</b>
                    <small>
                      작성 중·완료 단계와 동일한 표준 양식을 미리 보여주며,
                      지금은 입력하거나 펼칠 수 없습니다.
                    </small>
                  </p>
                </div>
              )}
              <div className="doc-editor-head">
                <div>
                  <Pill
                    tone={
                      isPlanned
                        ? "gray"
                        : visibleDocData.progress === 100
                          ? "green"
                          : "blue"
                    }
                  >
                    {visibleDocData.status}
                  </Pill>
                  <h3>
                    {current.no}-{activeDoc} · {visibleDocData.title}[
                    {activeDoc}]
                  </h3>
                  <p>
                    담당 {isPlanned ? "G2에서 배정" : visibleDocData.owner} ·{" "}
                    {isPlanned ? "생성 전" : visibleDocData.version}
                  </p>
                </div>
                <strong>{visibleDocData.progress}%</strong>
              </div>
              <div className="doc-checklist delivery-doc-accordion">
                {activeSections.map((item, i) => {
                  const complete = !isPlanned && sectionComplete(activeDoc, i);
                  const active = !isPlanned && activeDocSection === i;
                  const sectionKey = documentSectionKey(activeDoc, i);
                  const draft =
                    documentDrafts[sectionKey] ||
                    defaultDocumentDraft(activeDoc, item.title, item.summary);
                  return (
                    <div className="delivery-document-section" key={item.title}>
                      <button
                        className={active ? "active" : ""}
                        aria-expanded={active}
                        aria-disabled={isPlanned}
                        disabled={isPlanned}
                        onClick={() =>
                          setActiveDocSection((currentSection) =>
                            currentSection === i ? null : i,
                          )
                        }
                      >
                        <span className={complete ? "complete" : ""}>
                          {complete ? <Check size={14} weight="bold" /> : i + 1}
                        </span>
                        <div>
                          <small>{String(i + 1).padStart(2, "0")}</small>
                          <b>{item.title}</b>
                          <p>{item.summary}</p>
                        </div>
                        <em>
                          {isPlanned ? "예정" : complete ? "완료" : "작성 필요"}
                        </em>
                        <ArrowRight size={14} weight="bold" />
                      </button>
                      {active && (
                        <section
                          className="delivery-document-detail"
                          aria-label={`${item.title} 상세 내용`}
                        >
                          {item.content}
                          {canEditCurrentProject && (
                            <div className="delivery-document-editor" aria-label={`${item.title} 작성 영역`}>
                              <div className="document-editor-title">
                                <div>
                                  <Pill tone={complete ? "green" : "blue"}>
                                    {complete ? "저장 완료" : "개발 담당자 작성"}
                                  </Pill>
                                  <h4>{String(i + 1).padStart(2, "0")} · {item.title} 편집</h4>
                                </div>
                                <small>담당 {current.builder} · 변경 내용 자동 기록</small>
                              </div>
                              <label>
                                섹션 본문
                                <textarea
                                  value={draft.body}
                                  onChange={(event) =>
                                    setDocumentDrafts((items) => ({
                                      ...items,
                                      [sectionKey]: {
                                        ...draft,
                                        body: event.target.value,
                                      },
                                    }))
                                  }
                                  aria-label={`${activeDoc} ${item.title} 본문`}
                                />
                              </label>
                              <div className="document-editor-fields">
                                <label>
                                  근거·참조 문서
                                  <input
                                    value={draft.evidence}
                                    onChange={(event) =>
                                      setDocumentDrafts((items) => ({
                                        ...items,
                                        [sectionKey]: {
                                          ...draft,
                                          evidence: event.target.value,
                                        },
                                      }))
                                    }
                                    aria-label={`${activeDoc} ${item.title} 근거`}
                                  />
                                </label>
                                <label>
                                  검토·인계 메모
                                  <input
                                    value={draft.reviewNote}
                                    onChange={(event) =>
                                      setDocumentDrafts((items) => ({
                                        ...items,
                                        [sectionKey]: {
                                          ...draft,
                                          reviewNote: event.target.value,
                                        },
                                      }))
                                    }
                                    aria-label={`${activeDoc} ${item.title} 검토 메모`}
                                  />
                                </label>
                              </div>
                              <div className="document-editor-actions">
                                <span>
                                  {savedDocumentSections[sectionKey]
                                    ? "방금 저장됨 · 문서 버전에 반영"
                                    : "입력 내용은 이 화면에서 임시 보관됩니다."}
                                </span>
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={
                                    !draft.body.trim() || !draft.evidence.trim()
                                  }
                                  onClick={() => {
                                    setDocumentDrafts((items) => ({
                                      ...items,
                                      [sectionKey]: draft,
                                    }));
                                    setSavedDocumentSections((items) => ({
                                      ...items,
                                      [sectionKey]: true,
                                    }));
                                    notify(
                                      `${visibleDocData.title}의 '${item.title}' 항목을 저장하고 완료 처리했습니다.`,
                                    );
                                  }}
                                >
                                  {complete ? "수정 내용 저장" : "섹션 저장 · 완료"}
                                </button>
                              </div>
                            </div>
                          )}
                          {!canEditCurrentProject && isReviewer && !isPlanned && (
                            <div className="delivery-document-reviewer" aria-label={`${item.title} 리뷰 영역`}>
                              <div>
                                <Pill
                                  tone={
                                    documentReviews[sectionKey]?.status === "APPROVED"
                                      ? "green"
                                      : documentReviews[sectionKey]?.status === "REWORK"
                                        ? "red"
                                        : "blue"
                                  }
                                >
                                  {documentReviews[sectionKey]?.status === "APPROVED"
                                    ? "검토 완료"
                                    : documentReviews[sectionKey]?.status === "REWORK"
                                      ? "보완 요청"
                                      : "독립 리뷰"}
                                </Pill>
                                <h4>{item.title} 검토 의견</h4>
                              </div>
                              <label>
                                검토 의견 또는 보완 사유
                                <textarea
                                  value={documentReviews[sectionKey]?.note || ""}
                                  onChange={(event) =>
                                    setDocumentReviews((items) => ({
                                      ...items,
                                      [sectionKey]: {
                                        status: items[sectionKey]?.status || "PENDING",
                                        note: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="ARD 기준 충족 여부와 보완이 필요한 근거를 기록하세요."
                                  aria-label={`${activeDoc} ${item.title} 리뷰 의견`}
                                />
                              </label>
                              <div className="document-review-actions">
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={!documentReviews[sectionKey]?.note.trim()}
                                  onClick={() => {
                                    setDocumentReviews((items) => ({
                                      ...items,
                                      [sectionKey]: {
                                        note: items[sectionKey]?.note || "",
                                        status: "REWORK",
                                      },
                                    }));
                                    notify(`${item.title} 보완 요청을 개발 담당자에게 전달했습니다.`);
                                  }}
                                >
                                  보완 요청
                                </button>
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={() => {
                                    setDocumentReviews((items) => ({
                                      ...items,
                                      [sectionKey]: {
                                        note: items[sectionKey]?.note || "기준 충족 확인",
                                        status: "APPROVED",
                                      },
                                    }));
                                    notify(`${item.title} 독립 검토 완료를 기록했습니다.`);
                                  }}
                                >
                                  검토 완료
                                </button>
                              </div>
                            </div>
                          )}
                          {!canEditCurrentProject && !isReviewer && !isPlanned && (
                            <div className="document-readonly-note">
                              <Info size={16} weight="fill" />
                              <p>
                                <b>조회·검토 전용</b>
                                <span>
                                  이 문서는 프로젝트 개발 담당자 {current.builder}가 작성합니다.
                                  팀장·Owner·리뷰어는 저장된 결과와 변경 이력을 확인합니다.
                                </span>
                              </p>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  );
                })}
              </div>
              <footer>
                <div>
                  <span>
                    {isPlanned
                      ? "G2 통과 후 자동 생성"
                      : canEditCurrentProject
                        ? "자동 저장됨"
                        : "조회 전용 · 담당자 작성"}
                  </span>
                  <Progress value={visibleDocData.progress} />
                </div>
                <button
                  className="primary"
                  disabled={isPlanned || !canEditCurrentProject}
                  onClick={() => {
                    const allComplete = activeSections.every((_, index) =>
                      sectionComplete(activeDoc, index),
                    );
                    if (!allComplete) {
                      notify(
                        `${visibleDocData.title}[${activeDoc}] 임시본을 저장했습니다. 작성 필요 항목을 완료해 주세요.`,
                      );
                      return;
                    }
                    setCompletedDocuments((items) => ({
                      ...items,
                      [documentKey(activeDoc)]: true,
                    }));
                    notify(
                      `${visibleDocData.title}[${activeDoc}] 작성 완료본을 저장했습니다.`,
                    );
                  }}
                >
                  {canEditCurrentProject
                    ? activeSections.every((_, index) =>
                        sectionComplete(activeDoc, index),
                      )
                      ? "문서 작성 완료"
                      : "문서 임시 저장"
                    : isReviewer
                      ? "리뷰어 검토 전용"
                      : isAiTeamMember
                      ? "다른 담당자 문서 · 조회 전용"
                      : "담당자 작성 문서"}
                </button>
              </footer>
            </article>
          </section>
        </>
      )}

      {(!embedded || embeddedSection === "g3") && (
        <section
          className={`panel g3-review-workspace ${viewerMode ? "viewer-only" : ""}`}
        >
          <div className="gate-work-head">
            <div>
              <span className="gate-badge">{isLowTrack ? "하" : "G3"}</span>
              <div>
                <p className="eyebrow">DEPLOYMENT APPROVAL</p>
                <h2>
                    {viewerMode || isGeneralUser
                      ? "배포 승인 결과 현황"
                    : isLowTrack
                      ? "하 트랙 간소화 배포 승인"
                      : "기능·보안 공동 검토 및 배포 승인"}
                </h2>
                <p>
                  {isLowTrack
                    ? "INT·간소화 FEA·UG·OPS 등록을 확인하고 AI활성화팀장이 배포를 승인합니다."
                    : "EVR과 DEP 완료 후 동료 리뷰어, AI활성화팀장, 상 트랙 정보보호 담당자가 각자 서명합니다."}
                </p>
              </div>
            </div>
            <Pill
              tone={
                visibleG3Decision === "APPROVED"
                  ? "green"
                  : canRequestG3
                    ? "blue"
                    : "orange"
              }
            >
              {visibleG3Decision === "APPROVED"
                ? "배포 승인 완료"
                : canRequestG3
                  ? "최종 승인 가능"
                  : "선행 조건 확인 중"}
            </Pill>
          </div>
          {(viewerMode || isGeneralUser) && (
            <div className="g3-viewer-notice">
              <Info size={17} weight="fill" />
              <p>
                <b>조회 전용</b>
                <small>
                  일반 User는 승인에 참여하지 않고 승인 결과와 근거만
                  확인합니다.
                </small>
              </p>
            </div>
          )}
          {!viewerMode && isDeveloper && (
            <div className="gate-role-readonly">
              <ShieldCheck size={17} weight="fill" />
              <p>
                <b>개발자 셀프 승인이 차단되었습니다.</b>
                <span>
                  개발 담당자는 문서 작성·보완만 수행하며 G3 승인 버튼은
                  제공되지 않습니다.
                </span>
              </p>
            </div>
          )}
          <div className="g3-evidence-grid">
            <article>
              <small>평가 결과 보고서[EVR]</small>
              <strong>{isLowTrack ? "간소화" : `${current.evr}%`}</strong>
              <p>{isLowTrack ? "하 트랙 적용" : "실패 전수 분석·회귀 평가"}</p>
              <Pill tone={documentsReady ? "green" : "orange"}>
                {documentsReady ? "기준 충족" : "미완료"}
              </Pill>
            </article>
            <article>
              <small>금칙·안전성</small>
              <strong>{current.guardrail}</strong>
              <p>금칙 위반 허용 0건</p>
              <Pill tone={current.guardrail === "0건" ? "green" : "orange"}>
                필수
              </Pill>
            </article>
            <article>
              <small>배포 체크리스트[DEP]</small>
              <strong>
                {depReady ? "9 / 9" : `${depChecks.filter(Boolean).length} / 9`}
              </strong>
              <p>하나라도 미확인 시 배포 불가</p>
              <Pill tone={depReady ? "green" : "red"}>
                {depReady ? "완료" : "배포 차단"}
              </Pill>
            </article>
            <article>
              <small>트랙 승인 체계</small>
              <strong>
                {securityRequired
                  ? "정보보호 추가"
                  : isLowTrack
                    ? "팀장 단독"
                    : "리뷰어·팀장"}
              </strong>
              <p>L2 이상은 상 트랙 강제</p>
              <Pill tone={securityRequired ? "violet" : "gray"}>
                {current.track} 트랙
              </Pill>
            </article>
          </div>
          {!isLowTrack && (
            <div className={`g3-reviewer-assignment ${assignedReviewer ? "assigned" : ""}`}>
              <div className="reviewer-assignment-head">
                <span className={assignedReviewer ? "complete" : "pending"}>
                  {assignedReviewer ? <Check size={15} weight="bold" /> : "1"}
                </span>
                <div>
                  <small>G3 독립 검토자 지정</small>
                  <b>동료 리뷰어 배정</b>
                  <p>
                    개발 담당자와 다른 AI 활성화팀 팀원을 팀장이 지정합니다.
                    배정된 리뷰어에게 EVR·DEP 검토와 G3 서명 권한이 열립니다.
                  </p>
                </div>
                <Pill tone={assignedReviewer ? "green" : "orange"}>
                  {assignedReviewer ? `배정 완료 · ${assignedReviewer}` : "팀장 배정 필요"}
                </Pill>
              </div>
              {isLeader && visibleG3Decision !== "APPROVED" ? (
                <div className="reviewer-assignment-form">
                  <label>
                    동료 리뷰어
                    <select
                      value={reviewerDraft}
                      onChange={(event) =>
                        setReviewerDrafts((items) => ({
                          ...items,
                          [current.no]: event.target.value,
                        }))
                      }
                      aria-label="G3 동료 리뷰어 선택"
                    >
                      {reviewerCandidates.map((name) => (
                        <option key={name} value={name}>
                          {name} · AI 활성화팀 팀원
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setReviewerAssignments((items) => ({
                        ...items,
                        [current.no]: reviewerDraft,
                      }));
                      setG3ReviewerApproved(false);
                      notify(
                        `${reviewerDraft} 담당자를 ${current.name}의 G3 동료 리뷰어로 배정했습니다.`,
                      );
                    }}
                  >
                    {assignedReviewer ? "리뷰어 변경·저장" : "리뷰어 배정"}
                  </button>
                </div>
              ) : (
                <div className="reviewer-assignment-view">
                  <small>현재 배정</small>
                  <b>{assignedReviewer || "아직 배정되지 않았습니다."}</b>
                  <span>
                    {assignedReviewer
                      ? isReviewer
                        ? "내 리뷰 과제 · 전체 프로젝트 이력과 승인 근거 열람 가능"
                        : "배정된 리뷰어만 독립 검토와 승인 가능"
                      : "AI 활성화팀장이 리뷰어를 배정하면 검토가 시작됩니다."}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="g3-signatures">
            {!isLowTrack && (
              <div>
                <span className={g3ReviewerApproved ? "signed" : ""}>
                  {g3ReviewerApproved ? "✓" : "1"}
                </span>
                <p>
                  <b>동료 리뷰어</b>
                  <small>
                    {assignedReviewer || "미배정"} ·{" "}
                    {g3ReviewerApproved ? "승인 완료" : "독립 교차 검토 대기"}
                  </small>
                </p>
              </div>
            )}
            {securityRequired && (
              <div>
                <span className={g3SecurityApproved ? "signed" : ""}>
                  {g3SecurityApproved ? "✓" : "2"}
                </span>
                <p>
                  <b>정보보호 담당자</b>
                  <small>
                    {g3SecurityApproved
                      ? "승인 완료"
                      : "데이터·권한·로그 추가 검토 대기"}
                  </small>
                </p>
              </div>
            )}
            <div>
              <span
                className={visibleG3Decision === "APPROVED" ? "signed" : ""}
              >
                {visibleG3Decision === "APPROVED"
                  ? "✓"
                  : isLowTrack
                    ? "1"
                    : securityRequired
                      ? "3"
                      : "2"}
              </span>
              <p>
                <b>AI활성화팀장</b>
                <small>
                  최병두 ·{" "}
                  {visibleG3Decision === "APPROVED"
                    ? "최종 승인 완료"
                    : "최종 배포 승인 대기"}
                </small>
              </p>
            </div>
            {!viewerMode && (isReviewer || isSecurity || isLeader) && (
              <div className="gate-actions">
                <button
                  className="secondary"
                  onClick={() => submitG3("REWORK")}
                >
                  보완 요청
                </button>
                <button
                  className="primary"
                  disabled={
                    isReviewer
                      ? !canReviewerApproveG3
                      : isSecurity
                        ? !securityRequired || !canReviewerApproveG3
                        : isLowTrack
                          ? !canRequestG3
                          : !canLeaderApproveG3
                  }
                  onClick={() => submitG3("APPROVED")}
                >
                  {isReviewer
                    ? "리뷰어 승인"
                    : isSecurity
                      ? "정보보호 승인"
                      : isLowTrack
                        ? "하 트랙 배포 승인"
                        : "G3 최종 승인"}
                </button>
              </div>
            )}
          </div>
          {!viewerMode && isLeader && !canLeaderApproveG3 && !isLowTrack && (
            <div className="gate-role-readonly">
              <Info size={17} weight="fill" />
              <p>
                <b>G3 최종 승인이 잠겨 있습니다.</b>
                <span>
                  {!assignedReviewer
                    ? "AI활성화팀장이 동료 리뷰어를 먼저 배정해야 합니다."
                    : !documentsReady
                    ? "DES·EVP·EVR과 금칙 평가를 먼저 완료해야 합니다."
                    : !depReady
                      ? "배포 체크리스트[DEP] 9개 항목을 모두 확인해야 합니다."
                      : !g3ReviewerApproved
                        ? "동료 리뷰어 승인이 필요합니다."
                        : "상 트랙 정보보호 승인이 필요합니다."}
                </span>
              </p>
            </div>
          )}
        </section>
      )}

      {(!embedded ||
        embeddedSection === "pilot" ||
        embeddedSection === "g4") && (
        <section
          className={`release-grid ${embedded ? "embedded-release-grid" : ""}`}
        >
          {(!embedded || embeddedSection === "pilot") && (
            <article
              className={`panel handoff-work ${!g3Approved ? "locked-stage-card" : ""}`}
            >
              <div className="panel-title">
                <div>
                  <h2>배포 준비 · 파일럿 · 인수인계</h2>
                  <p>
                    DEP A항목은 G3 이전에 완료하고, G3 승인 뒤 파일럿 결과와
                    운영 인수를 기록합니다.
                  </p>
                </div>
                <Pill tone={!g3Approved ? "gray" : "green"}>
                  {!g3Approved ? "G3 승인 후 활성화" : "파일럿 진행"}
                </Pill>
              </div>
              <div className="handoff-checks">
                {[
                  [0, "EVR 승인·ARD 성공 기준 통과"],
                  [5, "로그 기록 정상 작동"],
                  [6, "사용자 가이드[UG] 작성 완료"],
                  [8, "지식 갱신 담당자 절차 전달"],
                ].map(([checkIndex, item]) => (
                  <label key={String(item)}>
                    <input
                      type="checkbox"
                      checked={depChecks[Number(checkIndex)]}
                       disabled={!canEditCurrentProject}
                      onChange={(event) =>
                        setDepChecks((currentChecks) =>
                          currentChecks.map((value, index) =>
                            index === Number(checkIndex)
                              ? event.target.checked
                              : value,
                          ),
                        )
                      }
                    />{" "}
                    <span>
                      <b>{item}</b>
                      <small>
                        {depChecks[Number(checkIndex)]
                          ? "확인 완료"
                          : "G3 배포 차단"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {g3Approved ? (
                <div className="pilot-summary">
                  <div>
                    <small>파일럿 대상</small>
                    <b>{current.dept} 25명</b>
                  </div>
                  <div>
                    <small>기간</small>
                    <b>2주</b>
                  </div>
                  <div>
                    <small>만족도</small>
                    <b>4.6 / 5.0</b>
                  </div>
                  <div>
                    <small>오류 신고</small>
                    <b>1건 · 조치 완료</b>
                  </div>
                </div>
              ) : (
                <div className="locked-stage-notice">
                  <Info size={18} weight="fill" />
                  <p>
                    <b>파일럿 결과는 아직 생성되지 않았습니다.</b>
                    <span>
                      G3 배포 승인이 완료되면 대상·기간·사용량·만족도·오류 결과
                      입력이 활성화됩니다.
                    </span>
                  </p>
                </div>
              )}
              <button
                className="secondary full-button"
                onClick={() => setReleaseDocument("DEP")}
              >
                배포 체크리스트[DEP] · 사용자 가이드[UG] 보기
              </button>
            </article>
          )}
          {(!embedded || embeddedSection === "g4") && (
            <article
              className={`panel g4-card ${!pilotGateReady ? "locked-stage-card" : ""}`}
            >
              <div className="gate-work-head">
                <div>
                  <span className="gate-badge green">G4</span>
                  <div>
                    <p className="eyebrow">SCALE APPROVAL</p>
                    <h2>G4 확산 승인 기록</h2>
                    <p>
                      파일럿 종료 기준을 확인한 프로젝트 Owner와 AI활성화팀장이
                      각각 공동 승인합니다.
                    </p>
                  </div>
                </div>
                <Pill
                  tone={
                    !g3Approved || !pilotGateReady
                      ? "gray"
                      : g4Decision === "APPROVED"
                        ? "green"
                        : g4OwnerApproved
                          ? "blue"
                          : "orange"
                  }
                >
                  {!g3Approved
                    ? "G3 승인 필요"
                    : !pilotResultsSaved
                      ? "파일럿 결과 저장 필요"
                      : !pilotGateReady
                        ? "종료 기준 미달"
                    : g4Decision === "APPROVED"
                      ? "공동 승인 완료"
                      : g4OwnerApproved
                        ? "팀장 승인 대기"
                        : "Owner 승인 대기"}
                </Pill>
              </div>
              {g3Approved ? (
                <>
                  <div className="g4-criteria">
                    {pilotCriteria.map((criterion) => (
                      <span
                        key={criterion.label}
                        className={criterion.passed ? "passed" : "failed"}
                      >
                        <b>{criterion.passed ? "✓" : "!"}</b>
                        {criterion.label}
                        <small>{criterion.value}</small>
                      </span>
                    ))}
                  </div>
                  <div className="g4-review-status">
                    <p>
                      <b>G4 심사 {g4ReviewRound}차</b>
                      <span>
                        {pilotResultsSaved
                          ? pilotGateReady
                            ? "파일럿 결과 저장 완료 · 승인 가능"
                            : "파일럿 종료 기준 미달 · 보완 또는 연장 필요"
                          : "DEP의 파일럿 결과를 저장해야 심사가 열립니다."}
                      </span>
                    </p>
                    {g4Decision === "EXTEND" && (
                      <Pill tone="orange">보완 후 재심사 대기</Pill>
                    )}
                  </div>
                  <div className="g4-signers">
                    <div>
                      <span
                        className={
                          g4OwnerApproved || g4Decision === "APPROVED"
                            ? "signed"
                            : ""
                        }
                      >
                        {g4OwnerApproved || g4Decision === "APPROVED"
                          ? "✓"
                          : "1"}
                      </span>
                      <p>
                        <b>프로젝트 Owner</b>
                        <small>{current.owner} · 확산·운영 책임</small>
                      </p>
                    </div>
                    <div>
                      <span
                        className={g4Decision === "APPROVED" ? "signed" : ""}
                      >
                        {g4Decision === "APPROVED" ? "✓" : "2"}
                      </span>
                      <p>
                        <b>AI활성화팀장</b>
                        <small>최병두 · 최종 확산 승인</small>
                      </p>
                    </div>
                  </div>
                  {!viewerMode && (isOwner || isLeader) && (
                    <div className="g4-decision-area">
                      <label>
                        <span>연장·보완 또는 재심사 사유</span>
                        <textarea
                          value={g4ReviewReason}
                          onChange={(event) =>
                            setG4ReviewReasons((items) => ({
                              ...items,
                              [current.no]: event.target.value,
                            }))
                          }
                          placeholder="예: 사용률이 기준에 미달해 대상 부서를 확대하고 1주 연장합니다."
                        />
                      </label>
                      <div className="g4-actions">
                        <button onClick={() => submitG4("EXTEND")}>
                          파일럿 연장·보완 요청
                        </button>
                        <button
                          className="primary"
                          disabled={
                            !pilotGateReady ||
                            (isLeader && !g4OwnerApproved)
                          }
                          onClick={() => submitG4("APPROVED")}
                        >
                          {isOwner ? "Owner 확산 승인" : "G4 최종 승인"}
                        </button>
                      </div>
                    </div>
                  )}
                  {!pilotGateReady && (
                    <div className="locked-stage-notice">
                      <Info size={18} weight="fill" />
                      <p>
                        <b>G4 승인 기능이 잠겨 있습니다.</b>
                        <span>
                          DEP에서 파일럿 결과를 저장하고 모든 종료 기준을 충족해야
                          Owner 승인 → AI활성화팀장 최종 승인 순서로 진행됩니다.
                        </span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="locked-stage-notice">
                  <Info size={18} weight="fill" />
                  <p>
                    <b>G4 확산 승인은 아직 열리지 않았습니다.</b>
                    <span>
                      G3 승인 후 파일럿을 완료하고 종료 기준을 충족해야
                      Owner·AI활성화팀장 공동 승인 기능이 활성화됩니다.
                    </span>
                  </p>
                </div>
              )}
              <div
                className={`operation-route ${g4Decision === "APPROVED" ? "approved" : ""}`}
              >
                <span>{g4Decision === "APPROVED" ? "✓" : "→"}</span>
                <p>
                  <b>
                    {g4Decision === "APPROVED"
                      ? "운영 · 개선으로 전환"
                      : "파일럿 완료와 공동 승인 후 운영 · 개선으로 이동"}
                  </b>
                  <small>
                    G4 통과 전에는 운영 대장[OPS]에 등록되지 않습니다.
                  </small>
                </p>
              </div>
            </article>
          )}
        </section>
      )}

      {releaseDocument && (
        <div
          className="release-document-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-document-title"
        >
          <button
            className="release-document-scrim"
            aria-label="배포 문서 배경 닫기"
            onClick={() => setReleaseDocument(null)}
          />
          <section className="release-document-sheet">
            <header>
              <div>
                <small>{current.no} · RELEASE & PILOT DOCUMENTS</small>
                <h2 id="release-document-title">
                  {releaseDocument === "DEP"
                    ? "배포 체크리스트[DEP]"
                    : "사용자 가이드[UG]"}
                </h2>
                <p>
                  {releaseDocument === "DEP"
                    ? "DEP A항목은 G3 승인 전에 전부 완료되어야 하며 미확인 항목은 배포를 차단합니다."
                    : "사용자가 Agent의 범위와 한계, 올바른 사용법과 신고 경로를 빠르게 확인합니다."}
                </p>
              </div>
              <button
                aria-label="배포 문서 창 닫기"
                onClick={() => setReleaseDocument(null)}
              >
                <X size={18} weight="bold" />
              </button>
            </header>
            <nav aria-label="배포 문서 선택">
              <button
                className={releaseDocument === "DEP" ? "active" : ""}
                onClick={() => setReleaseDocument("DEP")}
              >
                <span>⑥-1</span>
                <b>배포 체크리스트[DEP]</b>
              </button>
              <button
                className={releaseDocument === "UG" ? "active" : ""}
                onClick={() => setReleaseDocument("UG")}
              >
                <span>⑥-2</span>
                <b>사용자 가이드[UG]</b>
              </button>
            </nav>
            <div className="release-document-body">
              {releaseDocument === "DEP" ? (
                <div className="dep-document">
                  <section>
                    <div className="release-section-title">
                      <span>A</span>
                      <div>
                        <h3>배포 전 필수 확인</h3>
                        <p>
                          하나라도 확인되지 않으면 배포 승인을 진행할 수
                          없습니다.
                        </p>
                      </div>
                      <Pill tone={depReady ? "green" : "orange"}>
                        {depReady
                          ? "9 / 9 확인"
                          : `${depChecks.filter(Boolean).length} / 9 확인`}
                      </Pill>
                    </div>
                    <div className="dep-checklist">
                      {[
                        [
                          "평가 결과 보고서[EVR] 승인 완료",
                          `${current.no}-EVR · v0.6`,
                        ],
                        [
                          "에이전트 요구사항 정의서[ARD] 성공 기준 전 항목 통과",
                          "정확도 90% · 형식 준수 95% · 금칙 0건",
                        ],
                        ["금칙 위반 0건 확인", "적대 평가 6건 포함 · 위반 0건"],
                        [
                          "보안 검토 완료",
                          current.track === "상"
                            ? "정보보호 승인 문서 SEC-2026-041"
                            : "중 트랙 · AI활성화팀 보안 검토",
                        ],
                        [
                          "지식 기준일 및 한계 고지 적용",
                          "지식 기준일 2026.08.20 · 첫 화면 고지 확인",
                        ],
                        ["로그 기록 정상 작동", "테스트 로그 3건 조회 완료"],
                        [
                          "사용자 가이드[UG] 작성 완료",
                          `${current.no}-UG · v1.0`,
                        ],
                        [
                          "비상 연락 체계 및 롤백 방법 확정",
                          "품질혁신팀·AI활성화팀 연락망 / Agent 즉시 중단",
                        ],
                        [
                          "지식 갱신 담당자에게 절차 전달",
                          "품질혁신팀 규정 담당자 확인 필요",
                        ],
                      ].map(([label, note], index) => (
                        <label key={label}>
                          <input
                            type="checkbox"
                            checked={
                              current.no === "2026-018" ||
                              current.no === "2026-014"
                                ? true
                                : depChecks[index]
                            }
                             disabled={!canEditCurrentProject}
                            onChange={(event) =>
                              setDepChecks((currentChecks) =>
                                currentChecks.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? event.target.checked
                                    : value,
                                ),
                              )
                            }
                          />
                          <span>
                            <b>{label}</b>
                            <small>{note}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {canEditCurrentProject && (
                      <div className="release-edit-grid three-columns">
                        <label>
                          보안 검토 근거
                          <input
                            value={depDraft.securityReview}
                            onChange={(event) =>
                              updateDepDraft("securityReview", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          비상 연락·롤백 방법
                          <input
                            value={depDraft.emergencyPlan}
                            onChange={(event) =>
                              updateDepDraft("emergencyPlan", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          지식 갱신 담당·절차
                          <input
                            value={depDraft.knowledgeOwner}
                            onChange={(event) =>
                              updateDepDraft("knowledgeOwner", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    )}
                  </section>
                  <section>
                    <div className="release-section-title">
                      <span>B</span>
                      <div>
                        <h3>배포 방식</h3>
                        <p>파일럿 대상과 종료 기준, 확산 계획을 기록합니다.</p>
                      </div>
                    </div>
                    {canEditCurrentProject ? (
                      <div className="release-edit-grid">
                        <label>
                          파일럿 대상
                          <input
                            value={depDraft.pilotAudience}
                            onChange={(event) =>
                              updateDepDraft("pilotAudience", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          파일럿 기간
                          <input
                            value={depDraft.pilotPeriod}
                            onChange={(event) =>
                              updateDepDraft("pilotPeriod", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          피드백 수집 방법
                          <input
                            value={depDraft.feedbackMethod}
                            onChange={(event) =>
                              updateDepDraft("feedbackMethod", event.target.value)
                            }
                          />
                        </label>
                        <label className="wide-field">
                          파일럿 종료 판정 기준
                          <textarea
                            value={depDraft.exitCriteria}
                            onChange={(event) =>
                              updateDepDraft("exitCriteria", event.target.value)
                            }
                          />
                        </label>
                        <label className="wide-field">
                          확산 공지·교육·일정 계획
                          <textarea
                            value={depDraft.rolloutPlan}
                            onChange={(event) =>
                              updateDepDraft("rolloutPlan", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    ) : (
                    <dl className="release-facts">
                      <div>
                        <dt>파일럿</dt>
                        <dd>{depDraft.pilotAudience} · {depDraft.pilotPeriod} · {depDraft.feedbackMethod}</dd>
                      </div>
                      <div>
                        <dt>종료 판정 기준</dt>
                        <dd>{depDraft.exitCriteria}</dd>
                      </div>
                      <div>
                        <dt>확산 계획</dt>
                        <dd>{depDraft.rolloutPlan}</dd>
                      </div>
                    </dl>
                    )}
                  </section>
                  <section>
                    <div className="release-section-title">
                      <span>C</span>
                      <div>
                        <h3>파일럿 결과 · G4 게이트</h3>
                        <p>실사용 결과를 근거로 확산 여부를 판단합니다.</p>
                      </div>
                      <Pill tone={g3Approved ? "green" : "gray"}>
                        {g3Approved ? "확산 권고" : "G3 승인 후 기록"}
                      </Pill>
                    </div>
                    {g3Approved ? (
                      <>
                        <div className="pilot-result-grid">
                          <article>
                            <small>사용 건수</small>
                            {canEditCurrentProject ? (
                              <input
                                value={depDraft.pilotUsage}
                                onChange={(event) =>
                                  updateDepDraft("pilotUsage", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotUsage}</b>}
                          </article>
                          <article>
                            <small>사용률 (%)</small>
                            {canEditCurrentProject ? (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={depDraft.pilotUsageRate}
                                onChange={(event) =>
                                  updateDepDraft("pilotUsageRate", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotUsageRate}%</b>}
                          </article>
                          <article>
                            <small>오류 신고</small>
                            {canEditCurrentProject ? (
                              <input
                                value={depDraft.pilotErrors}
                                onChange={(event) =>
                                  updateDepDraft("pilotErrors", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotErrors}</b>}
                          </article>
                          <article>
                            <small>치명 오류 (건)</small>
                            {canEditCurrentProject ? (
                              <input
                                type="number"
                                min="0"
                                value={depDraft.pilotCriticalErrors}
                                onChange={(event) =>
                                  updateDepDraft("pilotCriticalErrors", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotCriticalErrors}건</b>}
                          </article>
                          <article>
                            <small>만족도</small>
                            {canEditCurrentProject ? (
                              <input
                                value={depDraft.pilotSatisfaction}
                                onChange={(event) =>
                                  updateDepDraft("pilotSatisfaction", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotSatisfaction}</b>}
                          </article>
                          <article>
                            <small>주요 피드백</small>
                            {canEditCurrentProject ? (
                              <input
                                value={depDraft.pilotFeedback}
                                onChange={(event) =>
                                  updateDepDraft("pilotFeedback", event.target.value)
                                }
                              />
                            ) : <b>{depDraft.pilotFeedback}</b>}
                          </article>
                        </div>
                        <div className="release-decision-row">
                          {["확산 승인 권고", "파일럿 연장 권고", "회수 후 개선 권고"].map((decision) => (
                            <label key={decision}>
                              <input
                                type="radio"
                                name={`pilot-decision-${current.no}`}
                                checked={depDraft.pilotDecision === decision}
                                disabled={!canEditCurrentProject}
                                onChange={() => updateDepDraft("pilotDecision", decision)}
                              />{" "}
                              {decision}
                            </label>
                          ))}
                          <span>
                            G4 확정은 프로젝트 Owner와 AI활성화팀장이 각각
                            승인합니다.
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="locked-stage-notice">
                        <Info size={18} weight="fill" />
                        <p>
                          <b>파일럿 결과 입력 대기</b>
                          <span>
                            G3 배포 승인 전에는 파일럿 실적과 G4 권고를 작성할
                            수 없습니다.
                          </span>
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="ug-document">
                  <section>
                    <span>01</span>
                    <div>
                      <h3>이 Agent는 무엇을 해주나요?</h3>
                      {canEditCurrentProject ? (
                        <textarea
                          className="ug-inline-editor"
                          value={ugDraft.intro}
                          onChange={(event) => updateUgDraft("intro", event.target.value)}
                          aria-label="사용자 가이드 In Scope"
                        />
                      ) : <p>{ugDraft.intro}</p>}
                    </div>
                  </section>
                  <section>
                    <span>02</span>
                    <div>
                      <h3>이런 건 못 해요 / 하지 않아요</h3>
                      {canEditCurrentProject ? (
                        <textarea
                          className="ug-inline-editor"
                          value={ugDraft.outOfScope}
                          onChange={(event) => updateUgDraft("outOfScope", event.target.value)}
                          aria-label="사용자 가이드 Out of Scope"
                        />
                      ) : (
                        <ul>{ugDraft.outOfScope.split("\n").filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ul>
                      )}
                    </div>
                  </section>
                  <section>
                    <span>03</span>
                    <div>
                      <h3>이렇게 사용하세요</h3>
                      {canEditCurrentProject ? (
                        <textarea
                          className="ug-inline-editor tall"
                          value={ugDraft.usageSteps}
                          onChange={(event) => updateUgDraft("usageSteps", event.target.value)}
                          aria-label="사용자 가이드 사용 단계"
                        />
                      ) : (
                        <ol className="ug-steps">
                          {ugDraft.usageSteps.split("\n").filter(Boolean).map((step, index) => (
                            <li key={`${index}-${step}`}><b>{index + 1}</b><p>{step}</p></li>
                          ))}
                        </ol>
                      )}
                      <div className="guide-attachments">
                        <span>화면 캡처 01 · 질문 입력 화면</span>
                        <span>화면 캡처 02 · 근거·이관 확인 화면</span>
                      </div>
                    </div>
                  </section>
                  <section>
                    <span>04</span>
                    <div>
                      <h3>좋은 질문과 잘 안 되는 질문</h3>
                      <div className="question-examples">
                        <div>
                          <b>좋은 질문</b>
                          {canEditCurrentProject ? (
                            <textarea value={ugDraft.goodExamples} onChange={(event) => updateUgDraft("goodExamples", event.target.value)} />
                          ) : ugDraft.goodExamples.split("\n").filter(Boolean).map((item) => <p key={item}>“{item}”</p>)}
                        </div>
                        <div>
                          <b>잘 안 되는 질문</b>
                          {canEditCurrentProject ? (
                            <textarea value={ugDraft.badExamples} onChange={(event) => updateUgDraft("badExamples", event.target.value)} />
                          ) : ugDraft.badExamples.split("\n").filter(Boolean).map((item) => <p key={item}>“{item}”</p>)}
                        </div>
                      </div>
                    </div>
                  </section>
                  <section>
                    <span>05</span>
                    <div>
                      <h3>주의사항</h3>
                      <div className="guide-warning">
                        <WarningCircle size={20} weight="fill" />
                        <p>
                          {canEditCurrentProject ? (
                            <span className="guide-warning-edit">
                              <textarea value={ugDraft.caution} onChange={(event) => updateUgDraft("caution", event.target.value)} />
                              <input value={ugDraft.knowledgeDate} onChange={(event) => updateUgDraft("knowledgeDate", event.target.value)} aria-label="지식 기준일" />
                              <input value={ugDraft.prohibitedInfo} onChange={(event) => updateUgDraft("prohibitedInfo", event.target.value)} aria-label="입력 금지 정보" />
                            </span>
                          ) : <>{ugDraft.caution} 지식 기준일은 <b>{ugDraft.knowledgeDate}</b>입니다. {ugDraft.prohibitedInfo}는 입력하지 마세요.</>}
                        </p>
                      </div>
                    </div>
                  </section>
                  <section>
                    <span>06</span>
                    <div>
                      <h3>문의·오류 신고</h3>
                      <dl className="release-facts">
                        <div>
                          <dt>채널</dt>
                          <dd>{canEditCurrentProject ? <input value={ugDraft.channel} onChange={(event) => updateUgDraft("channel", event.target.value)} /> : <>Agent Portal `이상한 답변 신고` 또는 {ugDraft.channel}</>}</dd>
                        </div>
                        <div>
                          <dt>담당</dt>
                          <dd>{canEditCurrentProject ? <input value={ugDraft.owner} onChange={(event) => updateUgDraft("owner", event.target.value)} /> : ugDraft.owner}</dd>
                        </div>
                        <div>
                          <dt>첨부 요령</dt>
                          <dd>{canEditCurrentProject ? <textarea value={ugDraft.reportingGuide} onChange={(event) => updateUgDraft("reportingGuide", event.target.value)} /> : ugDraft.reportingGuide}</dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                </div>
              )}
            </div>
            <footer>
              <span>
                {canEditCurrentProject
                  ? savedReleaseDocuments[`${current.no}:${releaseDocument}`]
                    ? "저장 완료 · 문서 버전에 반영"
                    : "개발 담당자 작성 · 변경 내용 임시 보관"
                  : "조회·검토 전용 · 개발 담당자 작성 문서"}
              </span>
              <button
                className="secondary"
                onClick={() => setReleaseDocument(null)}
              >
                닫기
              </button>
              <button
                className="primary"
                disabled={!canEditCurrentProject}
                onClick={() => {
                  if (releaseDocument === "DEP") {
                    setDepDocumentDrafts((items) => ({
                      ...items,
                      [current.no]: depDraft,
                    }));
                    if (g4Decision === "EXTEND") {
                      setG4Decision("PENDING");
                      setG4OwnerApproved(false);
                    }
                  } else {
                    setUgDocumentDrafts((items) => ({
                      ...items,
                      [current.no]: ugDraft,
                    }));
                  }
                  setSavedReleaseDocuments((items) => ({
                    ...items,
                    [`${current.no}:${releaseDocument}`]: true,
                  }));
                  notify(
                    releaseDocument === "DEP" && g4Decision === "EXTEND"
                      ? "배포 체크리스트[DEP] 보완 내용을 저장해 G4 재심사를 요청했습니다."
                      : `${releaseDocument === "DEP" ? "배포 체크리스트[DEP]" : "사용자 가이드[UG]"} 작성 내용을 저장했습니다.`,
                  );
                }}
              >
                {canEditCurrentProject
                  ? releaseDocument === "DEP"
                    ? "DEP 작성 내용 저장"
                    : "UG 작성 내용 저장"
                  : "조회 전용"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function OperationsImprovement({
  role,
  notify,
  openGallerySubmission,
}: {
  role: string;
  notify: (s: string) => void;
  openGallerySubmission: (draft: GalleryDraft) => void;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const [activeDocument, setActiveDocument] = useState<"OPS" | "CHG">("OPS");
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [selectedChange, setSelectedChange] = useState<ChangeRow | null>(null);
  const agents = [
    {
      id: "AGT-2026-006",
      name: "구매요청 자동화 Flow",
      type: "규칙형",
      track: "하",
      autonomy: "L2",
      owner: "구매기획팀 김현우",
      operator: "이재승 / 김현우",
      knowledge: "구매기획팀 김현우",
      deployed: "2026.08.28",
      status: "운영",
      checked: "2026.08.29",
      reevaluate: "2026.11.28",
      tone: "green",
      usage: "실행 128건 · 사용자 18명",
      trend: "파일럿 대비 +22.0%",
      quality: "오류 신고 0건",
      qualityNote: "G4 확산 승인 후 정상 운영",
      freshness: "구매 규정 최신성 확인 완료",
      freshnessDate: "확인일 2026.08.29",
      evaluation: "평가셋 v1.0 · 98.1%",
      failure: "승인선 미설정 입력을 차단한 정상 사례를 회귀 평가셋에 유지합니다.",
    },
    {
      id: "AGT-2026-011",
      name: "QMS 품질 가이드",
      type: "판단형(AI)",
      track: "중",
      autonomy: "L0",
      owner: "품질혁신팀장",
      operator: "허정환 / 정수빈",
      knowledge: "품질혁신팀 정수빈",
      deployed: "2026.06.21",
      status: "운영",
      checked: "2026.08.25",
      reevaluate: "2026.09.21",
      tone: "green",
      usage: "세션 486 · 사용자 25명",
      trend: "전월 대비 +18.4%",
      quality: "오류 신고 1건",
      qualityNote: "구 규정 인용 1건 · 지식 교체 완료",
      freshness: "규정 개정 확인 완료",
      freshnessDate: "갱신 완료일 2026.08.21",
      evaluation: "평가셋 v1.4 · 96.2%",
      failure: "구 버전 품질 기준을 인용한 사례를 EVS-011-052로 추가했습니다.",
    },
    {
      id: "AGT-2026-008",
      name: "Outlook 번역 Agent",
      type: "혼합형",
      track: "하",
      autonomy: "L1",
      owner: "글로벌사업팀장",
      operator: "황수정 / 레티투",
      knowledge: "글로벌사업팀 레티투",
      deployed: "2026.06.12",
      status: "운영",
      checked: "2026.08.24",
      reevaluate: "2026.10.12",
      tone: "green",
      usage: "세션 892 · 사용자 114명",
      trend: "전월 대비 +9.1%",
      quality: "오류 신고 2건",
      qualityNote: "베트남어 존칭 오류 · 프롬프트 보완",
      freshness: "용어집 개정 확인 완료",
      freshnessDate: "갱신 완료일 2026.08.19",
      evaluation: "평가셋 v2.1 · 94.8%",
      failure: "베트남어 존칭 오류 사례 2건을 EVS-008-081~082로 추가했습니다.",
    },
    {
      id: "AGT-2026-009",
      name: "QMS 규정 검색 Agent",
      type: "판단형(AI)",
      track: "중",
      autonomy: "L0",
      owner: "품질보증팀장",
      operator: "허정환 / 김도윤",
      knowledge: "담당 공석",
      deployed: "2026.02.11",
      status: "일시중지",
      checked: "2026.07.01",
      reevaluate: "기한 초과",
      tone: "red",
      usage: "세션 4 · 사용자 3명",
      trend: "3개월 연속 기준 미달",
      quality: "오류 신고 3건",
      qualityNote: "지식 기준일 초과로 답변 차단",
      freshness: "갱신 담당 공석",
      freshnessDate: "공석 38일 · 중지 기준 충족",
      evaluation: "재평가 84.0% · Fail",
      failure:
        "개정 규정 미반영 사례를 EVS-009-033으로 등록하고 접근을 일시 차단했습니다.",
    },
    {
      id: "AGT-2025-032",
      name: "회의록 후속조치 정리 Agent",
      type: "혼합형",
      track: "하",
      autonomy: "L1",
      owner: "경영기획팀장",
      operator: "박서연 / 오지훈",
      knowledge: "경영기획팀 오지훈",
      deployed: "2025.11.18",
      status: "운영",
      checked: "2026.08.20",
      reevaluate: "2026.11.18",
      tone: "green",
      usage: "세션 237 · 사용자 42명",
      trend: "전월 대비 +3.2%",
      quality: "오류 신고 0건",
      qualityNote: "대표 실패 사례 없음",
      freshness: "템플릿 개정 없음",
      freshnessDate: "확인일 2026.08.20",
      evaluation: "평가셋 v1.8 · 97.1%",
      failure:
        "범위 밖 일정 생성 요청을 거절한 정상 사례를 회귀 평가셋에 유지합니다.",
    },
  ];
  const visibleOperationAgents = agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) =>
      isLeader
        ? true
        : hasProjectRelationship(role, agent.id.replace("AGT-", "")),
    );
  const effectiveSelectedAgent = visibleOperationAgents.some(
    ({ index }) => index === selectedAgent,
  )
    ? selectedAgent
    : (visibleOperationAgents[0]?.index ?? 0);
  const current = agents[effectiveSelectedAgent];
  const currentProjectNo = current.id.replace("AGT-", "");
  const canEditOperations = hasProjectRelationship(role, currentProjectNo, [
    "OPERATOR",
  ]);
  const canSubmitToGallery =
    role === ACCOUNT_ROLES.user &&
    hasProjectRelationship(role, currentProjectNo, ["OWNER"]) &&
    current.status === "운영";
  const changesByAgent: Record<string, ChangeRow[]> = {
    "AGT-2026-011": [
      [
        "CHG-011-006",
        "2026.08.21",
        "지식",
        "QMS 품질 기준서 v5.3 반영",
        "규정 개정",
        "96.2% · Pass",
        "품질혁신팀장",
      ],
      [
        "CHG-011-005",
        "2026.08.07",
        "프롬프트",
        "답변마다 근거 조항과 기준일 표기",
        "오류 신고",
        "95.6% · Pass",
        "AI활성화팀장",
      ],
    ],
    "AGT-2026-006": [
      [
        "CHG-006-001",
        "2026.08.29",
        "도구",
        "운영 전환 후 승인선 연결 상태 확인",
        "운영 점검",
        "98.1% · Pass",
        "구매기획팀장",
      ],
    ],
    "AGT-2026-008": [
      [
        "CHG-008-004",
        "2026.08.19",
        "지식",
        "한·영·베 용어집 v2.1 반영",
        "용어집 개정",
        "94.8% · Pass",
        "글로벌사업팀장",
      ],
      [
        "CHG-008-003",
        "2026.08.09",
        "프롬프트",
        "베트남어 존칭·수신자 맥락 규칙 강화",
        "오류 신고",
        "95.1% · Pass",
        "AI활성화팀장",
      ],
    ],
    "AGT-2026-009": [
      [
        "CHG-009-007",
        "2026.07.01",
        "지식",
        "지식 갱신 담당 공석으로 답변 기능 일시 중지",
        "월간 점검",
        "84.0% · Fail",
        "품질보증팀장",
      ],
    ],
    "AGT-2025-032": [
      [
        "CHG-032-012",
        "2026.08.12",
        "프롬프트",
        "Action Item 담당자 미식별 시 확인 질문 추가",
        "운영 점검",
        "97.1% · Pass",
        "경영기획팀장",
      ],
    ],
  };
  const changes = changesByAgent[current.id] || [];
  return (
    <>
      <div
        className={`page operations-page ${canEditOperations ? "role-editor-operations" : "role-leader-operations"}`}
      >
        <section className="page-heading">
          <div>
            <p className="eyebrow">04 · OPERATE &amp; IMPROVE</p>
            <h1>운영 · 개선</h1>
            <p>
              팀 전체 Agent의 운영 상태를 한 장에서 보고, 월간 점검과 모든
              변경을 재평가 결과와 함께 관리합니다.
            </p>
          </div>
          {canEditOperations ? (
            <button
              className="primary"
              onClick={() =>
                notify("2026년 8월 운영 점검 기록을 시작했습니다.")
              }
            >
              ＋ 월간 점검 기록
            </button>
          ) : (
            <Pill tone={isLeader ? "violet" : "gray"}>
              {isLeader ? "운영 감독 · 조회" : "운영 결과 조회"}
            </Pill>
          )}
        </section>
        <LifecycleRoleGuide
          role={role}
          stage="operations"
          projectNo={currentProjectNo}
        />
        <div className="operations-principle">
          <span>
            <ArrowsClockwise size={18} weight="bold" />
          </span>
          <div>
            <strong>배포는 완료가 아니라 운영의 시작입니다.</strong>
            <p>
              운영 대장[OPS]은 월 1회와 이벤트 발생 시 갱신하고, 모든 변경은
              개선 이력서[CHG]의 재평가 결과와 짝으로 기록합니다.
            </p>
          </div>
          <Pill tone="green">2026.08 점검 중</Pill>
        </div>
        {canSubmitToGallery && (
          <section className="operations-gallery-callout">
            <div className="operations-gallery-callout-icon">
              <CheckCircle size={22} weight="fill" />
            </div>
            <div>
              <small>G4 최종 승인 · 운영 인수인계 완료</small>
              <strong>{current.name}을 Agent Gallery에 공유할 수 있습니다.</strong>
              <p>
                운영 승인 근거와 사용자 가이드는 자동 첨부되며, AI 활성화팀이
                공개 범위와 안전성을 검토한 뒤 등록합니다.
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                openGallerySubmission({
                  source: "OPERATIONS",
                  projectNo: currentProjectNo,
                  name: current.name,
                  description:
                    "구매요청 입력부터 승인선 확인과 담당자 알림까지 자동화합니다.",
                  platform: "Power Automate",
                  artifactType: "자동화 Flow",
                  category: "생산성",
                  targetUsers: "구매 요청자와 승인 담당자",
                  supportOwner: current.owner,
                  evidence: [
                    "G4 확산 승인 완료",
                    "DEP 배포 체크리스트 완료",
                    "UG 사용자 가이드 작성 완료",
                    "OPS 운영 담당 지정",
                  ],
                })
              }
            >
              Agent Gallery 등록 신청
            </button>
          </section>
        )}
        <section className="operations-metrics">
          <article>
            <small>운영 대장 등록 Agent</small>
            <strong>4</strong>
            <span>운영 3 · 일시중지 1</span>
          </article>
          <article>
            <small>지식 최신성 준수</small>
            <strong>75%</strong>
            <Progress value={75} />
          </article>
          <article>
            <small>분기 재평가 예정</small>
            <strong>2</strong>
            <span>30일 이내 · 기한 초과 1</span>
          </article>
          <article>
            <small>이번 달 변경</small>
            <strong>6</strong>
            <span>전건 재평가 결과 연결</span>
          </article>
        </section>
        <section className="panel operations-document-shell">
          <header className="operations-document-header">
            <div>
              <small>TEAM AGENT OPERATIONS REGISTER</small>
              <h2>
                {activeDocument === "OPS"
                  ? "운영 대장[OPS]"
                  : "개선 이력서[CHG]"}
              </h2>
              <p>
                {activeDocument === "OPS"
                  ? "팀 전체 Agent 목록과 선택한 Agent의 월간 운영 점검 기록입니다."
                  : "변경 내용·사유·재평가 결과·승인을 한 줄의 증적으로 연결합니다."}
              </p>
            </div>
            <nav aria-label="운영 문서 선택">
              <button
                className={activeDocument === "OPS" ? "active" : ""}
                onClick={() => setActiveDocument("OPS")}
              >
                <span>⑦-1</span>운영 대장[OPS]
              </button>
              <button
                className={activeDocument === "CHG" ? "active" : ""}
                onClick={() => setActiveDocument("CHG")}
              >
                <span>⑦-2</span>개선 이력서[CHG]
              </button>
            </nav>
          </header>
          {activeDocument === "OPS" ? (
            <div className="ops-document-body">
              <section className="ops-master-section">
                <div className="ops-section-heading">
                  <div>
                    <span>A</span>
                    <div>
                      <h3>에이전트 목록 · 팀 전체</h3>
                      <p>
                        G4 확산 승인을 통과해 운영 대장에 등록된 Agent만
                        표시합니다.
                      </p>
                    </div>
                  </div>
                  <div>
                    <Pill tone="green">최근 갱신 2026.08.25</Pill>
                    <button
                      onClick={() =>
                        notify("운영 대장[OPS]을 Excel로 내보냈습니다.")
                      }
                    >
                      Excel 내보내기
                    </button>
                  </div>
                </div>
                <div className="ops-table-scroll">
                  <table className="ops-master-table">
                    <thead>
                      <tr>
                        <th>ID · 이름</th>
                        <th>유형</th>
                        <th>트랙</th>
                        <th>자율성</th>
                        <th>오너(현업)</th>
                        <th>개발/운영 담당</th>
                        <th>지식갱신 담당</th>
                        <th>배포일</th>
                        <th>상태</th>
                        <th>최근 점검일</th>
                        <th>다음 재평가일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOperationAgents.map(({ agent, index }) => (
                        <tr
                          key={agent.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${agent.name} 운영 점검 보기`}
                          className={effectiveSelectedAgent === index ? "selected" : ""}
                          onClick={() => setSelectedAgent(index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedAgent(index);
                            }
                          }}
                        >
                          <td>
                            <b>{agent.name}</b>
                            <small>{agent.id}</small>
                          </td>
                          <td>{agent.type}</td>
                          <td>
                            <Pill tone={agent.tone}>{agent.track}</Pill>
                          </td>
                          <td>{agent.autonomy}</td>
                          <td>{agent.owner}</td>
                          <td>{agent.operator}</td>
                          <td
                            className={
                              agent.knowledge === "담당 공석" ? "danger" : ""
                            }
                          >
                            {agent.knowledge}
                          </td>
                          <td>{agent.deployed}</td>
                          <td>
                            <Pill tone={agent.tone}>{agent.status}</Pill>
                          </td>
                          <td>{agent.checked}</td>
                          <td
                            className={
                              agent.reevaluate === "기한 초과" ? "danger" : ""
                            }
                          >
                            {agent.reevaluate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="monthly-ops-section">
                <div className="ops-section-heading">
                  <div>
                    <span>B</span>
                    <div>
                      <h3>월간 운영 점검 기록</h3>
                      <p>
                        {current.id} · {current.name}
                      </p>
                    </div>
                  </div>
                  <Pill tone={current.status === "일시중지" ? "red" : "green"}>
                    {current.status === "일시중지" ? "중지 검토" : "정상 운영"}
                  </Pill>
                </div>
                <div className="monthly-check-grid">
                  <article>
                    <small>점검월 / 점검자</small>
                    <b>2026.08 · {current.operator.split(" / ")[1]}</b>
                    <span>최근 점검 {current.checked}</span>
                  </article>
                  <article>
                    <small>사용량</small>
                    <b>{current.usage}</b>
                    <span
                      className={
                        current.status === "일시중지" ? "danger" : "positive"
                      }
                    >
                      {current.trend}
                    </span>
                  </article>
                  <article>
                    <small>품질</small>
                    <b>{current.quality}</b>
                    <span>{current.qualityNote}</span>
                  </article>
                  <article>
                    <small>지식 최신성</small>
                    <b>
                      {current.status !== "일시중지" && (
                        <Check size={13} weight="bold" />
                      )}{" "}
                      {current.freshness}
                    </b>
                    <span>{current.freshnessDate}</span>
                  </article>
                  <article>
                    <small>분기 정기 재평가</small>
                    <b>{current.evaluation}</b>
                    <span>
                      {current.evaluation.includes("Fail")
                        ? "배포 기준 미달 · 개선 또는 중지 필요"
                        : "배포 기준 90% 이상 · Pass"}
                    </span>
                  </article>
                  <article>
                    <small>운영 판정</small>
                    <div className="ops-decision-options">
                      <label>
                        <input
                          type="radio"
                          name="ops-decision"
                          defaultChecked={current.status === "운영"}
                          disabled={!canEditOperations}
                        />{" "}
                        정상 운영
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="ops-decision"
                          disabled={!canEditOperations}
                        />{" "}
                        개선 필요
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="ops-decision"
                          defaultChecked={current.status === "일시중지"}
                          disabled={!canEditOperations}
                        />{" "}
                        중지 검토
                      </label>
                    </div>
                  </article>
                </div>
                <div className="failure-case-note">
                  <WarningCircle size={17} weight="fill" />
                  <p>
                    <b>대표 실패 사례는 평가셋으로 승격</b>
                    <span>{current.failure}</span>
                  </p>
                  {canEditOperations && (
                    <button
                      onClick={() =>
                        notify("월간 운영 점검 기록이 저장되었습니다.")
                      }
                    >
                      점검 기록 저장
                    </button>
                  )}
                </div>
              </section>
              <section className="sunset-section">
                <div className="ops-section-heading">
                  <div>
                    <span>C</span>
                    <div>
                      <h3>폐기(Sunset) 기준</h3>
                      <p>아래 중 하나라도 충족하면 폐기 검토를 발제합니다.</p>
                    </div>
                  </div>
                  <Pill tone="gray">배포 전 확정 기준</Pill>
                </div>
                <div className="sunset-criteria">
                  <span>3개월 연속 월 사용량 10건 미만</span>
                  <span>대체 시스템·기능 등장</span>
                  <span>지식 갱신 담당 공백 1개월 이상</span>
                  <span>재평가 미달 및 개선 리소스 없음</span>
                </div>
                <div className="sunset-route">
                  <b>폐기 절차</b>
                  <span>사용자 공지(2주 전)</span>
                  <i>→</i>
                  <span>접근 차단</span>
                  <i>→</i>
                  <span>문서·로그 1년 보존</span>
                  <i>→</i>
                  <span>운영 대장 상태 ‘폐기’</span>
                </div>
              </section>
            </div>
          ) : (
            <div className="chg-document-body">
              <section>
                <div className="ops-section-heading">
                  <div>
                    <span>CHG</span>
                    <div>
                      <h3>개선 이력서 · {current.name}</h3>
                      <p>
                        행을 누르면 변경 전·후와 재평가·승인 근거를 확인할 수
                        있습니다.
                      </p>
                    </div>
                  </div>
                  <button
                    className="primary"
                    onClick={() =>
                      notify("새 개선 이력서[CHG] 작성을 시작했습니다.")
                    }
                  >
                    ＋ 변경 기록
                  </button>
                </div>
                <div className="chg-table-scroll">
                  <table className="chg-table">
                    <thead>
                      <tr>
                        <th>변경번호</th>
                        <th>일자</th>
                        <th>유형</th>
                        <th>변경 내용</th>
                        <th>사유</th>
                        <th>재평가 결과</th>
                        <th>승인</th>
                        <th aria-label="상세 보기" />
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((row) => (
                        <tr
                          key={row[0]}
                          role="button"
                          tabIndex={0}
                          aria-label={`${row[0]} 개선 이력 상세 보기`}
                          onClick={() => setSelectedChange(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedChange(row);
                            }
                          }}
                        >
                          <td>
                            <b>{row[0]}</b>
                          </td>
                          <td>{row[1]}</td>
                          <td>
                            <Pill
                              tone={
                                row[2] === "지식"
                                  ? "blue"
                                  : row[2] === "프롬프트"
                                    ? "violet"
                                    : "gray"
                              }
                            >
                              {row[2]}
                            </Pill>
                          </td>
                          <td>{row[3]}</td>
                          <td>{row[4]}</td>
                          <td>
                            <span className="reevaluation-pass">
                              <Check size={12} weight="bold" />
                              {row[5]}
                            </span>
                          </td>
                          <td>{row[6]}</td>
                          <td className="change-detail-link">
                            <span>상세</span>
                            <ArrowRight size={12} weight="bold" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="autonomy-reassessment">
                <span>L↑</span>
                <div>
                  <h3>자율성 수준 변경은 ‘개선’이 아니라 ‘재심사’입니다.</h3>
                  <p>
                    L0→L1 등 자율성 상향 시 에이전트 요구사항 정의서[ARD] 개정,
                    3자 재확인, 전체 재평가와 G3 재승인을 다시 거칩니다.
                  </p>
                </div>
                <div className="reassessment-route">
                  <b>ARD 개정</b>
                  <i>→</i>
                  <b>3자 재확인</b>
                  <i>→</i>
                  <b>전체 재평가</b>
                  <i>→</i>
                  <b>G3 재승인</b>
                </div>
                <button
                  onClick={() =>
                    notify("자율성 변경 재심사 절차를 열었습니다.")
                  }
                >
                  재심사 시작
                </button>
              </section>
            </div>
          )}
        </section>
      </div>
      {selectedChange && (
        <ChangeDetailModal
          row={selectedChange}
          agentName={current.name}
          onClose={() => setSelectedChange(null)}
        />
      )}
    </>
  );
}

function ProjectsHub({
  selected,
  onPortal,
}: {
  selected: (typeof projects)[0] | null;
  onSelect: (p: (typeof projects)[0] | null) => void;
  onPortal: (p?: (typeof projects)[0]) => void;
  notify: (s: string) => void;
}) {
  return (
    <div className="hub-embedded-page">
      <section className="hub-policy-bar">
        <div className="hub-policy-icon">H</div>
        <div>
          <strong>
            AX Projects Hub = 일정·담당자·하위 작업을 관리하는 실행 공간
          </strong>
          <p>
            요구 정의·설계·평가·배포 근거와 G1~G4 승인은 각 Portal 단계와
            Governance에서 관리합니다. Hub 진행률 100%는 게이트 승인과 다릅니다.
          </p>
        </div>
        <button onClick={() => onPortal(selected || undefined)}>
          {selected
            ? "이 프로젝트의 산출물·승인 보기 →"
            : "설계·개발 화면 보기 →"}
        </button>
      </section>
      <iframe
        className="hub-original-frame"
        src="/ax-projects-hub.html"
        title="AX Projects Hub"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

function Gallery({
  query,
  setQuery,
  agents: list,
  notify,
  role,
  databaseStatus,
  applications,
  initialDraft,
  onDraftHandled,
  onSubmitApplication,
  onUpdateApplication,
}: {
  query: string;
  setQuery: (v: string) => void;
  agents: typeof agents;
  notify: (s: string) => void;
  role: AccountRole;
  databaseStatus: DatabaseStatus;
  applications: GalleryApplication[];
  initialDraft: GalleryDraft | null;
  onDraftHandled: () => void;
  onSubmitApplication: (application: GalleryApplication) => void;
  onUpdateApplication: (
    id: string,
    changes: Partial<GalleryApplication>,
  ) => void;
}) {
  const isTeam =
    role === ACCOUNT_ROLES.leader || role === ACCOUNT_ROLES.member;
  const isLeader = role === ACCOUNT_ROLES.leader;
  const submitterProfile =
    role === ACCOUNT_ROLES.leader
      ? { name: "최병두", department: "AI 활성화팀", roleLabel: "AI 활성화팀 팀장" }
      : role === ACCOUNT_ROLES.member
        ? { name: "허정환", department: "AI 활성화팀", roleLabel: "AI 활성화팀 팀원" }
        : { name: "김현우", department: "개발1팀", roleLabel: "일반 User" };
  const [tab, setTab] = useState<"catalog" | "applications" | "review">(
    initialDraft ? "applications" : isTeam ? "review" : "catalog",
  );
  const [submissionOpen, setSubmissionOpen] = useState(Boolean(initialDraft));
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState(
    applications.find((application) => application.status !== "PUBLISHED")?.id ||
      applications[0]?.id ||
      "",
  );
  const emptyDraft: GalleryDraft = { source: "PERSONAL" };
  const sourceDraft = initialDraft || emptyDraft;
  const [form, setForm] = useState({
    source: sourceDraft.source,
    projectNo: sourceDraft.projectNo || "",
    name: sourceDraft.name || "",
    description: sourceDraft.description || "",
    platform: sourceDraft.platform || "Copilot Studio",
    artifactType: sourceDraft.artifactType || "Agent",
    category: sourceDraft.category || "생산성",
    accessUrl: "",
    targetUsers: sourceDraft.targetUsers || "",
    dataClass: "사내",
    supportOwner: sourceDraft.supportOwner || "",
    evidence: sourceDraft.evidence || [],
    submissionMode: "SELF" as "SELF" | "PROXY",
    creatorName: "",
    creatorDepartment: "",
    creatorEmail: "",
  });

  const statusLabel: Record<GalleryReviewStatus, string> = {
    SUBMITTED: "검토 대기",
    IN_REVIEW: "검토 중",
    CHANGES_REQUESTED: "보완 요청",
    RECOMMENDED: "등록 권고",
    PUBLISHED: "등록 완료",
    REJECTED: "등록 반려",
  };
  const statusTone: Record<GalleryReviewStatus, string> = {
    SUBMITTED: "blue",
    IN_REVIEW: "orange",
    CHANGES_REQUESTED: "red",
    RECOMMENDED: "violet",
    PUBLISHED: "green",
    REJECTED: "gray",
  };
  const publishedAgents = applications
    .filter((application) => application.status === "PUBLISHED")
    .map((application) => ({
      icon: application.artifactType === "자동화 Flow" ? "↻" : "✦",
      name: application.name,
      desc: application.description,
      category: application.category,
      users: "신규",
      rating: "-",
      tag: application.platform,
      tone: application.platform === "Power Apps" ? "green" : "blue",
    }));
  const catalog = [...publishedAgents, ...list].filter((agent) =>
    `${agent.name} ${agent.desc} ${agent.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ||
    applications[0];

  const startPersonalSubmission = () => {
    setEditingApplicationId(null);
    setForm({
      source: "PERSONAL",
      projectNo: "",
      name: "",
      description: "",
      platform: "Copilot Studio",
      artifactType: "Agent",
      category: "생산성",
      accessUrl: "",
      targetUsers: "",
      dataClass: "사내",
      supportOwner: "",
      evidence: [],
      submissionMode: "SELF",
      creatorName: "",
      creatorDepartment: "",
      creatorEmail: "",
    });
    setSubmissionOpen(true);
    setTab("applications");
  };
  const startResubmission = (application: GalleryApplication) => {
    const proxyEvidence = application.evidence.find((item) =>
      item.startsWith("대리 등록 · 실제 제작자 "),
    );
    const [creatorName = "", creatorDepartment = "", creatorEmail = ""] =
      proxyEvidence
        ? proxyEvidence
            .replace("대리 등록 · 실제 제작자 ", "")
            .split(" · ")
        : [];
    setEditingApplicationId(application.id);
    setForm({
      source: application.source,
      projectNo: application.projectNo || "",
      name: application.name,
      description: application.description,
      platform: application.platform,
      artifactType: application.artifactType,
      category: application.category,
      accessUrl: application.accessUrl,
      targetUsers: application.targetUsers,
      dataClass: application.dataClass,
      supportOwner: application.supportOwner,
      evidence: application.evidence,
      submissionMode: proxyEvidence ? "PROXY" : "SELF",
      creatorName,
      creatorDepartment,
      creatorEmail,
    });
    setSubmissionOpen(true);
  };
  const closeSubmission = () => {
    setSubmissionOpen(false);
    onDraftHandled();
  };
  const submit = () => {
    if (
      !form.name.trim() ||
      !form.description.trim() ||
      !form.accessUrl.trim() ||
      !form.targetUsers.trim() ||
      !form.supportOwner.trim() ||
      (form.submissionMode === "PROXY" &&
        (!form.creatorName.trim() ||
          !form.creatorDepartment.trim() ||
          !form.creatorEmail.trim()))
    ) {
      notify("필수 항목을 모두 입력해 주세요.");
      return;
    }
    const submittedApplication: GalleryApplication = {
      id: `GAL-${new Date().getFullYear()}-${String(applications.length + 16).padStart(3, "0")}`,
      source: form.source,
      projectNo: form.projectNo || undefined,
      name: form.name.trim(),
      description: form.description.trim(),
      platform: form.platform,
      artifactType: form.artifactType,
      category: form.category,
      accessUrl: form.accessUrl.trim(),
      targetUsers: form.targetUsers.trim(),
      dataClass: form.dataClass,
      supportOwner: form.supportOwner.trim(),
      applicant: `${submitterProfile.name} · ${submitterProfile.roleLabel}`,
      submittedAt: "방금",
      status: "SUBMITTED",
      evidence: [
        ...(form.source === "OPERATIONS"
          ? form.evidence
          : ["사용 화면 링크", "공개 범위·운영 책임 입력", "AI 활성화팀 안전성 검토 예정"]),
        form.submissionMode === "PROXY"
          ? `대리 등록 · 실제 제작자 ${form.creatorName.trim()} · ${form.creatorDepartment.trim()} · ${form.creatorEmail.trim()}`
          : `본인 제작 · ${submitterProfile.name} · ${submitterProfile.department} · ${ACCOUNT_EMAILS[role]}`,
      ],
    };
    if (editingApplicationId) {
      onUpdateApplication(editingApplicationId, {
        ...submittedApplication,
        id: editingApplicationId,
        status: "SUBMITTED",
        reviewerNote: undefined,
        submittedAt: "방금 · 보완 재상신",
      });
      notify("보완 내용이 반영되어 AI 활성화팀에 재상신되었습니다.");
    } else {
      onSubmitApplication(submittedApplication);
    }
    setEditingApplicationId(null);
    closeSubmission();
  };
  const review = (
    status: GalleryReviewStatus,
    message: string,
    reviewerNote?: string,
  ) => {
    if (!selectedApplication) return;
    onUpdateApplication(selectedApplication.id, { status, reviewerNote });
    notify(message);
  };

  return (
    <div className="page gallery-page">
      <section className="gallery-hero">
        <div className="gallery-hero-heading">
          <div>
            <p className="eyebrow">AGENT GALLERY</p>
            <h1>
              일하는 방식을 바꾸는 <span>검증된 Agent</span>
            </h1>
            <p>AI 활성화팀의 검토와 등록 승인을 통과한 사내 Agent만 공개됩니다.</p>
          </div>
          <div className="gallery-hero-actions">
            <span className={`gallery-db-status ${databaseStatus}`}>
              {databaseStatus === "connected"
                ? "PostgreSQL 연결"
                : databaseStatus === "checking"
                  ? "DB 확인 중"
                  : "브라우저 임시 저장"}
            </span>
            {role !== ACCOUNT_ROLES.admin && (
              <button className="gallery-submit-button" onClick={startPersonalSubmission}>
                <Plus size={18} weight="bold" /> {isTeam ? "Agent 올리기" : "내 Agent 올리기"}
              </button>
            )}
            {isTeam && (
              <button className="gallery-review-button" onClick={() => setTab("review")}>
                <ClipboardText size={18} weight="bold" /> 등록 검토 {applications.filter((item) => item.status !== "PUBLISHED").length}건
              </button>
            )}
          </div>
        </div>
        <label className="search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Agent 이름, 업무 또는 부서로 검색"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="chips">
          <button>전체</button>
          <button>생산성</button>
          <button>품질</button>
          <button>개발</button>
          <button>경영지원</button>
          <button>IT</button>
        </div>
      </section>
      <section className="gallery-publish-flow" aria-label="Agent Gallery 등록 경로">
        <article>
          <span className="flow-number">1A</span>
          <div><b>운영 승인 Agent</b><small>G4 승인 · DEP · UG · OPS 근거 자동 연결</small></div>
        </article>
        <article>
          <span className="flow-number">1B</span>
          <div><b>개인 제작 Agent</b><small>Vibe Coding · Copilot Studio · Power Platform</small></div>
        </article>
        <ArrowRight className="gallery-flow-arrow" size={19} weight="bold" />
        <article className="review-step">
          <span className="flow-number">2</span>
          <div><b>AI 활성화팀 검토</b><small>접근권한 · 데이터 · 안전성 · 운영 책임</small></div>
        </article>
        <ArrowRight className="gallery-flow-arrow" size={19} weight="bold" />
        <article className="publish-step">
          <span className="flow-number">3</span>
          <div><b>Gallery 등록</b><small>최종 승인 후 전사 카탈로그 공개</small></div>
        </article>
      </section>

      <nav className="gallery-tabs" aria-label="Gallery 화면 선택">
        <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Agent 둘러보기</button>
        {role !== ACCOUNT_ROLES.admin && (
          <button className={tab === "applications" ? "active" : ""} onClick={() => setTab("applications")}>{isTeam ? "등록 신청 현황" : "내 신청 현황"}</button>
        )}
        {isTeam && (
          <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>등록 검토</button>
        )}
      </nav>

      {tab === "catalog" && (
        <>
          <div className="gallery-title">
            <div><h2>등록 Agent</h2><p>현재 {catalog.length}개의 검증된 Agent를 사용할 수 있습니다.</p></div>
            <select><option>추천순</option><option>사용자순</option><option>평점순</option></select>
          </div>
          <section className="agent-grid">
            {catalog.length === 0 && (
              <div className="gallery-empty-state">
                <FileText size={29} weight="duotone" />
                <b>등록된 Agent가 없습니다.</b>
                <span>검토와 최종 승인을 마친 Agent가 여기에 공개됩니다.</span>
              </div>
            )}
            {catalog.map((a) => (
              <article className="agent-card" key={a.name}>
                <div className={`agent-art ${a.tone}`}><span>{a.icon}</span><Pill tone="white">{a.tag}</Pill></div>
                <div className="agent-body">
                  <Pill>{a.category}</Pill><h3>{a.name}</h3><p>{a.desc}</p>
                  <div className="agent-stats"><span>★ {a.rating}</span><span>사용자 {a.users}</span><span>검토 완료</span></div>
                  <button onClick={() => notify(`${a.name} 사용 화면을 열었습니다.`)}>Agent 보기 <span>→</span></button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {tab === "applications" && role !== ACCOUNT_ROLES.admin && (
        <section className="gallery-applications-panel">
          <header><div><h2>{isTeam ? "Agent 등록 신청" : "내 Agent 등록 신청"}</h2><p>{isTeam ? "본인 제작 또는 대리 등록 신청과 검토 상태를 함께 확인합니다." : "접수부터 보완, 등록 완료까지 진행 상태를 확인합니다."}</p></div><button className="primary" onClick={startPersonalSubmission}>＋ {isTeam ? "Agent 올리기" : "내 Agent 올리기"}</button></header>
          <div className="gallery-application-list">
            {applications.length === 0 && (
              <div className="gallery-empty-state">
                <ClipboardText size={28} weight="duotone" />
                <b>등록 신청 내역이 없습니다.</b>
                <span>Agent 올리기를 눌러 첫 등록 신청을 시작할 수 있습니다.</span>
              </div>
            )}
            {applications.map((application) => (
              <article key={application.id}>
                <div className="application-source"><Pill tone={application.source === "OPERATIONS" ? "green" : "blue"}>{application.source === "OPERATIONS" ? "운영 승인 경로" : "개인 제작 경로"}</Pill><small>{application.id}</small></div>
                <div><b>{application.name}</b><p>{application.platform} · {application.artifactType} · {application.targetUsers}</p></div>
                <div><Pill tone={statusTone[application.status]}>{statusLabel[application.status]}</Pill><small>{application.submittedAt}</small></div>
                {application.reviewerNote && <p className="application-review-note"><WarningCircle size={14} weight="fill" /> {application.reviewerNote}</p>}
                {application.status === "CHANGES_REQUESTED" && <button className="application-resubmit" onClick={() => startResubmission(application)}>보완 후 재상신</button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "review" && isTeam && (
        <section className="gallery-review-workspace">
          <aside className="gallery-review-queue">
            <header><h2>등록 검토 큐</h2><Pill tone="orange">{applications.filter((item) => item.status !== "PUBLISHED").length}건</Pill></header>
            {applications.length === 0 && (
              <div className="gallery-empty-state compact">
                <CheckCircle size={25} weight="duotone" />
                <b>검토 대기 신청이 없습니다.</b>
              </div>
            )}
            {applications.map((application) => (
              <button key={application.id} className={selectedApplication?.id === application.id ? "active" : ""} onClick={() => setSelectedApplicationId(application.id)}>
                <span><Pill tone={application.source === "OPERATIONS" ? "green" : "blue"}>{application.source === "OPERATIONS" ? "운영" : "개인"}</Pill><small>{application.id}</small></span>
                <b>{application.name}</b><em>{application.platform} · {statusLabel[application.status]}</em>
              </button>
            ))}
          </aside>
          {selectedApplication && (
            <article className="gallery-review-detail">
              <header>
                <div><small>{selectedApplication.id} · {selectedApplication.submittedAt}</small><h2>{selectedApplication.name}</h2><p>{selectedApplication.description}</p></div>
                <Pill tone={statusTone[selectedApplication.status]}>{statusLabel[selectedApplication.status]}</Pill>
              </header>
              <div className="gallery-review-summary">
                <div><small>등록 경로</small><b>{selectedApplication.source === "OPERATIONS" ? `운영 승인 과제 · ${selectedApplication.projectNo}` : "개인 제작 Agent"}</b></div>
                <div><small>제작 방식</small><b>{selectedApplication.platform} · {selectedApplication.artifactType}</b></div>
                <div><small>대상 / 데이터</small><b>{selectedApplication.targetUsers} · {selectedApplication.dataClass}</b></div>
                <div><small>운영 책임</small><b>{selectedApplication.supportOwner}</b></div>
              </div>
              <div className="gallery-review-access"><span><b>사용/실행 링크</b><small>{selectedApplication.accessUrl}</small></span><button onClick={() => window.open(selectedApplication.accessUrl, "_blank", "noopener,noreferrer")}>사용 화면 열기 <ArrowRight size={13} weight="bold" /></button></div>
              <section className="gallery-evidence"><h3>제출 근거</h3>{selectedApplication.evidence.map((item) => <span key={item}><CheckCircle size={15} weight="fill" /> {item}</span>)}</section>
              <section className="gallery-review-checklist"><h3>AI 활성화팀 검토</h3><label><input type="checkbox" defaultChecked /> 접근 링크와 사용자 권한 확인</label><label><input type="checkbox" defaultChecked={selectedApplication.source === "OPERATIONS"} /> 데이터 분류와 입력 금지 정보 확인</label><label><input type="checkbox" /> 한계 고지·오류 신고·운영 담당 확인</label></section>
              {selectedApplication.reviewerNote && <div className="gallery-review-note"><b>검토 의견</b><p>{selectedApplication.reviewerNote}</p></div>}
              <footer>
                <button onClick={() => review("CHANGES_REQUESTED", "신청자에게 보완 요청을 전송했습니다.", "한계 고지와 오류 신고 경로를 보완한 뒤 재상신해 주세요.")}>보완 요청</button>
                {!isLeader && <button className="secondary" onClick={() => review("RECOMMENDED", "팀장에게 등록 권고를 전달했습니다.", "동료 검토 완료 · 최종 등록 권고")}>검토 완료 · 등록 권고</button>}
                {isLeader && <button className="primary" onClick={() => review("PUBLISHED", "최종 승인되어 Agent Gallery에 등록되었습니다.", "AI 활성화팀장 최종 등록 승인")}>최종 승인 · Gallery 등록</button>}
              </footer>
            </article>
          )}
        </section>
      )}

      {submissionOpen && (
        <div className="gallery-modal-backdrop" onMouseDown={closeSubmission}>
          <section className="gallery-submission-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{form.source === "OPERATIONS" ? "운영 승인 Agent" : "개인 제작 Agent"}</small><h2>Agent Gallery 등록 신청</h2><p>AI 활성화팀이 접근권한·데이터·안전성과 운영 책임을 검토합니다.</p></div><button aria-label="닫기" onClick={closeSubmission}><X size={18} /></button></header>
            <div className="gallery-form-grid">
              <label className="wide"><span>등록 경로</span><div className="gallery-source-readonly"><b>{form.source === "OPERATIONS" ? "운영 단계 최종 승인 후 등록" : isTeam && form.submissionMode === "PROXY" ? "다른 사람의 Agent 대리 등록" : "내가 직접 만든 Agent 등록"}</b><small>{form.source === "OPERATIONS" ? `${form.projectNo} · G4 승인 근거 자동 연결` : isTeam ? "AI 활성화팀 신청 · 신청자와 실제 제작자를 구분해 기록" : "일반 User 신청 · AI 활성화팀 검토 후 등록"}</small></div></label>
              {isTeam && form.source === "PERSONAL" && (
                <fieldset className="gallery-submitter-mode wide">
                  <legend>등록 대상 *</legend>
                  <label>
                    <input type="radio" name="gallery-submission-mode" checked={form.submissionMode === "SELF"} onChange={() => setForm({ ...form, submissionMode: "SELF" })} />
                    <span><b>내가 만든 Agent</b><small>{submitterProfile.name} · {submitterProfile.department}</small></span>
                  </label>
                  <label>
                    <input type="radio" name="gallery-submission-mode" checked={form.submissionMode === "PROXY"} onChange={() => setForm({ ...form, submissionMode: "PROXY" })} />
                    <span><b>다른 사람의 Agent 대리 등록</b><small>실제 제작자와 신청자를 구분해 기록합니다.</small></span>
                  </label>
                </fieldset>
              )}
              {isTeam && form.submissionMode === "PROXY" && (
                <>
                  <label><span>실제 제작자 이름 *</span><input value={form.creatorName} onChange={(event) => setForm({ ...form, creatorName: event.target.value })} placeholder="예: 박서연" /></label>
                  <label><span>실제 제작자 부서 *</span><input value={form.creatorDepartment} onChange={(event) => setForm({ ...form, creatorDepartment: event.target.value })} placeholder="예: 품질혁신팀" /></label>
                  <label className="wide"><span>실제 제작자 MS 계정 *</span><input type="email" value={form.creatorEmail} onChange={(event) => setForm({ ...form, creatorEmail: event.target.value })} placeholder="name@changshininc.com" /></label>
                </>
              )}
              <label><span>Agent 이름 *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="업무를 알 수 있는 이름" /></label>
              <label><span>제작 플랫폼 *</span><select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}><option>Vibe Coding</option><option>Copilot Studio</option><option>Power Automate</option><option>Power Apps</option><option>기타</option></select></label>
              <label><span>산출물 유형 *</span><select value={form.artifactType} onChange={(event) => setForm({ ...form, artifactType: event.target.value })}><option>Agent</option><option>업무 App</option><option>자동화 Flow</option><option>기타</option></select></label>
              <label><span>업무 카테고리</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>생산성</option><option>품질</option><option>경영지원</option><option>개발</option><option>IT</option></select></label>
              <label className="wide"><span>무엇을 해주는 도구인가요? *</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="사용자와 해결하는 업무, 결과의 범위를 적어 주세요." /></label>
              <label><span>사용 대상 *</span><input value={form.targetUsers} onChange={(event) => setForm({ ...form, targetUsers: event.target.value })} placeholder="예: 구매팀 전원" /></label>
              <label><span>데이터 분류</span><select value={form.dataClass} onChange={(event) => setForm({ ...form, dataClass: event.target.value })}><option>공개</option><option>사내</option><option>기밀</option><option>개인정보 포함</option></select></label>
              <label><span>운영·문의 담당 *</span><input value={form.supportOwner} onChange={(event) => setForm({ ...form, supportOwner: event.target.value })} placeholder="부서와 담당자" /></label>
              <label><span>사용/실행 링크 *</span><input value={form.accessUrl} onChange={(event) => setForm({ ...form, accessUrl: event.target.value })} placeholder="https://" /></label>
              {form.source === "OPERATIONS" && <div className="gallery-linked-evidence wide"><b>자동 연결된 승인 근거</b>{form.evidence.map((item) => <span key={item}><Check size={14} weight="bold" /> {item}</span>)}</div>}
            </div>
            <footer><button onClick={closeSubmission}>취소</button><button className="primary" onClick={submit}>AI 활성화팀 검토 요청</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Governance({
  role,
  onDetail,
  notify,
  projects: adminProjects,
  onDeleteProject,
  onUpdateProject,
  selectedGate,
  onGateChange,
}: {
  role: AccountRole;
  onDetail: (p: (typeof projects)[0]) => void;
  notify: (s: string) => void;
  projects: UserProject[];
  onDeleteProject: (projectNo: string) => void;
  onUpdateProject: (
    projectNo: string,
    changes: Partial<UserProject>,
  ) => void;
  selectedGate: string;
  onGateChange: (gate: string) => void;
}) {
  const isAdmin = role === ACCOUNT_ROLES.admin;
  const [tab, setTab] = useState("계정·역할");
  const [editingProjectNo, setEditingProjectNo] = useState<string | null>(null);
  const [adminDraft, setAdminDraft] = useState({
    name: "",
    status: "",
    owner: "",
    handler: "",
    dueDate: "",
    nextAction: "",
  });
  const accounts: string[][] = [];
  void onDetail;
  void selectedGate;
  void onGateChange;
  const editProject = (project: UserProject) => {
    setEditingProjectNo(project.no);
    setAdminDraft({
      name: project.name,
      status: project.status,
      owner: project.owner,
      handler: project.handler,
      dueDate: project.dueDate,
      nextAction: project.nextAction,
    });
  };
  const saveProject = () => {
    if (!editingProjectNo || !adminDraft.name.trim()) return;
    onUpdateProject(editingProjectNo, {
      name: adminDraft.name.trim(),
      status: adminDraft.status.trim(),
      owner: adminDraft.owner.trim(),
      handler: adminDraft.handler.trim(),
      dueDate: adminDraft.dueDate.trim(),
      nextAction: adminDraft.nextAction.trim(),
    });
    notify(`${editingProjectNo} 과제 정보가 수정되었습니다.`);
    setEditingProjectNo(null);
  };
  const deleteAnyProject = (project: UserProject) => {
    if (!window.confirm(`Admin 권한으로 '${project.name}' 과제를 삭제하시겠습니까?`))
      return;
    onDeleteProject(project.no);
    if (editingProjectNo === project.no) setEditingProjectNo(null);
    notify(`${project.no} 과제가 Admin 권한으로 삭제되었습니다.`);
  };
  return (
    <div className="page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">CONTROL & ASSURANCE</p>
          <h1>Admin & Governance</h1>
          <p>
            {isAdmin
              ? "MS 계정 역할, 프로젝트 권한 정책과 변경 감사 이력을 관리합니다."
              : "MS 계정 역할, 프로젝트 배정과 Governance 현황을 조회합니다."}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => notify("계정·권한 감사 리포트를 준비했습니다.")}
        >
          권한 감사 리포트 내보내기
        </button>
      </section>
      <section className="governance-summary">
        <div>
          <p>등록 MS 계정</p>
          <strong>{accounts.length}</strong>
          <small>DB 계정 연동 후 표시</small>
        </div>
        <div>
          <p>계정 역할</p>
          <strong>4</strong>
          <small>팀장 · 팀원 · User · admin</small>
        </div>
        <div>
          <p>프로젝트 배정</p>
          <strong>{adminProjects.length}</strong>
          <small>등록된 Agent 과제 기준</small>
        </div>
        <div>
          <p>권한 검토 필요</p>
          <strong>0</strong>
          <small>검토 대상 없음</small>
        </div>
      </section>
      <section className="panel admin-panel">
        <div className="admin-tabs">
          {["계정·역할", "Agent 과제 관리", "권한 정책", "감사 로그"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "감사 로그" && <b>3</b>}
            </button>
          ))}
        </div>
        {tab === "계정·역할" && (
          <div className="admin-content">
            <div className="filter-row">
              <div>
                <button className="active">전체 {accounts.length}</button>
                <button>AI팀 0</button>
                <button>일반 User 0</button>
                <button>admin 0</button>
              </div>
              <label>
                ⌕{" "}
                <input
                  aria-label="MS 계정 검색"
                  placeholder="이름 또는 MS 계정 검색"
                />
              </label>
            </div>
            <div className="approval-table">
              <div className="approval-head">
                <span>사용자 · MS 계정</span>
                <span>계정 역할</span>
                <span>프로젝트별 권한</span>
                <span>할당 기준</span>
                <span>상태</span>
                <span />
              </div>
              {accounts.map(([name, email, accountRole, scope, source, status]) => (
                <button
                  key={email}
                  onClick={() => notify(`${name} 계정의 역할·배정 이력을 열었습니다.`)}
                >
                  <span>
                    <b>{name}</b>
                    <small>{email}</small>
                  </span>
                  <span>
                    <Pill tone={accountRole === "admin" ? "violet" : "blue"}>
                      {accountRole}
                    </Pill>
                  </span>
                  <span>
                    <b>{scope}</b>
                    <small>프로젝트 배정과 함께 자동 갱신</small>
                  </span>
                  <span><small>{source}</small></span>
                  <span><Pill tone="green">{status}</Pill></span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "Agent 과제 관리" && (
          <div className="admin-content admin-project-manager">
            <header>
              <div>
                <b>{isAdmin ? "전체 Agent 과제 수정·삭제" : "전체 Agent 과제 현황"}</b>
                <p>
                  {isAdmin
                    ? "Admin은 생애주기 단계와 관계없이 모든 과제를 수정하거나 삭제할 수 있습니다."
                    : "AI 활성화팀은 전체 과제의 단계·Owner·담당 현황을 조회합니다."}
                </p>
              </div>
              <Pill tone={isAdmin ? "violet" : "blue"}>
                {isAdmin ? "Admin 전용" : "AI 활성화팀 조회"}
              </Pill>
            </header>
            <div className="admin-project-table">
              <div className="admin-project-head">
                <span>Agent 과제</span>
                <span>현재 단계</span>
                <span>Owner</span>
                <span>담당</span>
                <span>관리</span>
              </div>
              {adminProjects.map((project) => (
                <div className="admin-project-row" key={project.no}>
                  <span>
                    <b>{project.name}</b>
                    <small>{project.no} · {project.status}</small>
                  </span>
                  <span>{userJourney[project.journeyStep]?.title || "운영·개선"}</span>
                  <span>{project.owner}</span>
                  <span>{project.handler}</span>
                  <span className="admin-project-actions">
                    {isAdmin ? (
                      <>
                        <button onClick={() => editProject(project)}>
                          <PencilSimple size={14} weight="bold" /> 수정
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteAnyProject(project)}
                        >
                          <Trash size={14} weight="bold" /> 삭제
                        </button>
                      </>
                    ) : (
                      <Pill tone="gray">조회 전용</Pill>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {isAdmin && editingProjectNo && (
              <section className="admin-project-editor" aria-label="Agent 과제 수정">
                <header>
                  <div>
                    <small>{editingProjectNo}</small>
                    <h3>Agent 과제 정보 수정</h3>
                  </div>
                  <button
                    aria-label="수정 닫기"
                    onClick={() => setEditingProjectNo(null)}
                  >
                    <X size={18} />
                  </button>
                </header>
                <div>
                  <label>
                    과제명
                    <input
                      value={adminDraft.name}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    상태
                    <input
                      value={adminDraft.status}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, status: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Project Owner
                    <input
                      value={adminDraft.owner}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, owner: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    담당자
                    <input
                      value={adminDraft.handler}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, handler: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    프로젝트 마감일
                    <input
                      value={adminDraft.dueDate}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, dueDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    다음 행동
                    <textarea
                      value={adminDraft.nextAction}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, nextAction: event.target.value })
                      }
                    />
                  </label>
                </div>
                <footer>
                  <button
                    className="secondary"
                    onClick={() => setEditingProjectNo(null)}
                  >
                    취소
                  </button>
                  <button className="primary" onClick={saveProject}>
                    변경사항 저장
                  </button>
                </footer>
              </section>
            )}
          </div>
        )}
        {tab === "권한 정책" && (
          <div className="admin-content approval-empty-state">
            <ShieldCheck size={28} weight="duotone" />
            <b>계정 역할과 프로젝트 배정 권한을 분리합니다.</b>
            <span>리뷰어는 배정 시점부터 전체 이력을 조회하고 지정된 게이트에서만 승인할 수 있습니다.</span>
          </div>
        )}
        {tab === "감사 로그" && (
          <div className="admin-content approval-empty-state">
            <ClipboardText size={28} weight="duotone" />
            <b>최근 권한 변경 3건</b>
            <span>역할 변경·프로젝트 배정·회수 이력을 MS 계정과 시각 기준으로 보관합니다.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function suggestRequestTitle(problem: string) {
  if (!problem.trim()) return "대화를 시작하면 제목을 제안합니다.";
  if (/공급업체|협력사/.test(problem)) return "공급업체 변경 영향 분석 Agent";
  if (/BOM/i.test(problem)) return "BOM 변경 영향 분석 Agent";
  if (/출장/.test(problem)) return "출장 규정 문의 Agent";
  if (/품질|불량/.test(problem)) return "품질 이슈 분석 Agent";
  const summary = problem
    .replace(/[.。].*$/, "")
    .replace(/합니다|됩니다|있습니다|해요|입니다/g, "")
    .trim()
    .slice(0, 24);
  return `${summary || "신규 업무"} Agent`;
}

function RequestWizard({
  role,
  step,
  setStep,
  close,
  onSubmit,
}: {
  role: AccountRole;
  step: number;
  setStep: (n: number) => void;
  close: () => void;
  onSubmit: (
    answers: string[],
    title: string,
    projectOwner: string,
    requester: string,
  ) => void;
}) {
  const isAiTeam =
    role === ACCOUNT_ROLES.leader || role === ACCOUNT_ROLES.member;
  const labels = [
    "업무 문제",
    "업무량",
    "자료 · 데이터",
    "기대 결과",
    "희망 완료일",
  ];
  const prompts = [
    "먼저 어떤 업무가 가장 힘들거나 실수가 잦은지 알려주세요.",
    "좋습니다. 이 업무가 얼마나 자주 발생하고 시간이 얼마나 드는지 확인할게요.",
    "현재 업무에 사용하는 시스템과 참고 자료를 알려주세요.",
    "원하는 결과와 잘못됐을 때의 위험을 확인할게요.",
    "마지막으로 언제까지 개발되었으면 좋겠는지 희망 완료일을 알려주세요. G2에서 실현 가능한 프로젝트 마감일로 확정합니다.",
  ];
  const examples = [
    "예: 개발 BOM 변경 시 관련 부품과 품질 문서를 수작업으로 확인합니다.",
    "예: 월 20건, 건당 45분, 담당자 2명이 처리합니다.",
    "예: SAP BOM, Excel 변경 목록, QMS 품질 문서를 사용합니다.",
    "예: 영향 범위를 10분 안에 파악하고 누락 위험을 줄이고 싶습니다.",
    "2026-10-30",
  ];
  const [answers, setAnswers] = useState(["", "", "", "", ""]);
  const [submitted, setSubmitted] = useState(false);
  const [requesterName, setRequesterName] = useState("");
  const [requesterDepartment, setRequesterDepartment] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [ownerMode, setOwnerMode] = useState<"SELF" | "OTHER">("SELF");
  const [projectOwner, setProjectOwner] = useState("");
  const resolvedRequester = isAiTeam
    ? requesterName.trim() && requesterDepartment.trim() && requesterEmail.trim()
      ? `${requesterName.trim()} · ${requesterDepartment.trim()} · ${requesterEmail.trim()}`
      : ""
    : "김현우 · 개발1팀 · kim.hw@changshininc.com";
  const requesterOwnerLabel = isAiTeam
    ? requesterName.trim() && requesterDepartment.trim()
      ? `${requesterName.trim()} · ${requesterDepartment.trim()}`
      : ""
    : "김현우 · 개발1팀";
  const resolvedProjectOwner =
    ownerMode === "SELF" ? requesterOwnerLabel : projectOwner.trim();
  const requestTitle = suggestRequestTitle(answers[0]);
  const updateAnswer = (value: string) =>
    setAnswers((items) =>
      items.map((item, index) => (index === step - 1 ? value : item)),
    );
  const advance = () => {
    if (!answers[step - 1].trim() || submitted) return;
    if (step < 5) setStep(step + 1);
    else {
      setSubmitted(true);
      if (!resolvedProjectOwner || !resolvedRequester) return;
      onSubmit([...answers], requestTitle, resolvedProjectOwner, resolvedRequester);
      close();
    }
  };
  return (
    <div className="modal-wrap">
      <button className="modal-scrim" aria-label="닫기" onClick={close} />
      <section
        className="wizard chat-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-wizard-title"
      >
        <header>
          <div>
            <Pill tone="blue">요구 접수 Agent</Pill>
            <h2 id="request-wizard-title">{isAiTeam ? "새 Agent 과제 등록" : "새 Agent 과제 요청"}</h2>
            <p>{isAiTeam ? "회의 내용을 바탕으로 요청자를 대신해 요구 접수서를 작성합니다." : "Agent와 대화하면 왼쪽의 요구 접수서가 실시간으로 작성됩니다."}</p>
          </div>
          <button aria-label="요청 창 닫기" onClick={close}>
            <X size={17} />
          </button>
        </header>
        <div className="wizard-steps">
          {labels.map((label, index) => (
            <div className={step >= index + 1 ? "active" : ""} key={label}>
              <span>
                {step > index + 1 ? (
                  <Check size={13} weight="bold" />
                ) : (
                  index + 1
                )}
              </span>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div className="chat-wizard-grid">
          <section className="wizard-document-preview">
            <header>
              <small>INT · 자동 작성 중</small>
              <h3>에이전트 요구 접수서</h3>
            </header>
            <div>
              <b>요청 제목</b>
              <p>{requestTitle}</p>
            </div>
            <div className="filled">
              <b>요구자 / Project Owner</b>
              <p>요구자 · {resolvedRequester || "오른쪽에서 요청자를 입력해 주세요."}</p>
              {isAiTeam && <p>접수 등록자 · {role}</p>}
              <p>
                Owner · {resolvedProjectOwner || "오른쪽에서 지정해 주세요."}
              </p>
            </div>
            {labels.map((label, index) => (
              <div
                key={label}
                className={
                  answers[index]
                    ? "filled"
                    : index === step - 1
                      ? "editing"
                      : ""
                }
              >
                <b>
                  {index + 1}. {label}
                </b>
                <p>
                  {answers[index] ||
                    (index === step - 1
                      ? "오른쪽 질문에 답변해 주세요."
                      : "아직 작성되지 않았습니다.")}
                </p>
              </div>
            ))}
            <footer>
              <span>자동 저장됨</span>
              <b>{answers.filter(Boolean).length}/5 항목 작성</b>
            </footer>
          </section>
          <section className="wizard-chat-panel">
            <header>
              <span className="brand-mark">AX</span>
              <div>
                <strong>요구 접수 Agent</strong>
                <small>질문 {step}/5 · 답변은 자동 저장됩니다</small>
              </div>
            </header>
            <div className="wizard-chat-history">
              {answers.slice(0, step - 1).map((answer, index) => (
                <div className="wizard-answer-pair" key={`${answer}-${index}`}>
                  <div className="chat-message agent">
                    <small>요구 접수 Agent</small>
                    <p>{prompts[index]}</p>
                  </div>
                  <div className="chat-message user">
                    <small>나</small>
                    <p>{answer}</p>
                  </div>
                </div>
              ))}
              <div className="chat-message agent current">
                <small>요구 접수 Agent</small>
                <p>{prompts[step - 1]}</p>
              </div>
            </div>
            <div className="wizard-chat-input">
              {step === 5 ? (
                <div className="wizard-final-fields">
                  {isAiTeam && (
                    <fieldset className="wizard-owner-field wizard-requester-field">
                      <legend>요구자 정보</legend>
                      <p>회의를 요청했거나 업무 문제를 제기한 실제 요구자를 입력합니다.</p>
                      <input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} placeholder="요구자 이름" aria-label="요구자 이름" />
                      <input value={requesterDepartment} onChange={(event) => setRequesterDepartment(event.target.value)} placeholder="소속 부서" aria-label="요구자 소속 부서" />
                      <input type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} placeholder="MS 계정 이메일" aria-label="요구자 MS 계정 이메일" />
                    </fieldset>
                  )}
                  <label className="wizard-date-input">
                    <span>희망 완료일</span>
                    <input
                      type="date"
                      min="2026-08-29"
                      value={answers[step - 1]}
                      onInput={(event) =>
                        updateAnswer((event.target as HTMLInputElement).value)
                      }
                      onChange={(event) => updateAnswer(event.target.value)}
                    />
                  </label>
                  <fieldset className="wizard-owner-field">
                    <legend>Project Owner 지정</legend>
                    <p>요구자와 Owner는 같을 수도, 다를 수도 있습니다.</p>
                    <label>
                      <input
                        type="radio"
                        name="project-owner-mode"
                        checked={ownerMode === "SELF"}
                        onChange={() => setOwnerMode("SELF")}
                      />
                      요구자와 동일{requesterOwnerLabel ? ` · ${requesterOwnerLabel}` : ""}
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="project-owner-mode"
                        checked={ownerMode === "OTHER"}
                        onChange={() => setOwnerMode("OTHER")}
                      />
                      다른 Owner 지정
                    </label>
                    {ownerMode === "OTHER" && (
                      <input
                        value={projectOwner}
                        onChange={(event) => setProjectOwner(event.target.value)}
                        placeholder="예: 박서연 · 품질혁신팀장"
                        aria-label="Project Owner 이름과 소속"
                      />
                    )}
                  </fieldset>
                </div>
              ) : (
                <textarea
                  value={answers[step - 1]}
                  onChange={(event) => updateAnswer(event.target.value)}
                  placeholder={examples[step - 1]}
                />
              )}
              <button
                disabled={
                  !answers[step - 1].trim() ||
                  (step === 5 && (!resolvedRequester || !resolvedProjectOwner)) ||
                  submitted
                }
                onClick={advance}
              >
                {step === 5 ? (isAiTeam ? "Agent 과제 등록" : "접수서 제출") : "답변 저장"}
                <ArrowRight size={15} weight="bold" />
              </button>
            </div>
          </section>
        </div>
        <footer>
          <button
            className="ghost"
            onClick={step === 1 ? close : () => setStep(step - 1)}
          >
            {step === 1 ? "나중에 이어서 하기" : "← 이전 질문"}
          </button>
          <div>
            <span>
              {step === 5
                ? "희망 완료일을 확인한 뒤 접수서를 제출하세요"
                : "닫아도 작성 이력이 남습니다"}
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ProjectDrawer({
  project: p,
  role,
  close,
  openWorkflow,
  notify,
}: {
  project: (typeof projects)[0];
  role: string;
  close: () => void;
  openWorkflow: (view: View, projectNo: string) => void;
  notify: (s: string) => void;
}) {
  const isLeader = role === ACCOUNT_ROLES.leader;
  const isTeamMember = role === ACCOUNT_ROLES.member;
  const relationships = getProjectRelationships(role, p.no);
  const isReviewer = relationships.includes("REVIEWER");
  const isOperator = relationships.includes("OPERATOR");
  const workflowView: View =
    p.step.includes("요구 정의") || p.step.includes("G2")
      ? "definition"
      : p.step.includes("평가") || p.step.includes("G3")
        ? "delivery"
        : "intake";
  const primaryLabel = isLeader
    ? "승인 검토 열기"
    : isReviewer
      ? "전체 이력 · 리뷰 열기"
      : isTeamMember
        ? "담당 업무 열기"
      : isOperator
        ? "운영 점검 열기"
        : "진행 화면 열기";
  const primaryView: View = isOperator ? "operations" : workflowView;
  return (
    <div className="drawer-wrap">
      <button
        className="modal-scrim"
        aria-label="과제 상세 배경 닫기"
        onClick={close}
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-drawer-title"
      >
        <header>
          <div>
            <Pill tone={p.tone}>{p.step}</Pill>
            <small>{p.no}</small>
            <h2 id="project-drawer-title">{p.name}</h2>
            <p>
              {p.dept} · AI활성화팀 PIC {p.owner}
            </p>
          </div>
          <button aria-label="과제 상세 닫기" onClick={close}>
            <X size={17} />
          </button>
        </header>
        <section className="drawer-progress">
          <div>
            <span>Portal 생애주기</span>
            <b>{p.progress}%</b>
          </div>
          <Progress value={p.progress} />
          <div className="step-track">
            <span className="done">접수</span>
            <span className={p.progress >= 30 ? "done" : "current"}>G1</span>
            <span
              className={
                p.progress >= 45 ? "done" : p.progress >= 30 ? "current" : ""
              }
            >
              정의
            </span>
            <span className={p.progress >= 45 ? "current" : ""}>
              {p.step.includes("G3") ? "G3" : "개발"}
            </span>
            <span>운영</span>
          </div>
        </section>
        <section className="drawer-section">
          <h3>핵심 통제 정보</h3>
          <div className="fact-grid">
            <div>
              <small>트랙</small>
              <strong>{p.track} 트랙</strong>
            </div>
            <div>
              <small>자율성</small>
              <strong>{p.autonomy}</strong>
            </div>
            <div>
              <small>데이터 분류</small>
              <strong>{p.track === "상" ? "기밀 / 개인정보" : "내부"}</strong>
            </div>
            <div>
              <small>Agent Owner</small>
              <strong>{p.dept} 팀장</strong>
            </div>
          </div>
        </section>
        <section className="drawer-section">
          <div className="section-title">
            <h3>필수 산출문서</h3>
            <button onClick={() => openWorkflow(workflowView, p.no)}>
              전체 보기
            </button>
          </div>
          <div className="document-list">
            {[
              "에이전트 요구 접수서[INT]",
              "타당성 평가서[FEA]",
              "에이전트 요구사항 정의서[ARD]",
              "평가 결과 보고서[EVR]",
            ].map((d, i) => {
              const completed = p.progress >= [10, 30, 45, 75][i];
              return (
                <button
                  key={d}
                  onClick={() => openWorkflow(workflowView, p.no)}
                >
                  <span className={completed ? "complete" : "review"}>
                    {completed ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>{d}</strong>
                    <small>
                      {completed ? "완료 · 최신 버전" : "작성·검토 대기"}
                    </small>
                  </div>
                  <b>›</b>
                </button>
              );
            })}
          </div>
        </section>
        <section className="drawer-section hub-box">
          <span className="hub-logo">H</span>
          <div>
            <strong>AX Projects Hub</strong>
            <p>
              실행 작업 {p.progress}% · 상태 {p.hub}
            </p>
          </div>
        </section>
        <footer>
          <button
            className="secondary"
            onClick={() =>
              isLeader || isTeamMember || isOperator
                ? notify(
                    isOperator
                      ? "운영 이슈 기록을 작성합니다."
                      : "보완 요청을 작성합니다.",
                  )
                : close()
            }
          >
            {isOperator
              ? "이슈 기록"
              : isLeader || isTeamMember
                ? "보완 요청"
                : "닫기"}
          </button>
          <button
            className="primary"
            onClick={() => openWorkflow(primaryView, p.no)}
          >
            {primaryLabel}
          </button>
        </footer>
      </aside>
    </div>
  );
}
