import {
  designDocumentComplete,
  developmentEvdComplete,
  documentComplete,
  gateGaps,
  releaseEvdComplete,
  requiredApprovers,
} from "./workflow-v31.mjs";
import { ardLiteGaps,ardLiteDocumentComplete } from "./fast-track.mjs";
import {intakeRequired} from './intake-standard.mjs';
import {isProjectParty} from './project-actors.mjs';
import {canManageAssessment} from './document-role-policy.mjs';

const same = (left, right) =>
  left !== undefined &&
  left !== null &&
  right !== undefined &&
  right !== null &&
  String(left) === String(right);

export function isAssignedDeveloper(project, actorId) {
  return Boolean(actorId !== '' && (project.developerIds || []).some((id) => same(id, actorId)));
}

export function filterProjectList(projects, filter, actorId) {
  if (filter === '내 할 일') return projects.filter(project => isAssignedDeveloper(project, actorId));
  if (filter === '진행 중') return projects.filter(project => project.status !== '내 작성 필요');
  return projects;
}

function actorRelations(project, actor) {
  const developer = isAssignedDeveloper(project, actor.id);
  const requester = isProjectParty(project,actor,'requester');
  const owner = isProjectParty(project,actor,'owner');
  return {
    developer,
    author: developer,
    feaAuthor:canManageAssessment(actor.appRole),
    requirementsAuthor:canManageAssessment(actor.appRole),
    requester,
    owner,
    securityReviewer: same(project.securityReviewerId, actor.id),
    teamLeader: actor.appRole === "team_leader",
    admin: actor.appRole === "admin",
  };
}

const routeForStep = (step) =>
  step <= 2 ? "intake" : step <= 4 ? "definition" : "delivery";

function item(project, title, body, journeyStep = project.journeyStep, tone = "info", deliveryPhase) {
  return {
    projectNo: project.no,
    projectName: project.name,
    title,
    body,
    journeyStep,
    deliveryPhase,
    view: routeForStep(journeyStep),
    tone,
  };
}

function gateRoleForActor(project, actor, relations, gate) {
  const roles = requiredApprovers(gate, project).filter(role=>!project.workflowApprovals?.[gate]?.[role]?.decision);
  if (roles.includes("team_leader") && relations.teamLeader) return "team_leader";
  if (roles.includes("requester") && relations.requester) return "requester";
  if (roles.includes("owner") && relations.owner) return "owner";
  if (roles.includes("security_reviewer") && relations.securityReviewer) return "security_reviewer";
  return null;
}

function currentGateNotification(project, actor, relations, gate) {
  const gateStep = { G1: 2, G2: 4, G3: 6, G4: 8 }[gate];
  const approvals = project.workflowApprovals?.[gate] || {};
  const rework = Object.values(approvals).find((vote) => vote?.decision === "REWORK");

  if (rework && (gate === 'G1' ? relations.feaAuthor : gate==='G2'?relations.requirementsAuthor:relations.author)) {
    const editStep = { G1: 1, G2: 3, G3: 5, G4: 7 }[gate];
    return item(
      project,
      `${gate} 보완 요청 반영`,
      rework.reason || "승인자의 보완 요청을 확인하고 문서를 수정해 주세요.",
      editStep,
      "danger",
      editStep === 5 ? project.deliveryPhase || "development" : undefined,
    );
  }

  // Wait for the author to resubmit rather than prompting other approvers.
  if (rework) return null;

  const role = gateRoleForActor(project, actor, relations, gate);
  if (!role || approvals[role]?.decision) return null;
  const gaps = gateGaps(gate, project);
  return { ...item(
    project,
    `${gate} 승인 요청`,
    gaps.length
      ? `${gate} 근거를 확인하고 승인 또는 보완 요청을 처리해 주세요. 승인 전 확인: ${gaps.slice(0, 2).join(" · ")}`
      : "근거를 확인하고 승인 또는 보완 요청을 처리해 주세요.",
    gateStep,
    gaps.length ? "warning" : "danger",
  ), recipientRole: {team_leader:'AI 활성화팀장',requester:'요구자',owner:'Project Owner',security_reviewer:'보안 검토 담당자'}[role] };
}

