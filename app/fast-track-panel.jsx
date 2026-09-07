"use client";

import {useEffect,useMemo,useState} from "react";
import {CheckCircle,Lightning,WarningCircle} from "@phosphor-icons/react";
import {ardLiteGaps,FAST_TRACK_EXTERNAL_FACTORS,FAST_TRACK_STATUSES} from "../shared/fast-track.mjs";
import {allApproved,designDocumentComplete,documentComplete} from "../shared/workflow-v31.mjs";
import {intakeRequired,feaRequired} from "../shared/intake-standard.mjs";

const STATUS_LABELS={
  [FAST_TRACK_STATUSES.REQUESTED]:"팀장 자격 판정 대기",
  [FAST_TRACK_STATUSES.QUALIFIED]:"ARD-Lite 작성·GF 승인 대기",
  [FAST_TRACK_STATUSES.REJECTED]:"Fast Track 자격 미충족",
  [FAST_TRACK_STATUSES.GF_APPROVED]:"GF 긴급 착수 승인",
  [FAST_TRACK_STATUSES.TEMPORARY]:"한시 배포·정규화 진행",
  [FAST_TRACK_STATUSES.REGULARIZED]:"정규화 완료",
};

function useSave(onSave){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return {busy,message,save:async change=>{setBusy(true);setMessage("");try{const ok=await onSave(change);setMessage(ok===false?"저장하지 못했습니다. 오류 안내를 확인해 주세요.":"저장되었습니다.");}catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}finally{setBusy(false);}}};
}

