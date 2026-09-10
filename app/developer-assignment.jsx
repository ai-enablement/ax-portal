'use client';
import {useState} from 'react';
import {UsersThree,PencilSimple,CaretDown,ClockCounterClockwise,ArrowRight} from '@phosphor-icons/react';
import './developer-assignment.css';
export default function DeveloperAssignment({project,people,admin,onSave}){
 const [selected,setSelected]=useState((project.developerIds||[]).map(String));
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [editing,setEditing]=useState(false);
 const candidates=people.filter(p=>(p.appRole||p.app_role)!=='general_user'&&p.isActive!==false);
 const history=project.developerAssignmentHistory||[];
 async function save(){setBusy(true);setMessage('');try{const ok=await onSave({developerChange:{developerIds:selected,expectedIds:project.developerIds||[],reason}});if(ok!==false){setReason('');setMessage('개발 담당자와 변경 이력을 저장했습니다.');}else setMessage('저장하지 못했습니다. 오류 안내를 확인해 주세요.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 const names=items=>items?.map(item=>item.name||item.id).join(' · ')||'미배정';
 return <section className="developer-card">
  <header className="developer-card-header"><span className="developer-card-icon"><UsersThree size={22}/></span><div className="developer-card-heading"><h3>개발 담당자</h3><p>{project.developerNames?.join(' · ')||'아직 배정된 담당자가 없습니다.'}</p></div>{admin&&<button type="button" className="developer-edit-button" aria-expanded={editing} onClick={()=>setEditing(!editing)} disabled={busy}><PencilSimple size={16}/>{editing?'접기':'담당자 변경'}</button>}</header>
  {admin&&editing&&<div className="developer-editor">
   <div className="developer-editor-intro"><b>개발 담당자 변경</b><p>담당자를 선택하고 변경 사유를 남겨주세요. 진행 단계와 승인 이력은 유지됩니다.</p></div>
   <div className="developer-editor-columns"><fieldset disabled={busy}><legend>변경 후 담당자 <span>{selected.length}명 선택</span></legend><p className="developer-field-hint">여러 명을 함께 선택할 수 있습니다.</p><div className="developer-options">{candidates.map(p=><label key={p.id} className={selected.includes(String(p.id))?'selected':''}><input type="checkbox" checked={selected.includes(String(p.id))} onChange={e=>setSelected(ids=>e.target.checked?[...ids,String(p.id)]:ids.filter(id=>id!==String(p.id)))}/><span>{p.displayName}</span></label>)}</div></fieldset>
   <div className="developer-reason"><label htmlFor={`developer-reason-${project.no}`}>변경 사유 <span>필수</span></label><textarea id={`developer-reason-${project.no}`} aria-label="개발 담당자 변경 사유" placeholder="예: 담당 업무 조정에 따라 개발 및 후속 관리를 인수인계합니다." maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/><small>변경 전·후 담당자, 변경 시각과 함께 이력에 저장됩니다.</small></div></div>
   <footer><p role="status">{message||'변경 내용은 저장 후 적용됩니다.'}</p><div><button type="button" className="developer-cancel" disabled={busy} onClick={()=>{setSelected((project.developerIds||[]).map(String));setReason('');setEditing(false);}}>취소</button><button type="button" className="developer-save" disabled={busy||!selected.length||!reason.trim()} onClick={save}>{busy?'저장 중…':'변경 사항 저장'}<ArrowRight size={16}/></button></div></footer>
  </div>}
  <details className="developer-history"><summary><ClockCounterClockwise size={17}/><span>담당자 변경 이력</span><span className="developer-history-count">{history.length}</span><CaretDown size={14}/></summary>{history.length?<div className="developer-history-list">{history.slice().reverse().map((entry,i)=><article key={i}><header><time>{new Date(entry.at).toLocaleString('ko-KR')}</time><span>변경자 · {entry.actorName||entry.actorId}</span></header><p className="developer-history-transition">{names(entry.before)} <ArrowRight size={16}/> {names(entry.after)}</p><p>{entry.reason}</p></article>)}</div>:<p className="developer-history-empty">아직 기록된 변경 이력이 없습니다. 앞으로 저장하는 변경부터 표시됩니다.</p>}</details>
 </section>;
}
