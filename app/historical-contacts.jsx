'use client';
import {useState} from 'react';
import {isContactEmail,normalizeContactEmail,emailFromPartyLabel} from '../shared/project-contacts.mjs';
import {isProjectDeveloper} from '../shared/project-actors.mjs';
export default function HistoricalContacts({project,identity,onSave}){
 const roles=[['requesterEmail','요구자',project.requester],['projectOwnerEmail','Project Owner',project.projectOwner||project.owner]];
 const existing=Object.fromEntries(roles.map(([key,,name])=>[key,normalizeContactEmail(project[key])||emailFromPartyLabel(name)]));
 const [draft,setDraft]=useState(existing),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const canEdit=identity?.appRole==='admin'||(identity?.appRole!=='general_user'&&isProjectDeveloper(project,identity));
 if(!project.historicalImport||roles.every(([key])=>existing[key]))return null;
 const additions=Object.fromEntries(roles.filter(([key])=>!existing[key]&&draft[key]?.trim()).map(([key])=>[key,normalizeContactEmail(draft[key])]));
 return <section className="workflow-v31-panel historical-contact-section"><h3>이관 과제 · 누락된 담당자 이메일 추가</h3><p>등록자와 별개로 실제 요구자·Project Owner의 회사 로그인 이메일을 입력해 주세요. 저장하면 해당 계정에 과제와 승인·알림이 연결됩니다. 이관 완료 후에도 추가할 수 있습니다.</p>{!canEdit&&<p>Admin 또는 지정 개발 담당자가 추가할 수 있습니다.</p>}<form onSubmit={async e=>{e.preventDefault();if(busy||!canEdit||!Object.keys(additions).length)return;if(Object.values(additions).some(v=>!isContactEmail(v))){setMessage('올바른 이메일 주소를 입력해 주세요.');return;}setBusy(true);setMessage('');try{const saved=await onSave({historicalContactUpdate:additions});setMessage(saved===false?'저장하지 못했습니다. 오류 안내를 확인해 주세요.':'담당자 이메일과 계정 연결을 저장했습니다.');}catch(error){setMessage(error.message);}finally{setBusy(false);}}}><div className="historical-contact-grid">{roles.map(([key,label,name])=><label key={key} className="historical-contact-card"><strong>{label} · {name||'이름 미등록'}</strong><small>{existing[key]?'이메일 등록됨':'이메일 미등록 · 계정 연결 필요'}</small><input type="email" aria-label={`${label} 누락 이메일 추가`} value={draft[key]||''} readOnly={!!existing[key]} disabled={busy||!canEdit} placeholder="name@company.com" onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}</div><p role="status">{message}</p>{canEdit&&<button type="submit" disabled={busy||!Object.keys(additions).length}>{busy?'저장 중…':'누락 이메일 저장'}</button>}</form></section>;
}
