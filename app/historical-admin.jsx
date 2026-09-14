'use client';
import {useState} from 'react';
import {Archive,CaretDown,UploadSimple} from '@phosphor-icons/react';
import './developer-assignment.css';
import './historical-admin.css';
import {JOURNEY_V31} from '../shared/workflow-v31.mjs';
export default function HistoricalAdmin({project,admin,devRole}){
 const [document,setDocument]=useState('INT'),[file,setFile]=useState(null),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState(false),[tab,setTab]=useState('replace'),[historyOpen,setHistoryOpen]=useState(false);
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
 const history=project.historicalAdminHistory||[],id='historical-editor-'+project.no;
 return <section className="developer-card historical-admin-card" aria-label="Admin 과거 과제 이관 관리">
 <header className="developer-card-header"><span className="developer-card-icon"><Archive size={22}/></span><div className="developer-card-heading"><h3>과거 과제 이관 관리 <small className="historical-admin-badge">Admin</small></h3><p>기존 문서를 반영하거나 진행 단계를 조정합니다.</p></div><button type="button" className="developer-edit-button" aria-expanded={editing} aria-controls={id} disabled={busy} onClick={()=>setEditing(x=>!x)}>{editing?'닫기':'이관 관리'}<CaretDown size={16}/></button></header>
 {editing&&<div className="developer-editor" id={id}>
 <div className="historical-admin-tabs" role="tablist" aria-label="이관 관리 작업">{[['replace','문서 대체'],['move','단계 이관']].map(([value,label])=><button type="button" role="tab" aria-selected={tab===value} key={value} disabled={busy} onClick={()=>{setTab(value);setError('');}}>{label}</button>)}</div>
 <div className="historical-admin-fields"><div className="historical-admin-task">
 {tab==='replace'?<><label htmlFor={id+'-doc'}>대체할 문서</label><select id={id+'-doc'} value={document} disabled={busy} onChange={e=>setDocument(e.target.value)}>{['INT','FEA','ARD'].map(x=><option key={x}>{x}</option>)}</select><label className="historical-admin-upload"><UploadSimple size={22}/><strong>{file?.name||'Markdown 파일 선택'}</strong><small>UTF-8 .md · 최대 1MB</small><input aria-label="대체 Markdown 파일" type="file" accept=".md,text/markdown" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><p>첨부 문서를 최종본으로 저장합니다. 현재 단계는 유지됩니다.</p></>:<><label htmlFor={id+'-stage'}>이동할 단계</label><select id={id+'-stage'} value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">단계 선택</option>{[...JOURNEY_V31,{step:9,title:'운영·개선'}].map(x=><option key={x.step+':'+(x.phase||'')} value={x.step+':'+(x.phase||'')}>{x.gate?x.gate+' ':''}{x.title}</option>)}</select><div className="historical-admin-warning">필수 작성·승인을 건너뛰는 관리 작업입니다. 실제 담당자의 승인으로 기록되지 않습니다.</div></>}
 </div><div className="developer-reason"><label htmlFor={id+'-reason'}>변경 사유 <span>필수</span></label><textarea id={id+'-reason'} value={reason} disabled={busy} maxLength={2000} onChange={e=>setReason(e.target.value)} placeholder="기존 문서 반영 또는 단계 조정 사유를 입력해 주세요."/><small>변경 전·후 상태, 처리자와 시각이 이력에 남습니다.</small></div></div>
 <footer><p role="status">{error||'기존 문서·승인은 이력에 보존되며 현재 승인은 초기화됩니다.'}</p><div><button type="button" className="developer-cancel" disabled={busy} onClick={()=>setEditing(false)}>닫기</button><button type="button" className="developer-save" disabled={busy||!reason.trim()||(tab==='replace'?!file:!target)} onClick={()=>save(tab)}>{busy?'저장 중…':tab==='replace'?'최종본으로 대체':'선택 단계로 이관'}</button></div></footer>
 </div>}
 <div className="historical-admin-history"><button type="button" aria-expanded={historyOpen} aria-controls={id+'-history'} onClick={()=>setHistoryOpen(x=>!x)}>변경 이력 <span>{history.length}</span><CaretDown size={14}/></button>{historyOpen&&<div id={id+'-history'} className="developer-history-list">{history.length?history.slice().reverse().map((x,i)=><article key={i}><header><time>{new Date(x.at).toLocaleString('ko-KR')}</time><span>{x.actorName}</span></header><p>{x.action==='replace'?x.document+' v'+x.previousVersion+' → v'+x.version:'단계 '+x.previousStep+' → '+x.step}</p><p>{x.reason}</p></article>):<p>아직 변경 이력이 없습니다.</p>}</div>}</div>
 </section>;
}
