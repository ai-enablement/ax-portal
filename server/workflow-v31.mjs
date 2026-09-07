import {allApproved,requiredApprovers,eligibleRole,gateGaps,gateBasis,projectTrack,documentComplete,designDocumentComplete,developmentEvdComplete,releaseEvdComplete,isLowRoute,GATE_STEPS,displayStage} from '../shared/workflow-v31.mjs';
import {isImportInProgress} from '../shared/historical-import-policy.mjs';
import {ardLiteGaps,fastTrackRequestGaps,FAST_TRACK_STATUSES} from '../shared/fast-track.mjs';
import {intakeRequired,feaRequired} from '../shared/intake-standard.mjs';
export class WorkflowError extends Error {constructor(status,message){super(message);this.status=status;}}
const deny=(message,status=400)=>{throw new WorkflowError(status,message);};
const serverKeys=['workflowApprovals','workflowApprovalHistory','workflowTrack','workflowVersion','lowRoute','uatRecord','intakeReview','feaAuthor','markdownDocuments','fastTrack','ardLite'];
const markdownPhaseDocument={design:'DES',development_evaluation:'EVD',deployment_rollout:'EVD'};
export function sanitizeNewWorkflow(state){
  const fastTrackRequest=state.fastTrack;
  const historicalStep=Number(state.journeyStep??0),historicalPhase=state.deliveryPhase;
  for(const key of [...serverKeys,'securityReviewerId','gateChecks','gateVote','uatConfirm','lowRouteAction','lowKnowledgeOwnerId','deliveryPhase','markdownCompleteAction'])delete state[key];
  if(state.historicalImport&&historicalStep>=5)state.deliveryPhase=historicalStep===5&&historicalPhase==='design'?'design':'development';
  if(!state.historicalImport)for(const key of ['g1Resolution','g2Approvals','g2Approval','feaCompleted','historicalDocuments'])delete state[key];
  if(!state.historicalImport&&fastTrackRequest?.requested===true){
    const gaps=fastTrackRequestGaps(fastTrackRequest);
    if(gaps.length)deny(`Fast Track 필수 항목을 확인해 주세요: ${gaps.join(', ')}`);
    state.fastTrack={
      requested:true,
      status:FAST_TRACK_STATUSES.REQUESTED,
      externalFactor:fastTrackRequest.externalFactor,
      externalDeadline:fastTrackRequest.externalDeadline,
      externalReason:String(fastTrackRequest.externalReason).trim(),
      requestedAt:new Date().toISOString(),
    };
    state.journeyStep=0;
    state.status='Fast Track 자격 판정 대기';
    state.nextAction='AI 활성화팀장 Fast Track 자격 판정';
    state.scheduleState='GF 자격 판정 대기';
  }
  return state;
}
export function applyWorkflow(previous,changes,merged,actor,project,now=new Date().toISOString()){
  for(const key of serverKeys)if(key in changes)deny('승인·단축 경로 상태는 서버에서만 변경할 수 있습니다.',403);
  if('g2Approvals' in changes)deny('승인 결과를 직접 수정할 수 없습니다.',403);
  const step=Number(previous.journeyStep??0);
  if(!previous.historicalImport&&step===0&&(changes.feaDraft||changes.feaCompleted||Number(merged.journeyStep)>0))deny('요구 접수 Agent 검토를 완료한 뒤 FEA를 작성해 주세요.');
  const author=actor.app_role==='admin'||(previous.developerIds||[]).map(String).includes(String(actor.id));
  const importOpen=isImportInProgress(previous);
  if(changes.deliveryPhase)deny('설계 문서의 완료 버튼으로 다음 단계로 이동해 주세요.');
  if([5,7].includes(step)&&Number(changes.journeyStep)>step&&!changes.markdownCompleteAction)deny('현재 문서의 완료 버튼으로 다음 Gate를 요청해 주세요.');
  let markdownPhaseChanged=false;
  if(changes.markdownCompleteAction){
    if(!author)deny('지정 개발 담당자 또는 Admin만 단계 작성을 완료할 수 있습니다.',403);
    const phase=String(changes.markdownCompleteAction.phase||''),documentType=markdownPhaseDocument[phase];
    if(!documentType)deny('완료할 문서 단계를 확인해 주세요.');
    const currentPhase=phase==='design'?(step===5&&previous.deliveryPhase!=='development')||step===6:
      phase==='development_evaluation'?(step===5&&previous.deliveryPhase==='development')||step===6:
      step===7||step===8;
    const importedPhase=importOpen&&((phase==='design'&&step>=5)||(phase==='development_evaluation'&&step>=5)||(phase==='deployment_rollout'&&step>=7));
    if(!currentPhase&&!importedPhase)deny('현재 진행 중인 문서 단계만 완료할 수 있습니다.');
    const document=previous.markdownDocuments?.[documentType],entry=document?.phases?.[phase];
    if(!entry||Number(entry.version)<=0)deny(`${phase==='design'?'설계 DES':phase==='development_evaluation'?'개발·평가 EVD':'배포·확산 EVD'} 최종 버전을 먼저 첨부해 주세요.`);
    const completedEntry={...entry,status:'complete',completedVersion:Number(entry.version),completedAt:now,completedById:String(actor.id),completedByName:actor.display_name};
    merged.markdownDocuments={...(previous.markdownDocuments||{}),[documentType]:{...document,phases:{...(document.phases||{}),[phase]:completedEntry}}};
    markdownPhaseChanged=true;
    if(!importOpen){
      if(phase==='design'&&step===5)merged.deliveryPhase='development';
      if(phase==='development_evaluation'&&step===5)merged.journeyStep=6;
      if(phase==='deployment_rollout'&&step===7){
        if(!String(merged.gateChecks?.G4?.evidence||'').trim())deny('파일럿 결과·종료 판정 근거를 저장한 뒤 배포·확산 작성을 완료해 주세요.');
        merged.journeyStep=8;
      }
    }
    delete merged.markdownCompleteAction;
  }
  if(importOpen){
    if(changes.gateVote||changes.uatConfirm||changes.lowRouteAction||changes.deliveryPhase)deny('과거 이관 완료 후 승인·단계 이동을 진행해 주세요.');
    return merged;
  }
  merged.workflowVersion='3.1';
  if(changes.fastTrackAction){
    const action=changes.fastTrackAction;
    const fast=previous.fastTrack;
    if(!fast?.requested||previous.historicalImport)deny('Fast Track 신청 과제에서만 처리할 수 있습니다.');
    merged.fastTrack=structuredClone(fast);
    if(action.type==='qualify'||action.type==='reject'){
      if(actor.app_role!=='team_leader'||fast.status!==FAST_TRACK_STATUSES.REQUESTED)deny('팀장이 자격 판정 대기 중인 Fast Track만 판정할 수 있습니다.',403);
      if(!String(action.reason||'').trim())deny('자격 판정 사유를 입력해 주세요.');
      if(action.type==='reject'){
        merged.fastTrack={...fast,status:FAST_TRACK_STATUSES.REJECTED,eligibilityReason:String(action.reason).trim(),rejectedByName:actor.display_name,rejectedAt:now};
        merged.status='Fast Track 자격 미충족';
        merged.nextAction='정규 접수 절차로 계속 진행';
      }else{
        merged.fastTrack={...fast,status:FAST_TRACK_STATUSES.QUALIFIED,eligibilityReason:String(action.reason).trim(),qualifiedByName:actor.display_name,qualifiedAt:now};
        merged.status='ARD-Lite 작성 및 GF 승인 대기';
        merged.nextAction='ARD-Lite 6개 항목 작성';
      }
    }else if(action.type==='save_ard_lite'){
      if(![FAST_TRACK_STATUSES.QUALIFIED].includes(fast.status))deny('Fast Track 자격 판정 후 ARD-Lite를 작성할 수 있습니다.');
      merged.ardLite={...(previous.ardLite||{}),...(action.ardLite||{})};
      merged.nextAction=ardLiteGaps(merged.ardLite).length?'ARD-Lite 필수 항목 보완':'AI 활성화팀장 GF 긴급 착수 승인';
    }else if(action.type==='approve_gf'){
      if(actor.app_role!=='team_leader'||fast.status!==FAST_TRACK_STATUSES.QUALIFIED)deny('팀장이 자격을 인정한 Fast Track만 GF 승인할 수 있습니다.',403);
      const gaps=ardLiteGaps(merged.ardLite);
      if(gaps.length)deny(`ARD-Lite 필수 항목을 확인해 주세요: ${gaps.join(', ')}`);
      if(!(merged.developerIds||[]).length)deny('Admin이 개발 담당자를 먼저 배정해 주세요.');
      const due=new Date(Date.parse(now)+24*60*60*1000).toISOString();
      merged.fastTrack={...fast,status:FAST_TRACK_STATUSES.GF_APPROVED,gfApprovedByName:actor.display_name,gfApprovedAt:now,ownerNotificationDueAt:due};
      merged.journeyStep=5;
      merged.deliveryPhase='development';
      merged.status='Fast Track 개발·평가 진행 중';
      merged.nextAction='EVD 평가와 요구자 UAT 준비';
    }else if(action.type==='notify_owner'){
      if(!['admin','team_leader'].includes(actor.app_role)||fast.status!==FAST_TRACK_STATUSES.GF_APPROVED)deny('GF 승인 후 Admin 또는 팀장이 오너 통보를 기록할 수 있습니다.',403);
      merged.fastTrack={...fast,ownerNotifiedAt:now,ownerNotifiedByName:actor.display_name};
    }else if(action.type==='start_temporary'){
      if(!['admin','team_leader'].includes(actor.app_role)||fast.status!==FAST_TRACK_STATUSES.GF_APPROVED||step!==7||!allApproved('G3',merged))deny('G3 승인 완료 후 Admin 또는 팀장이 한시 배포를 시작할 수 있습니다.',403);
      merged.fastTrack={...fast,status:FAST_TRACK_STATUSES.TEMPORARY,temporaryDeployedAt:now,regularizationDueAt:new Date(Date.parse(now)+30*24*60*60*1000).toISOString(),regularizationApprovals:{}};
      merged.status='Fast Track 한시 배포 · 정규화 진행 중';
      merged.nextAction='30일 내 INT·FEA·정식 ARD·DES 보완 및 3자 확인';
    }else if(action.type==='regularization_vote'){
      if(fast.status!==FAST_TRACK_STATUSES.TEMPORARY||step!==7)deny('한시 배포 중인 Fast Track만 정규화 확인할 수 있습니다.');
      const role=action.role;
      if(!['requester','owner','team_leader'].includes(role)||!eligibleRole(role,actor,project,merged))deny('이 정규화 확인 역할의 담당자가 아닙니다.',403);
      if(!['APPROVED','REWORK'].includes(action.decision))deny('유효한 정규화 확인 결과가 필요합니다.');
      if(action.decision==='REWORK'&&!String(action.reason||'').trim())deny('보완 사유를 입력해 주세요.');
      const gaps=[...intakeRequired(merged),...feaRequired(merged)].map(field=>field.label);
      if(!merged.feaCompleted)gaps.unshift('FEA 작성 완료');
      if(!documentComplete(merged,3,'ARD'))gaps.push('정식 ARD 작성 완료');
      if(!designDocumentComplete(merged))gaps.push('DES .md 첨부 완료');
      if(action.decision==='APPROVED'&&gaps.length)deny(`정규화 필수 항목을 확인해 주세요: ${gaps.join(', ')}`);
      const approvals={...(fast.regularizationApprovals||{}),[role]:{decision:action.decision,reason:String(action.reason||''),actorName:actor.display_name,actorId:String(actor.id),at:now}};
      const done=['requester','owner','team_leader'].every(key=>approvals[key]?.decision==='APPROVED');
      merged.fastTrack={...fast,regularizationApprovals:approvals,...(done?{status:FAST_TRACK_STATUSES.REGULARIZED,regularizedAt:now}:{})};
      if(done){merged.journeyStep=9;merged.status='Fast Track 정규화 완료 · 운영 이관';merged.nextAction='정규 운영 전환';merged.progress=100;}
    }else deny('유효한 Fast Track 작업이 필요합니다.');
  }
  const editedDocs=Object.keys(changes.historicalDocuments||{}).filter(k=>JSON.stringify(changes.historicalDocuments[k])!==JSON.stringify(previous.historicalDocuments?.[k]));
  if(editedDocs.length&&!author)deny('지정 개발 담당자 또는 Admin만 문서를 수정할 수 있습니다.',403);
  if(editedDocs.some(k=>Number(k)>step))deny('현재 단계 이후 문서를 먼저 저장할 수 없습니다.');
  if(changes.feaDraft&&step>2&&!previous.fastTrack?.requested&&projectTrack({...merged,workflowTrack:undefined})!==projectTrack({...previous,workflowTrack:undefined}))deny('트랙 변경은 착수 판정 재검토가 필요합니다. 기존 승인 상태에서 분류를 변경할 수 없습니다.');
  if(editedDocs.includes('3')&&step>4&&!previous.historicalImport&&previous.fastTrack?.status!==FAST_TRACK_STATUSES.TEMPORARY)deny('승인된 ARD 변경은 G2 재심사가 필요합니다.');
  if(changes.securityReviewerId!==undefined){
    if(!['admin','team_leader'].includes(actor.app_role)||step>6)deny('Admin 또는 팀장만 G3 이전 정보보호 승인자를 지정할 수 있습니다.',403);
  }
  if(changes.gateChecks && (!author||![5,6,7,8].includes(step)))deny('현재 평가·파일럿의 개발 담당자 또는 Admin만 검증 근거를 저장할 수 있습니다.',403);
  if(changes.gateChecks){
    const gate=step<=6?'G3':'G4';
    if(Object.keys(changes.gateChecks).some(k=>k!==gate))deny('현재 게이트의 근거만 수정할 수 있습니다.');
    merged.gateChecks={...previous.gateChecks,[gate]:changes.gateChecks[gate]};
  }
  if(changes.uatConfirm){
    if(![5,6].includes(step)||!eligibleRole('requester',actor,project,merged))deny('해당 과제 요구자만 UAT 완료를 확인할 수 있습니다.',403);
    const n=Number(changes.uatConfirm.cases);
    if(!Number.isInteger(n)||n<1||!String(changes.uatConfirm.evidence||'').trim())deny('실제 업무 케이스 건수와 확인 결과를 입력해 주세요.');
    merged.uatRecord={completed:true,cases:n,evidence:String(changes.uatConfirm.evidence),actorId:String(actor.id),actorName:actor.display_name,at:now};
  }
  // Changed basis invalidates the current approval round, not the audit history.
  merged.workflowApprovals=structuredClone(previous.workflowApprovals||{});
  merged.workflowApprovalHistory=[...(previous.workflowApprovalHistory||[])];
  if(step===2&&previous.g1Resolution&&!changes.g1Resolution&&gateBasis('G1',previous)!==gateBasis('G1',merged)){
    merged.workflowApprovalHistory.push({gate:'G1',approvals:previous.workflowApprovals?.G1,decision:previous.g1Resolution,reason:'착수 판정 근거 변경',at:now});
    merged.workflowApprovals.G1={};delete merged.g1Resolution;delete merged.workflowTrack;
  }
  for(const gate of ['G2','G3','G4']){
    if(step<=GATE_STEPS[gate]&&gateBasis(gate,previous)!==gateBasis(gate,merged)&&Object.keys(merged.workflowApprovals[gate]||{}).length){
      merged.workflowApprovalHistory.push({gate,approvals:merged.workflowApprovals[gate],reason:'승인 근거 변경',at:now});
      merged.workflowApprovals[gate]={};
    }
  }
  // A later edit to development/evaluation invalidates UAT too.
  if(changes.historicalDocuments&&JSON.stringify(previous.historicalDocuments?.[5])!==JSON.stringify(merged.historicalDocuments?.[5])&&step<=6)delete merged.uatRecord;
  if(changes.g1Resolution){
    const unchanged=JSON.stringify(changes.g1Resolution)===JSON.stringify(previous.g1Resolution);
    if(!unchanged){
      if(step!==2||actor.app_role!=='team_leader')deny('현재 G1에서 팀장만 판정을 확정할 수 있습니다.',403);
      if(gateGaps('G1',merged).length)deny('G1 필수 항목을 먼저 완료해 주세요.');
      if(!['GO','CONDITIONAL','DROP'].includes(changes.g1Resolution.decision))deny('유효한 G1 판정이 필요합니다.');
      if(changes.g1Resolution.decision!=='GO'&&!String(changes.g1Resolution.reason||'').trim())deny('조건 또는 Drop 사유를 입력해 주세요.');
      merged.workflowTrack=projectTrack({...merged,workflowTrack:undefined});
      merged.workflowApprovals.G1={team_leader:{decision:changes.g1Resolution.decision==='DROP'?'REJECTED':'APPROVED',actorId:String(actor.id),actorName:actor.display_name,at:now}};
    }
  }
  if(changes.g2Approval)deny('새 승인 화면에서 본인의 승인 역할을 선택해 주세요.');
  if(changes.gateVote){
    const {gate,role,decision,reason}=changes.gateVote;
    if(GATE_STEPS[gate]!==step||gate==='G1'||isLowRoute(previous))deny('현재 승인 대기 중인 게이트에서만 승인할 수 있습니다.');
    if(!requiredApprovers(gate,merged).includes(role)||!eligibleRole(role,actor,project,merged))deny('이 승인 역할의 담당자가 아닙니다.',403);
    if(!['APPROVED','REWORK'].includes(decision))deny('유효한 승인 결과가 필요합니다.');
    if(decision==='REWORK'&&!String(reason||'').trim())deny('보완 사유를 입력해 주세요.');
    const gaps=gateGaps(gate,merged);
    if(decision==='APPROVED'&&gaps.length)deny(gaps.join(' · '));
    merged.workflowApprovals[gate]||={};
    merged.workflowApprovals[gate][role]={decision,reason:String(reason||''),actorId:String(actor.id),actorName:actor.display_name,at:now};
    if(allApproved(gate,merged))merged.journeyStep=step+1;
  }
  if(changes.lowRouteAction){
    if(!isLowRoute(previous)||step!==9||!author)deny('하 트랙 운영 등록 담당자만 처리할 수 있습니다.',403);
    if(changes.lowRouteAction==='register'){
      if(!project.owner_id||!merged.developerIds?.length||!project.registrationKnowledgeOwner)deny('오너·개발 담당자·지식갱신 담당자 등록이 필요합니다.');
      merged.lowRoute={...previous.lowRoute,knowledgeOwner:project.registrationKnowledgeOwner,registeredAt:now,registeredBy:String(actor.id),phase:'ready'};
      const existing=merged.historicalDocuments?.[9]||{};
      const ops=existing.documents?.OPS||{};
      merged.historicalDocuments={...merged.historicalDocuments,9:{...existing,schemaVersion:2,status:'draft',updatedAt:now,documents:{...existing.documents,OPS:{...ops,status:'draft',completedSections:ops.completedSections||[],fields:{...ops.fields,'owners.knowledgeOwner':project.registrationKnowledgeOwner,'owners.owner':merged.projectOwner||merged.owner||'', 'owners.operator':merged.developerNames?.join(' · ')||'', 'owners.type':merged.feaDraft?.agentType||'', 'owners.track':'하','owners.autonomy':merged.feaDraft?.autonomy||''}}}}};
    }else if(changes.lowRouteAction==='deploy'){
      if(!previous.lowRoute.registeredAt||!['GO','CONDITIONAL'].includes(merged.g1Resolution?.decision))deny('G1 승인과 운영대장 등록을 먼저 완료해 주세요.');
      merged.lowRoute={...previous.lowRoute,phase:'operating',deployedAt:now,deployedBy:String(actor.id)};
    }else deny('유효한 단축 경로 동작이 필요합니다.');
  }
  // G1 approval is separate from Admin developer assignment.
  if(step===2&&['GO','CONDITIONAL'].includes(merged.g1Resolution?.decision)&&merged.developerIds?.length){
    if(!merged.workflowTrack)merged.workflowTrack=projectTrack(merged);
    if(merged.workflowTrack==='LOW'){
      merged.lowRoute={enabled:true,phase:'registration',reason:'v3.1 하 트랙 · G1 승인 후 운영대장 등록',startedAt:now};
      merged.journeyStep=9;
    }else merged.journeyStep=3;
  }
  const next=Number(merged.journeyStep);
  if(next!==step){
    const lowJump=step===2&&next===9&&merged.lowRoute?.enabled;
    const fastJump=step===0&&next===5&&merged.fastTrack?.status===FAST_TRACK_STATUSES.GF_APPROVED;
    const regularizedJump=step===7&&next===9&&merged.fastTrack?.status===FAST_TRACK_STATUSES.REGULARIZED;
    if(!lowJump&&!fastJump&&!regularizedJump&&next!==step+1)deny('현재 단계를 완료한 뒤 다음 단계로 진행해 주세요.');
    if([4,6,8].includes(step)&&!allApproved(Object.keys(GATE_STEPS).find(k=>GATE_STEPS[k]===step),merged))deny('필수 승인자 전원의 승인이 필요합니다.');
    if(step===2&&(!['GO','CONDITIONAL'].includes(merged.g1Resolution?.decision)||!merged.developerIds?.length))deny('팀장 G1 승인과 Admin 개발 담당자 배정이 필요합니다.');
    if(step===3&&!documentComplete(merged,3,'ARD'))deny('ARD 필수 항목을 완료해 주세요.');
    if(step===5&&(!developmentEvdComplete(merged)||merged.deliveryPhase!=='development'))deny('개발·평가 문서[EVD] .md 파일을 첨부해 주세요.');
    if(step===7&&!regularizedJump&&(!releaseEvdComplete(merged)||!String(merged.gateChecks?.G4?.evidence||'').trim()))deny('배포·확산 EVD 후속 버전과 파일럿 결과 근거를 기록해 주세요.');
  }
  for(const key of ['gateVote','g2Approval','uatConfirm','lowRouteAction','lowKnowledgeOwnerId','fastTrackAction','markdownCompleteAction'])delete merged[key];
  if(next!==step||markdownPhaseChanged){
    merged.stage=displayStage(merged);
    merged.status=['요구 접수 작성 중','타당성 평가 진행 중','G1 착수 승인 대기','요구 정의 진행 중','G2 개발 착수 승인 대기',merged.deliveryPhase==='development'?'개발·평가 진행 중':'설계 진행 중','G3 배포 승인 대기','배포·확산 진행 중','G4 확산 승인 대기','운영 이관 완료'][next];
    merged.nextAction=merged.status;merged.progress=Math.round(next/9*100);
  }
  if(isLowRoute(merged)){merged.status=merged.lowRoute.phase==='operating'?'운영 중':merged.lowRoute.registeredAt?'하 트랙 · 배포 대기':'하 트랙 · 운영대장 등록';merged.progress=merged.lowRoute.phase==='operating'?100:90;}
  if(merged.fastTrack?.status===FAST_TRACK_STATUSES.REQUESTED){merged.status='Fast Track 자격 판정 대기';merged.nextAction='AI 활성화팀장 Fast Track 자격 판정';}
  if(merged.fastTrack?.status===FAST_TRACK_STATUSES.QUALIFIED){merged.status='ARD-Lite 작성 및 GF 승인 대기';merged.nextAction=ardLiteGaps(merged.ardLite).length?'ARD-Lite 필수 항목 작성':'AI 활성화팀장 GF 긴급 착수 승인';}
  return merged;
}

