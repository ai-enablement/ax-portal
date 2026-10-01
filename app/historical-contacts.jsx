'use client';
import {useState} from 'react';
import {historicalParties} from '../shared/project-contacts.mjs';
import {isProjectDeveloper} from '../shared/project-actors.mjs';

export default function HistoricalContacts({project,identity,onSave}){
 const original=historicalParties(project);
 const [requester,setRequester]=useState(original.requester);
 const [owners,setOwners]=useState(original.owners.length?original.owners:[{name:'',email:''}]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 const [editing,setEditing]=useState(false);
 const canEdit=identity?.appRole==='admin'||(identity?.appRole!=='general_user'&&isProjectDeveloper(project,identity));
 if(!project.historicalImport)return null;
 if((project.historicalContactsCompleted||done)&&!editing)return canEdit?<button type="button" onClick={()=>{setEditing(true);setDone(false);}}>요구자 · Owner 정보 관리</button>:null;
 const field=(label,person,old,onChange)=><div className="historical-contact-card"><strong>{label}</strong><label>이름<input aria-label={`${label} 이름`} required value={person.name} readOnly={!!old?.name} disabled={busy||!canEdit} placeholder="담당자 이름" onChange={e=>onChange({...person,name:e.target.value})}/></label><label>회사 로그인 이메일<input type="email" aria-label={`${label} 이메일`} required value={person.email} readOnly={!!old?.email} disabled={busy||!canEdit} placeholder="name@company.com" onChange={e=>onChange({...person,email:e.target.value})}/></label></div>;
 return <section className="workflow-v31-panel historical-contact-section"><h3>이관 과제 · 담당자 정보 보완</h3><p>실제 요구자와 각 Project Owner의 이름·회사 로그인 이메일을 확인해 주세요. 모두 저장한 뒤 완료하면 이 안내는 해당 과제에서 사라집니다.</p>{!canEdit&&<p>Admin 또는 지정 개발 담당자가 보완할 수 있습니다.</p>}
 <form onSubmit={async e=>{e.preventDefault();if(busy||!canEdit)return;const complete=e.nativeEvent.submitter?.value==='complete';setBusy(true);setMessage('');try{const saved=await onSave({historicalContactUpdate:{parties:{requester,owners},removedOwnerNames:original.owners.filter(p=>!p.email&&!owners.some(v=>v.name===p.name)).map(p=>p.name),removedOwnerEmails:original.owners.filter(p=>p.email&&!owners.some(v=>v.email===p.email)).map(p=>p.email),complete}});if(saved===false){setMessage('저장하지 못했습니다. 오류 안내를 확인해 주세요.');}else if(complete){setDone(true);setEditing(false);}else{setMessage('저장했습니다. 담당자 정보를 확인하고 완료를 눌러 주세요.');}}catch(error){setMessage(error.message);}finally{setBusy(false);}}}>
 <div className="historical-contact-grid">{field('요구자',requester,original.requester,setRequester)}<div>{owners.map((p,i)=><div key={i}>{field(`Project Owner ${i+1}`,p,original.owners.find(v=>p.id?v.id===p.id:v.name===p.name&&v.email===p.email),next=>setOwners(owners.map((v,j)=>j===i?next:v)))}{canEdit&&owners.length>1&&<button type="button" disabled={busy} onClick={()=>setOwners(owners.filter((_,j)=>j!==i))}>Owner 삭제</button>}</div>)}{canEdit&&<button type="button" disabled={busy} onClick={()=>setOwners([...owners,{name:'',email:''}])}>+ Owner 추가</button>}</div></div>
 <p role="status">{message}</p>{canEdit&&<div className="historical-contact-actions"><button type="submit" value="save" disabled={busy}>담당자 정보 저장</button><button type="submit" value="complete" disabled={busy}>{busy?'저장 중…':'저장 및 완료'}</button></div>}
 </form></section>;
}
