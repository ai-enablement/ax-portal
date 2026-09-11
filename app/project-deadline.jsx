"use client";
import {useState} from 'react';
import {validDeadline} from '../shared/project-deadline.mjs';
import './workflow-v31.css';
export default function ProjectDeadline({project,identity,onSave}){
 const current=validDeadline(project.committedDate)?project.committedDate:'';
 const [open,setOpen]=useState(false),[date,setDate]=useState(current),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(Number(project.journeyStep)<4||project.historicalImport&&!project.historicalImportFinalizedAt)return null;
 const canEdit=identity?.appRole==='team_leader';
 async function save(){if(busy)return;setBusy(true);setMessage('');try{
  const ok=await onSave({deadlineChange:{date,previousDate:current,reason}});
  if(ok===false)throw Error('저장하지 못했습니다. 오류 안내를 확인해 주세요.');
  setOpen(false);setReason('');setMessage('마감일이 저장되었습니다.');
 }catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section className="workflow-v31-panel"><header><div><small>프로젝트 일정</small><h3>G2 확정 프로젝트 마감일</h3></div><strong>{current||'팀장 확정 대기'}</strong></header>
 {canEdit&&<button type="button" disabled={busy} onClick={()=>{setDate(current);setOpen(!open);}}>{current?'마감일 변경':'마감일 확정'}</button>}
 {canEdit&&open&&<div className="deadline-editor"><label>프로젝트 마감일<input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label><label>확정·변경 사유<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="일정 협의 내용 또는 변경이 필요한 이유"/></label><button type="button" disabled={busy||!validDeadline(date)||date===current||!reason.trim()} onClick={save}>{busy?'저장 중…':'마감일 저장'}</button></div>}
 <p>AI 활성화팀 팀장만 확정·변경할 수 있으며 변경 이력이 남습니다.</p>
 {(project.deadlineHistory||[]).length>0&&<details><summary>마감일 변경 이력 ({project.deadlineHistory.length})</summary>{[...project.deadlineHistory].reverse().map((item,i)=><div className="workflow-v31-vote" key={i}><div><b>{item.previousDate||'미확정'} → {item.date}</b><p>{item.reason}</p><small>{item.actorName} · {new Date(item.at).toLocaleString('ko-KR')}</small></div></div>)}</details>}
 <p role="status">{message}</p></section>;
}
