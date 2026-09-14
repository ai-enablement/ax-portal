"use client";
import {useState} from 'react';
import {isProjectApprover} from '../shared/project-actors.mjs';
import {documentComplete} from '../shared/workflow-v31.mjs';
export default function ArdReview({project,identity,onSave}){
 const [busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState('');
 const participant=['requester','owner'].some(role=>isProjectApprover(project,identity,role));
 if(!documentComplete(project,3,'ARD')||![3,4].includes(Number(project.journeyStep)))return null;
 async function vote(role,decision){if(busy)return;setBusy(true);setError('');try{const ok=await onSave({gateVote:{gate:'G2',role,decision,reason}});if(ok===false)throw Error('승인 결과를 저장하지 못했습니다.');window.location.href='/?workProject='+encodeURIComponent(project.no);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="workflow-v31-panel"><h3>요구 정의서 검토·승인</h3><p>위 최종본을 읽고 본인의 역할로 승인해 주세요. 요구자·Owner 승인 후 팀장이 G2에서 개발 착수를 승인합니다.</p>{['requester','owner'].map(role=>{
 const approved=project.workflowApprovals?.G2?.[role]?.decision==='APPROVED',mine=isProjectApprover(project,identity,role);
 return <div className="workflow-v31-vote" key={role}><b>{role==='owner'?'Project Owner':'요구자'} · {approved?'승인 완료':'승인 대기'}</b>{mine&&<div><button disabled={busy||approved} onClick={()=>vote(role,'APPROVED')}>{approved?'승인 완료':'요구 정의 승인'}</button><button disabled={busy||approved||!reason.trim()} onClick={()=>vote(role,'REWORK')}>보완 요청</button></div>}</div>;
 })}{participant&&<label>검토 의견 · 보완 요청 시 필수<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>}<p role="status">{busy?'저장 중…':error}</p></section>;
}
