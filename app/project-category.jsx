'use client';
import {useState} from 'react';
import {PROJECT_CATEGORY_OPTIONS} from '../shared/project-category.mjs';
import './developer-assignment.css';
export default function ProjectCategory({project,onSave}){
 const [value,setValue]=useState(project.category||'미정'),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function save(){setBusy(true);setMessage('');try{const ok=await onSave({categoryChange:{category:value,previousCategory:project.category||'미정'}});if(ok===false)throw Error('저장하지 못했습니다. 다시 확인해 주세요.');setOpen(false);setMessage('카테고리를 저장했습니다.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section className="developer-card"><header className="developer-card-header"><div className="developer-card-heading"><h3>과제 카테고리 · {project.category||'미정'}</h3><p>G1 착수 승인부터 팀장·Admin이 지정하고 이후에도 변경할 수 있습니다.</p></div><button type="button" className="developer-edit-button" disabled={busy} onClick={()=>{setValue(project.category||'미정');setOpen(!open);}}>{open?'접기':'카테고리 변경'}</button></header>{open&&<div className="project-category-editor"><label>과제 카테고리<select value={value} disabled={busy} onChange={e=>setValue(e.target.value)}><option value="미정" disabled>카테고리 선택</option>{PROJECT_CATEGORY_OPTIONS.map(item=><option key={item}>{item}</option>)}</select></label><button type="button" className="developer-save" disabled={busy||value==='미정'||value===project.category} onClick={save}>{busy?'저장 중…':'저장'}</button></div>}{message&&<p className="project-category-message" role="status">{message}</p>}</section>;
}