export default function FastTrackPanel({project,identity,people,onSave}){
  const fast=project.fastTrack;
  const {busy,message,save}=useSave(onSave);
  const [reason,setReason]=useState("");
  const [developer,setDeveloper]=useState("");
  const [draft,setDraft]=useState(project.ardLite||{});
  useEffect(()=>setDraft(project.ardLite||{}),[project.ardLite]);
  const role=identity?.appRole,email=(identity?.email||"").toLowerCase();
  const leader=role==="team_leader",admin=role==="admin";
  const related=email===(project.requesterEmail||"").toLowerCase()||email===(project.projectOwnerEmail||"").toLowerCase();
  const canEdit=admin||leader||related;
  const gaps=useMemo(()=>ardLiteGaps(draft),[draft]);
  const regularizationGaps=useMemo(()=>[
    ...intakeRequired(project).map(field=>field.label),
    ...feaRequired(project).map(field=>field.label),
    ...(!project.feaCompleted?["FEA 작성 완료"]:[]),
    ...(!documentComplete(project,3,"ARD")?["정식 ARD 작성 완료"]:[]),
    ...(!designDocumentComplete(project)?["DES .md 첨부 완료"]:[]),
  ],[project]);
  if(!fast?.requested)return null;
  const factor=FAST_TRACK_EXTERNAL_FACTORS.find(item=>item.value===fast.externalFactor)?.label||fast.externalFactor;
  const setField=(key,value)=>setDraft(current=>({...current,[key]:value}));
  return <section className={`fast-track-panel status-${String(fast.status||"").toLowerCase()}`}>
    <header>
      <span className="fast-track-icon"><Lightning size={21} weight="fill"/></span>
      <div><small>v3.1 · FAST TRACK</small><h3>긴급 트랙</h3><p>외부 기한이 있는 예외 요청입니다. G3·EVD·요구자 UAT는 생략할 수 없습니다.</p></div>
      <strong>{STATUS_LABELS[fast.status]||fast.status}</strong>
    </header>
    <dl className="fast-track-facts">
      <div><dt>외부 기한 유형</dt><dd>{factor}</dd></div>
      <div><dt>명시 기한</dt><dd>{fast.externalDeadline}</dd></div>
      <div className="wide"><dt>긴급 사유·근거</dt><dd>{fast.externalReason}</dd></div>
    </dl>
    {fast.status===FAST_TRACK_STATUSES.REQUESTED&&<div className="fast-track-decision">
      <div><WarningCircle size={18} weight="fill"/><p><b>팀장 자격 판정이 필요합니다.</b><span>내부 일정 압박이 아니라 감사·법규·계약 등 외부 요인인지 확인합니다.</span></p></div>
      {leader&&<><label>자격 판정 사유<textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder="확인한 외부 기한 근거 또는 자격 미충족 사유를 입력하세요."/></label><footer><button type="button" disabled={busy||!reason.trim()} onClick={()=>save({fastTrackAction:{type:"reject",reason}})}>자격 미충족 · 정규 절차</button><button type="button" className="primary" disabled={busy||!reason.trim()} onClick={()=>save({fastTrackAction:{type:"qualify",reason}})}>자격 인정 · ARD-Lite 작성</button></footer></>}
    </div>}
    {fast.status===FAST_TRACK_STATUSES.REJECTED&&<div className="fast-track-result rejected"><WarningCircle size={18} weight="fill"/><span><b>정규 접수 절차로 진행합니다.</b><small>{fast.eligibilityReason}</small></span></div>}
    {fast.status===FAST_TRACK_STATUSES.QUALIFIED&&<>
      <div className="fast-track-result"><CheckCircle size={18} weight="fill"/><span><b>{fast.qualifiedByName} 팀장 자격 인정</b><small>{fast.eligibilityReason}</small></span></div>
      <section className="ard-lite-form">
        <header><div><small>1 PAGE</small><h4>ARD-Lite</h4><p>합의할 최소 범위를 정합니다. 성공 기준과 금칙 목록이 없으면 GF 및 G3를 진행할 수 없습니다.</p></div><span>{6-gaps.length}/6 작성</span></header>
        <div>
          <label><span>1. 한 줄 정의 · 누가/언제/무엇을/어디까지</span><textarea disabled={!canEdit} value={draft.definition||""} onChange={event=>setField("definition",event.target.value)}/></label>
          <label><span>2. Out of Scope · 하지 않는 일</span><textarea disabled={!canEdit} value={draft.outOfScope||""} onChange={event=>setField("outOfScope",event.target.value)}/></label>
          <label><span>3. 자율성 수준</span><select disabled={!canEdit} value={draft.autonomy||""} onChange={event=>setField("autonomy",event.target.value)}><option value="">선택하세요</option>{["L0 정보 제공","L1 초안 생성","L2 승인 후 실행","L3 자동 실행·사후 검토","L4 완전 자율"].map(item=><option key={item}>{item}</option>)}</select></label>
          <label><span>4. 성공 기준 · EVD 채점 기준</span><textarea disabled={!canEdit} value={draft.successCriteria||""} onChange={event=>setField("successCriteria",event.target.value)} placeholder="예: 핵심 평가셋 정확도 90% 이상"/></label>
          <label><span>5. 금칙 목록 · EVD 채점 기준</span><textarea disabled={!canEdit} value={draft.prohibitedActions||""} onChange={event=>setField("prohibitedActions",event.target.value)} placeholder="절대 하면 안 되는 행동을 구체적으로 입력"/></label>
          <label><span>6. 긴급 사유와 기한</span><textarea disabled={!canEdit} value={draft.emergencyReasonAndDeadline||""} onChange={event=>setField("emergencyReasonAndDeadline",event.target.value)}/></label>
        </div>
        {canEdit&&<button type="button" disabled={busy} onClick={()=>save({fastTrackAction:{type:"save_ard_lite",ardLite:draft}})}>ARD-Lite 저장</button>}
      </section>
      {admin&&<div className="fast-track-assignment"><label>개발 담당자<select value={developer} onChange={event=>setDeveloper(event.target.value)}><option value="">선택하세요</option>{people.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><button type="button" disabled={busy||!developer} onClick={()=>save({developerIds:[developer]})}>개발 담당자 배정</button></div>}
      {leader&&<button type="button" className="primary fast-track-gf" disabled={busy||gaps.length>0||!project.developerIds?.length} onClick={()=>save({fastTrackAction:{type:"approve_gf"}})}>GF 긴급 착수 승인 → 개발·평가</button>}
      {gaps.length>0&&<p className="fast-track-missing">미완료: {gaps.join(" · ")}</p>}
    </>}
    {fast.status===FAST_TRACK_STATUSES.GF_APPROVED&&<><div className="fast-track-result approved"><CheckCircle size={18} weight="fill"/><span><b>{fast.gfApprovedByName} 팀장 GF 승인 · G1·G2 대체</b><small>오너 통보 기한 {fast.ownerNotificationDueAt?.slice(0,16).replace("T"," ")} · EVD 평가와 요구자 UAT 후 G3 승인이 필요합니다.</small></span>{!fast.ownerNotifiedAt&&(admin||leader)&&<button type="button" disabled={busy} onClick={()=>save({fastTrackAction:{type:"notify_owner"}})}>오너 통보 기록</button>}{fast.ownerNotifiedAt&&<em>오너 통보 완료</em>}</div>{Number(project.journeyStep)===7&&allApproved("G3",project)&&(admin||leader)&&<button type="button" className="primary fast-track-gf" disabled={busy} onClick={()=>save({fastTrackAction:{type:"start_temporary"}})}>30일 한시 배포 시작</button>}</>}
    {fast.status===FAST_TRACK_STATUSES.TEMPORARY&&<section className="fast-track-regularization">
      <header><div><small>30 DAY REGULARIZATION</small><h4>정규화</h4><p>한시 배포를 중단하지는 않지만 기한을 넘기면 ‘정규화 미이행’으로 관리됩니다.</p></div><strong>{new Date(fast.regularizationDueAt)<new Date()?"정규화 미이행":`기한 ${String(fast.regularizationDueAt||"").slice(0,10)}`}</strong></header>
      <div className="fast-track-checks">{["INT 필수 항목","FEA 및 Go 근거","정식 ARD와 3자 확인","DES .md"].map((item,index)=><span key={item} className={index===0?!intakeRequired(project).length:index===1?project.feaCompleted&&!feaRequired(project).length:index===2?documentComplete(project,3,"ARD"):designDocumentComplete(project)?"done":""}>{item}</span>)}</div>
      {regularizationGaps.length>0?<p className="fast-track-missing">미완료: {regularizationGaps.join(" · ")}</p>:<p>필수 문서가 준비됐습니다. 요구자·오너·팀장이 각각 정규화를 확인합니다.</p>}
      {['requester','owner','team_leader'].map(roleKey=>{const mine=roleKey==='team_leader'?leader:roleKey==='requester'?email===(project.requesterEmail||"").toLowerCase():email===(project.projectOwnerEmail||"").toLowerCase();const vote=fast.regularizationApprovals?.[roleKey];return <div className="fast-track-regularization-vote" key={roleKey}><span><b>{roleKey==='requester'?'요구자':roleKey==='owner'?'Project Owner':'AI 활성화팀장'}</b><small>{vote?.actorName||'확인 대기'} · {vote?.decision||'PENDING'}</small></span>{mine&&<button type="button" disabled={busy||regularizationGaps.length>0} onClick={()=>save({fastTrackAction:{type:"regularization_vote",role:roleKey,decision:"APPROVED"}})}>정규화 확인</button>}</div>})}
    </section>}
    {fast.status===FAST_TRACK_STATUSES.REGULARIZED&&<div className="fast-track-result approved"><CheckCircle size={18} weight="fill"/><span><b>Fast Track 정규화 완료</b><small>INT·FEA·정식 ARD·DES와 3자 확인을 완료해 정규 운영으로 전환했습니다.</small></span></div>}
    <p role="status">{busy?"저장 중…":message}</p>
  </section>;
}
