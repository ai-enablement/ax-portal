import {classifyProject,TRACKS,TRACK_LABELS} from './project-classification.mjs';
import {standardDocuments,sectionHasContent} from './standard-documents.mjs';
import {intakeRequired,feaRequired} from './intake-standard.mjs';
import {isHistoricalDocumentComplete} from './historical-import-policy.mjs';
export const GATE_STEPS={G1:2,G2:4,G3:6,G4:8};
export const ROLE_LABELS={requester:'요구자',owner:'Project Owner',team_leader:'AI 활성화팀장',security_reviewer:'정보보호 승인자'};
export const JOURNEY_V31=[
  {step:0,title:'요구 접수',number:1},{step:1,title:'타당성 평가',number:2},
  {step:2,title:'착수 승인',gate:'G1'},{step:3,title:'요구 정의',number:3},
  {step:4,title:'개발 착수 승인',gate:'G2'},{step:5,phase:'design',title:'설계',number:4},
  {step:5,phase:'development',title:'개발·평가',number:5},{step:6,title:'배포 승인',gate:'G3'},
  {step:7,title:'배포·확산',number:6},{step:8,title:'확산 승인',gate:'G4'},
];
export function projectTrack(state) {
  if(state.nativeAgentArtifacts?.ARD?.status==='complete'&&['L2','L3','L4'].includes(state.nativeAgentArtifacts.ARD.autonomy))return 'HIGH';
  const nativeTrack=state.nativeAgentArtifacts?.FEA?.status==='complete'?state.nativeAgentArtifacts.FEA.track:null;
  if(nativeTrack==='HIGH')return 'HIGH';
  const ard=state.historicalDocuments?.[3]?.documents?.ARD;
  const ardLevel=String(ard?.fields?.['autonomy.level']||'').match(/^L([0-4])/);
  if(ardLevel&&Number(ardLevel[1])>=2)return 'HIGH';
  const ardTrack=Object.entries(TRACK_LABELS).find(([,label])=>label===ard?.fields?.['autonomy.track'])?.[0];
  if(ard?.status==='complete'&&ardTrack){
    const feaTrack=state.feaDraft?classifyProject(state.feaDraft).track:'LOW';
    const approvedTrack=TRACKS.includes(state.workflowTrack)?state.workflowTrack:'LOW';
    return TRACKS[Math.max(TRACKS.indexOf(ardTrack),TRACKS.indexOf(feaTrack),TRACKS.indexOf(approvedTrack))];
  }
  if(state.workflowTrack)return state.workflowTrack;
  if(TRACKS.includes(nativeTrack))return nativeTrack;
  const f=state.feaDraft;
  if(!f||['writeExec','sensitive','damageFinancial','scope','autonomy'].some(k=>f[k]===undefined||f[k]===''))return 'UNKNOWN';
  return classifyProject(f).track;
}
export function isLowRoute(state){return state.lowRoute?.enabled===true;}
export function displayStage(state){const n=Number(state.journeyStep);return n<=0?1:n<=2?2:n<=4?3:n===5?(state.deliveryPhase==='development'?5:4):n===6?5:6;}
export function requiredApprovers(gate,state){
  if(gate==='G1')return ['team_leader'];
  if(gate==='G2')return ['requester','owner','team_leader'];
  if(gate==='G3')return projectTrack(state)==='HIGH'||projectTrack(state)==='UNKNOWN'?['team_leader','security_reviewer']:['team_leader'];
  if(gate==='G4')return ['owner','team_leader'];
  return [];
}
export function allApproved(gate,state) {
  const roles=requiredApprovers(gate,state);
  return roles.length>0&&roles.every(role=>state.workflowApprovals?.[gate]?.[role]?.decision==='APPROVED');
}
export function historicalGateComplete(gate,state){
  const gateStep=GATE_STEPS[gate];
  const baseline=Number(state.historicalBaselineStep??state.historicalResumeStep);
  return state.historicalImport===true&&Number.isFinite(baseline)&&Number.isFinite(gateStep)&&gateStep<baseline;
}
export function documentComplete(state,stage,code){
  if(state.nativeAgentArtifacts?.[code]?.status==='complete'&&Number(state.nativeAgentArtifacts[code].version)>0)return true;
  if(isHistoricalDocumentComplete(state,stage,code))return true;
  const d=state.historicalDocuments?.[stage]?.documents?.[code];
  return d?.status==='complete'&&standardDocuments[code]?.sections.every(s=>sectionHasContent(s,d.fields));
}
export function markdownDocumentComplete(state,code,phase){
  if(isHistoricalDocumentComplete(state,phase==='deployment_rollout'?7:5,phase==='design'?'DES':'EVD'))return true;
  const record=state.markdownDocuments?.[code]?.phases?.[phase];
  if(!record||Number(record.version)<=0)return false;
  // Records created before phase completion was separated from upload have no status.
  return record.status===undefined||record.status==='complete';
}
export function designDocumentComplete(state){return markdownDocumentComplete(state,'DES','design')||documentComplete(state,5,'DES');}
export function developmentEvdComplete(state){return markdownDocumentComplete(state,'EVD','development_evaluation')||documentComplete(state,5,'EVR');}
export function releaseEvdComplete(state){return markdownDocumentComplete(state,'EVD','deployment_rollout')||documentComplete(state,7,'DEP');}
export function gateGaps(gate,state){
  if(gate==='G1')return [...(!state.feaCompleted?['FEA 작성 완료']:[]),...(state.nativeAgentArtifacts?.INT?.status==='complete'||isHistoricalDocumentComplete(state,0)?[]:intakeRequired(state).map(f=>f.label)),...(state.nativeAgentArtifacts?.FEA?.status==='complete'||isHistoricalDocumentComplete(state,1)?[]:feaRequired(state).map(f=>f.label))];
  if(gate==='G2')return documentComplete(state,3,'ARD')?[]:['ARD 필수 항목 작성 완료'];
  if(gate==='G3'){
    const c=state.gateChecks?.G3||{};
    return [...(!developmentEvdComplete(state)?['개발·평가 문서[EVD] 첨부 완료']:[]),...(c.criteriaPassed!==true?['ARD 성공 기준 전 항목 통과']:[]),...(c.zeroViolations!==true?['금칙 위반 0건']:[]),...(!String(c.evidence||'').trim()?['평가 근거 문서·버전']:[]),...(state.uatRecord?.completed!==true?['요구자 UAT 완료']:[])];
  }
  if(gate==='G4'){
    const c=state.gateChecks?.G4||{};
    return [...(!releaseEvdComplete(state)?['배포·확산 EVD 후속 버전 첨부 완료']:[]),...(c.criteriaPassed!==true?['파일럿 종료 기준 충족']:[]),...(!String(c.evidence||'').trim()?['파일럿 결과·종료 판정 근거']:[])];
  }
  return ['알 수 없는 게이트'];
}
export function eligibleRole(role,actor,project,state){
  const same=id=>id!=null&&String(id)===String(actor.id);
  if(!actor.is_active)return false;
  if(role==='requester')return same(project.requester_id);
  if(role==='owner')return same(project.owner_id);
  if(role==='team_leader')return actor.app_role==='team_leader';
  if(role==='security_reviewer')return same(state.securityReviewerId);
  return false;
}
export function gateBasis(gate,state){
  return JSON.stringify(gate==='G2'?[state.historicalDocuments?.[3],state.nativeAgentArtifacts?.ARD,projectTrack(state)]:
    gate==='G3'?[state.historicalDocuments?.[5],state.markdownDocuments?.DES?.phases?.design,state.markdownDocuments?.EVD?.phases?.development_evaluation,state.gateChecks?.G3,state.securityReviewerId,state.uatRecord]:
    gate==='G4'?[state.historicalDocuments?.[7],state.markdownDocuments?.EVD?.phases?.deployment_rollout,state.markdownDocuments?.UG?.phases?.deployment_rollout,state.gateChecks?.G4]:[state.intakeAnswers,state.intakeDetails,state.feaDraft,state.feaCompleted,state.nativeAgentArtifacts?.INT,state.nativeAgentArtifacts?.FEA]);
}
export function gateSummary(gate,state){
  const roles=requiredApprovers(gate,state);
  return `${roles.filter(r=>state.workflowApprovals?.[gate]?.[r]?.decision==='APPROVED').length}/${roles.length} 승인`;
}
