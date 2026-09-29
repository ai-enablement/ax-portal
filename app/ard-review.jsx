"use client";
import {useState} from 'react';
import {isProjectApprover} from '../shared/project-actors.mjs';
import {documentComplete} from '../shared/workflow-v31.mjs';
export default function ArdReview({project,identity,onSave}){
 const [busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState('');
 const participant=['requester','owner'].some(role=>isProjectApprover(project,identity,role));
 const drafted=documentComplete(project,3,'ARD'),importing=project.historicalImport&&!project.historicalImportFinalizedAt;
 const rework=Object.values(project.workflowApprovals?.G2||{}).some(v=>v?.decision==='REWORK');
 const finished=['requester','owner'].every(role=>project.workflowApprovals?.G2?.[role]?.decision==='APPROVED');
 if(![3,4].includes(Number(project.journeyStep)))return null;
 async function vote(role,decision){if(busy)return;setBusy(true);setError('');try{const ok=await onSave({gateVote:{gate:'G2',role,decision,reason}});if(ok===false)throw Error('승인 결과를 저장하지 못했습니다.');window.location.href='/?workProject='+encodeURIComponent(project.no);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="workflow-v31-panel"><h3>요구 정의서 검토·승인</h3><p>① 팀장·Admin 작성 완료 → ② 요구자·Owner 검토·승인 → ③ 요구 정의 완료·G2 이동 → ④ 팀장 최종 승인</p><p role="status">{importing?'과거 이관 완료 처리 후 검토·승인할 수 있습니다.':rework?'보완 요청됨 · 팀장·Admin이 수정하여 다시 작성 완료할 때까지 승인이 중단됩니다.':finished?'요구 정의 승인 완료 · 두 역할의 승인 기록은 G2에 그대로 반영되며, 팀장 최종 승인만 남았습니다.':drafted?'문서 작성 완료 · 아직 요구 정의 단계 완료가 아닙니다. 아래에서 본인 역할로 승인하거나 사유를 작성해 보완 요청해 주세요.':'문서 작성 중 · 팀장·Admin이 작성 완료하면 최종본과 승인 버튼이 활성화됩니다.'}</p>{['requester','owner'].map(role=>{
 const approved=project.workflowApprovals?.G2?.[role]?.decision==='APPROVED',mine=isProjectApprover(project,identity,role);
 const record=project.workflowApprovals?.G2?.[role];
 return <div className="workflow-v31-vote" key={role}><div><b>{role==='owner'?'Project Owner':'요구자'} · {approved?'승인 완료':record?.decision==='REWORK'?'보완 요청':'승인 대기'}</b>{record?.actorName&&<p>{record.actorName}{record.reason?` · ${record.reason}`:''}</p>}</div>{mine&&<div><button disabled={busy||approved||!drafted||importing||rework} onClick={()=>vote(role,'APPROVED')}>{approved?'승인 완료':'요구 정의 승인'}</button><button disabled={busy||approved||!drafted||importing||rework||!reason.trim()} onClick={()=>vote(role,'REWORK')}>보완 요청</button></div>}</div>;
 })}{participant&&<label>검토 의견 · 보완 요청 시 필수<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>}<p role="status">{busy?'저장 중…':error}</p></section>;
}
