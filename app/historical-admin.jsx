'use client';
import {useState} from 'react';
import {JOURNEY_V31} from '../shared/workflow-v31.mjs';
export default function HistoricalAdmin({project,admin,devRole}){
 const [document,setDocument]=useState('INT'),[file,setFile]=useState(null),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!admin||!project.historicalImport)return null;
 async function save(action){
  if(busy)return;setError('');
  if(!reason.trim()){setError('변경 사유를 입력해 주세요.');return;}
  if(action==='replace'&&(!file||!file.name.toLowerCase().endsWith('.md')||file.size>1024*1024)){setError('1MB 이하 .md 파일을 선택해 주세요.');return;}
  if(action==='move'&&!target){setError('이동할 단계를 선택해 주세요.');return;}
  if(!window.confirm('현재 승인 기록은 이력으로 보존하고 초기화합니다. '+(action==='move'?'필수 작성·승인을 건너뛰고 선택 단계로 이관할까요?':'첨부 문서를 최종본으로 대체할까요?')))return;
  setBusy(true);
  try{
   const [step,phase]=target.split(':');
   const markdown=action==='replace'?new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()):undefined;
   const result=await fetch(`/api/historical-admin/${project.no}`,{method:'POST',headers:{'Content-Type':'application/json',...(devRole?{'x-portal-dev-role':devRole}:{})},body:JSON.stringify({action,document,previousStep:Number(project.journeyStep),previousVersion:Number(project.nativeAgentArtifacts?.[document]?.version||0),reason,name:file?.name,markdown,step:Number(step),phase})});
   const body=await result.json();if(!result.ok)throw Error(body.error);
   window.location.href='/?workProject='+encodeURIComponent(project.no);
  }catch(e){setError(e.message||'UTF-8 파일인지 확인해 주세요.');}finally{setBusy(false);}
 }
 return <details className="workflow-v31-panel"><summary><b>Admin · 과거 과제 이관 관리</b></summary><p>문서 대체는 현재 단계를 바꾸지 않습니다. 강제 이관은 필수 작성·승인을 건너뛰며 실제 승인으로 기록하지 않습니다. 이관 완료 전 외부 담당자 알림 제한은 그대로 유지됩니다.</p><label>변경 사유<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="문서 대체 또는 단계 이관 근거"/></label><div className="workflow-v31-vote"><div><b>INT·FEA·ARD 최종본 대체</b><label>문서<select value={document} disabled={busy} onChange={e=>setDocument(e.target.value)}>{['INT','FEA','ARD'].map(x=><option key={x}>{x}</option>)}</select></label><input aria-label="대체 Markdown 파일" type="file" accept=".md,text/markdown" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></div><button disabled={busy||!file||!reason.trim()} onClick={()=>save('replace')}>첨부 문서로 대체·작성 완료</button></div><div className="workflow-v31-vote"><label>이동할 단계<select value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">단계 선택</option>{[...JOURNEY_V31,{step:9,title:'운영·개선'}].map(x=><option key={`${x.step}:${x.phase||''}`} value={`${x.step}:${x.phase||''}`}>{x.gate?x.gate+' ':''}{x.title}</option>)}</select></label><button disabled={busy||!target||!reason.trim()} onClick={()=>save('move')}>선택 단계로 강제 이관</button></div><p role="alert">{busy?'저장 중…':error}</p><details><summary>문서 대체·단계 이관 이력</summary>{(project.historicalAdminHistory||[]).slice().reverse().map((x,i)=><p key={i}>{x.at} · {x.actorName} · {x.action==='replace'?`${x.document} v${x.previousVersion} → v${x.version}`:`단계 ${x.previousStep} → ${x.step} ${x.phase||''}`}<br/>{x.reason}</p>)}</details></details>;
}
