"use client";

import {useEffect,useMemo,useState} from "react";
import {CheckCircle,Lightning,WarningCircle} from "@phosphor-icons/react";
import {ardLiteGaps,ardLiteDocumentComplete,FAST_TRACK_EXTERNAL_FACTORS,FAST_TRACK_STATUSES} from "../shared/fast-track.mjs";
import {allApproved,designDocumentComplete,documentComplete} from "../shared/workflow-v31.mjs";
import {intakeRequired,feaRequired} from "../shared/intake-standard.mjs";

import MarkdownDocumentWorkspace from "./markdown-document-workspace";

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
  return {busy,message,save:async change=>{setBusy(true);setMessage("");try{const ok=await onSave(change);setMessage(ok===false?"저장하지 못했습니다. 오류 안내를 확인해 주세요.":"저장되었습니다.");return ok!==false;}catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");return false;}finally{setBusy(false);}}};
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
  const assigned=people.some(p=>(project.developerIds||[]).map(String).includes(String(p.id))&&(p.email||"").toLowerCase()===email);
  const canEdit=admin||leader;
  const gaps=useMemo(()=>ardLiteGaps(draft),[draft]);
  const intakeReady=Boolean(project.intakeReview?.at&&project.intakeDraftCompleted&&!intakeRequired(project).length);
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
      {canEdit?<MarkdownDocumentWorkspace key={project.no+":ard-lite"} project={project} phase="fast_track_requirements" canEdit={intakeReady} onComplete={(_phase,version)=>save({fastTrackAction:{type:"complete_ard_lite",version}})}/>:<p>ARD-Lite · 팀장·Admin 작성 진행 중</p>}
      {admin&&<div className="fast-track-assignment"><label>개발 담당자<select value={developer} onChange={event=>setDeveloper(event.target.value)}><option value="">선택하세요</option>{people.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><button type="button" disabled={busy||!developer} onClick={()=>save({developerIds:[developer]})}>개발 담당자 배정</button></div>}
      {!intakeReady&&<p className="fast-track-missing">INT AI 인터뷰·검토를 먼저 완료해 주세요. 요구정의를 작성해도 INT 검토 전에는 착수 승인할 수 없습니다.</p>}
      {leader&&<button type="button" className="primary fast-track-gf" disabled={busy||!intakeReady||!ardLiteDocumentComplete(project)||!project.developerIds?.length} onClick={()=>save({fastTrackAction:{type:"approve_gf"}})}>GF 긴급 착수 승인 → 개발·평가</button>}
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