export async function persistWorkflowApprovals(client,project,state,previous,actor){
  for(const gate of ['G1','G2','G3','G4']){
    if(JSON.stringify(state.workflowApprovals?.[gate])===JSON.stringify(previous.workflowApprovals?.[gate]))continue;
    if(state.workflowApprovals?.[gate]===undefined)continue;
    const id=(await client.query("insert into agent_portal.gates(project_id,gate_code,gate_status,opened_at) values($1,$2,'pending',now()) on conflict(project_id,gate_code) do update set updated_at=now() returning id",[project.id,gate])).rows[0].id;
    await client.query("update agent_portal.gate_approvals set decision='pending',updated_at=now() where gate_id=$1",[id]);
    for(const [role,vote] of Object.entries(state.workflowApprovals[gate])){
      await client.query("insert into agent_portal.gate_approvals(gate_id,approver_id,approver_role,decision,decision_comment,decided_at) values($1,$2,$3,$4,$5,$6) on conflict(gate_id,approver_role) do update set approver_id=excluded.approver_id,decision=excluded.decision,decision_comment=excluded.decision_comment,decided_at=excluded.decided_at,updated_at=now()",[id,vote.actorId,role,vote.decision==='APPROVED'?'approved':vote.decision==='REJECTED'?'rejected':'rework',vote.reason||null,vote.at]);
    }
    if(gate!=='G1'||Object.keys(state.workflowApprovals[gate]).length===0){
      const done=allApproved(gate,state),rework=Object.values(state.workflowApprovals[gate]).some(v=>v.decision==='REWORK');
      await client.query("update agent_portal.gates set gate_status=$2,final_decision=$3,decided_at=$4,decided_by=$5,updated_at=now() where id=$1",[id,done?'approved':rework?'rework':'pending',done?'approved':null,done?new Date():null,done?actor.id:null]);
    }
  }
}