function projectNotification(project, actor) {
  const step = Number(project.journeyStep || 0);
  const relations = actorRelations(project, actor);
  const fast = project.fastTrack;
  const fastIntakeReady=Boolean(project.intakeReview?.at&&project.intakeDraftCompleted&&!intakeRequired(project).length);

  if (project.historicalImport && !project.historicalImportFinalizedAt) {
    // Import preparation is internal work, even if an external contributor
    // is already assigned. Normal role notifications begin after finalization.
    if (relations.developer && ['team_member','team_leader','admin'].includes(actor.appRole)) {
      return item(project, "과거 과제 이관 보완", "현재 단계까지의 누락 내용을 보완하거나 이관을 완료해 주세요.", step, "warning", project.deliveryPhase);
    }
    return null;
  }

  if (['REQUESTED','QUALIFIED'].includes(fast?.status)&&!fastIntakeReady&&(relations.requester||relations.owner)) {
    return item(project,'INT AI 인터뷰·검토','부족한 접수 정보를 보완하고 INT 확인을 완료해 주세요.',0,'danger');
  }
  if (fast?.status === "REQUESTED" && relations.teamLeader) {
    return item(project, "Fast Track 자격 판정", "외부 요인과 기한을 확인하고 자격을 판정해 주세요.", 0, "danger");
  }
  if (fast?.status === "QUALIFIED") {
    if (relations.admin && !(project.developerIds || []).length) {
      return item(project, "Fast Track 개발 담당자 배정", "GF 승인 전에 개발 담당자를 배정해 주세요.", 0, "danger");
    }
    if (fastIntakeReady&&relations.requirementsAuthor&&!ardLiteDocumentComplete(project)) {
      return item(project, "ARD-Lite 작성", "최소 요구정의 .md를 첨부하고 최종 버전을 완료해 주세요.", 0, "danger");
    }
    if (relations.teamLeader && fastIntakeReady && ardLiteDocumentComplete(project) && project.developerIds?.length) {
      return item(project, "GF 긴급 착수 승인", "ARD-Lite와 담당자 배정을 확인하고 GF를 승인해 주세요.", 0, "danger");
    }
  }
  if (fast?.status === "GF_APPROVED" && !fast.ownerNotifiedAt && (relations.admin || relations.teamLeader)) {
    return item(project, "Project Owner 통보 기록", "GF 승인 후 24시간 이내 통보 여부를 기록해 주세요.", step, "danger", project.deliveryPhase);
  }

  if (step === 0) {
    if (relations.requester && !project.intakeDraftCompleted) {
      return item(project, "요구 접수서 작성", "INT 필수 정보를 보완하고 AI Agent 검토를 완료해 주세요.", 0, "danger");
    }
    return null;
  }

  if (step === 1) {
    if (relations.feaAuthor && !project.feaCompleted) {
      return item(project, "타당성 평가서 작성", "AI 초안을 확인·보완하고 FEA 작성을 완료해 주세요.", 1, "danger");
    }
    return null;
  }

  if (step === 2) {
    if(project.g1Resolution?.decision==='DROP')return relations.feaAuthor?item(project,'G1 보완 요청 반영',project.g1Resolution.reason||'Drop 사유를 확인하고 FEA를 보완해 주세요.',1,'danger'):null;
    if(project.historicalImport&&project.feaCompleted===false&&!project.g1Resolution)return relations.feaAuthor?item(project,'타당성 평가서 작성','FEA 보완 내용을 저장하고 작성 완료해 주세요.',1,'danger'):null;
    if (Object.values(project.workflowApprovals?.G1 || {}).some(vote=>vote?.decision==='REWORK')) {
      return currentGateNotification(project, actor, relations, 'G1');
    }
    if (relations.teamLeader && !project.g1Resolution) {
      return item(project, "G1 착수 판정", "완료된 FEA를 확인하고 Go·Conditional Go·Drop을 판정해 주세요.", 2, "danger");
    }
    if (relations.admin && ["GO", "CONDITIONAL"].includes(project.g1Resolution?.decision) && !(project.developerIds || []).length) {
      return item(project, "개발 담당자 배정", "G1 판정이 완료되었습니다. 개발 담당자를 배정해 주세요.", 2, "danger");
    }
    if (["GO", "CONDITIONAL"].includes(project.g1Resolution?.decision)) return null;
    return currentGateNotification(project, actor, relations, "G1");
  }

  if (step === 3) {
    if (relations.requirementsAuthor && !documentComplete(project, 3, "ARD")) {
      return item(project, "ARD 요구 정의 작성", "AI Agent와 함께 요구 정의서를 작성하고, 내용을 확인한 후 G2 승인을 요청해 주세요.", 3, "danger");
    }
    return null;
  }

  if (step === 4) return currentGateNotification(project, actor, relations, "G2");

  if (step === 5) {
    if (project.deliveryPhase !== "development") {
      if (relations.author && !designDocumentComplete(project)) {
        return item(project, "설계 작성 완료", "최종 DES .md 버전을 확인하고 완료 버튼을 눌러 주세요.", 5, "danger", "design");
      }
      if (relations.author) {
        return item(project, "개발·평가 시작", "설계 문서를 확인하고 개발·평가 단계로 전환해 주세요.", 5, "warning", "design");
      }
      return null;
    }
    if (relations.author && !developmentEvdComplete(project)) {
      return item(project, "개발·평가 작성 완료", "최종 EVD .md 버전과 평가 근거를 확인하고 완료 버튼을 눌러 주세요.", 5, "danger", "development");
    }
    if (relations.requester && !project.uatRecord?.completed) {
      return item(project, "요구자 UAT 확인", "실제 업무 케이스의 확인 결과를 등록해 주세요.", 5, "danger", "development");
    }
    if (relations.author) {
      const gaps = gateGaps("G3", project).filter((gap) => !gap.includes("UAT"));
      if (gaps.length) return item(project, "G3 평가 근거 보완", gaps.join(" · "), 5, "warning", "development");
    }
    return null;
  }

  if (step === 6) {
    if(relations.requester&&!project.uatRecord?.completed)return item(project,"요구자 UAT 확인","실제 업무 케이스의 확인 결과를 등록해 주세요.",6,"danger","development");
    return currentGateNotification(project, actor, relations, "G3");
  }

  if (step === 7) {
    if (fast?.status === "GF_APPROVED" && (relations.admin || relations.teamLeader)) {
      return item(project, "Fast Track 한시 배포 시작", "G3 승인 결과를 확인하고 한시 배포를 시작해 주세요.", 7, "danger");
    }
    if (fast?.status === "TEMPORARY") {
      const regularizationGaps = [
        !project.intakeDraftCompleted,
        !project.feaCompleted,
        !documentComplete(project, 3, "ARD"),
        !designDocumentComplete(project),
      ].some(Boolean);
      if (relations.author && regularizationGaps) {
        return item(project, "Fast Track 정규화 문서 보완", "INT·FEA·ARD·DES 누락 문서를 30일 안에 보완해 주세요.", 7, "danger");
      }
      const regularRole = relations.teamLeader ? "team_leader" : relations.requester ? "requester" : relations.owner ? "owner" : null;
      if (regularRole && !fast.regularizationApprovals?.[regularRole]?.decision) {
        return item(project, "Fast Track 정규화 확인", "보완 문서를 확인하고 정규화 승인 또는 보완 요청을 처리해 주세요.", 7, "danger");
      }
      return null;
    }
    if (relations.author && !releaseEvdComplete(project)) {
      return item(project, "배포·확산 작성 완료", "최종 EVD 후속 버전과 파일럿 결과를 확인하고 완료 버튼을 눌러 주세요.", 7, "danger");
    }
    if (relations.author && gateGaps("G4", project).length) {
      return item(project, "G4 파일럿 근거 보완", gateGaps("G4", project).join(" · "), 7, "warning");
    }
    return null;
  }

  if (step === 8) return currentGateNotification(project, actor, relations, "G4");

  if (step === 9 && project.lowRoute?.enabled && relations.author) {
    if (!project.lowRoute.registeredAt) return item(project, "운영 대장 등록", "하 트랙 OPS 등록 정보를 확인해 주세요.", 9, "danger");
    if (project.lowRoute.phase !== "operating") return item(project, "하 트랙 배포", "운영 대장 등록 후 즉시 배포를 확정해 주세요.", 9, "warning");
  }
  return null;
}

export function buildWorkNotifications(projects, actor) {
  if (!actor?.id || !actor?.appRole) return [];
  return (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.source === "database")
    .flatMap((project) => {
      const notification = projectNotification(project, actor);
      if (!notification) return [];
      const role = notification.recipientRole || (
        /G1 착수 판정|Fast Track 자격 판정|GF 긴급 착수 승인/.test(notification.title) ? 'AI 활성화팀장' :
        /개발 담당자 배정/.test(notification.title) ? 'Admin' :
        /UAT|요구 접수서 작성/.test(notification.title) ? '요구자' :
        /타당성 평가서 작성|G1 보완 요청|ARD 요구 정의 작성|G2 보완 요청|ARD-Lite 작성/.test(notification.title) ? (actor.appRole==='team_leader'?'AI 활성화팀장':'Admin') :
        isAssignedDeveloper(project, actor.id) ? '개발 담당자' :
        isProjectParty(project,actor,'requester') ? '요구자' :
        isProjectParty(project,actor,'owner') ? 'Project Owner' :
        actor.appRole === 'team_leader' ? 'AI 활성화팀장' : 'Admin'
      );
      return [{...notification,recipientRole:role}];
    })
    .sort((left, right) => {
      const toneOrder = { danger: 0, warning: 1, info: 2 };
      return (toneOrder[left.tone] ?? 9) - (toneOrder[right.tone] ?? 9);
    });
}
