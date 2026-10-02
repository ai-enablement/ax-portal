'use client';
import {Fragment,useEffect,useState} from 'react';
import './governance-project-people.css';
export default function GovernanceProjectPeople({admin=false,onEdit,onDelete,children}){
 const [data,setData]=useState({projects:[],people:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(''),[draft,setDraft]=useState(null),[message,setMessage]=useState('');
 async function load(){setLoading(true);try{const r=await fetch('/api/database/governance/project-people',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'담당 계정을 불러오지 못했습니다.');setData(d);}catch(e){setError(e.message);}finally{setLoading(false);}}
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();},[]);
 useEffect(()=>{const refresh=()=>{setDraft(null);void load();};window.addEventListener('portal-project-people-saved',refresh);return()=>window.removeEventListener('portal-project-people-saved',refresh);},[]);
 const people=new Map(data.people.map(p=>[p.id,p]));
 const person=id=>people.get(id)||{name:'미등록 계정',email:'',department:''};
 const showPerson=(id,department=false)=>{const p=person(id);return <div key={id} className="project-person"><strong>{p.name}</strong>{department&&<span>{p.department||'부서 미등록'}</span>}<small>{p.email||'이메일 미등록'}{p.active===false?' · 비활성 계정':''}</small></div>;};
 const visibleProjects=data.projects.filter(p=>[p.no,p.name,...[...p.ownerIds,...p.developerIds].map(id=>Object.values(person(id)).join(' '))].join(' ').toLowerCase().includes(search.toLowerCase()));
 function edit(p){setError('');setMessage('');setDraft({...p,owners:p.ownerIds.map(id=>({...person(id),id})),reason:''});onEdit?.(p.no);}
 function updateOwner(index,key,value){setDraft(d=>({...d,owners:d.owners.map((o,i)=>i===index?{...o,[key]:value}:o)}));}
 async function save(){setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/database/governance/project-people/'+encodeURIComponent(draft.no),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({owners:draft.owners,developerIds:draft.developerIds,version:draft.version,reason:draft.reason})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'저장하지 못했습니다.');setDraft(null);window.dispatchEvent(new Event('portal-project-people-saved'));setMessage('Owner 정보와 개발 담당자를 저장했습니다.');
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const editor=draft&&<section className="people-editor" aria-label={draft.no+' Agent 과제 수정'}>
  <h3>{draft.no} · Agent 과제 수정</h3>{children}
  <h4>Project Owner · 이름 / 부서 / 이메일 직접 입력</h4>
  <p>신규 Owner도 입력할 수 있습니다. 기존 계정의 정보를 수정하면 다른 연결 과제에도 반영됩니다. Owner 삭제는 이 과제 연결만 해제하며 계정과 과거 이력은 보존합니다.</p>
  <fieldset className="owner-inputs" disabled={busy}>
   {draft.owners.map((owner,index)=><div className="owner-input-card" key={owner.id||'new-'+index}>
    <div className="owner-profile-fields">{[['name','Owner 이름'],['department','Owner 부서'],['email','Owner 이메일']].map(([key,label])=><label key={key}>{label}<input type={key==='email'?'email':'text'} value={owner[key]||''} maxLength={key==='email'?254:200} placeholder={key==='email'?'회사 로그인 이메일':''} onChange={e=>updateOwner(index,key,e.target.value)}/></label>)}</div>
    <button disabled={draft.owners.length<=1} onClick={()=>setDraft(d=>({...d,owners:d.owners.filter((_,i)=>i!==index)}))}>Owner 삭제</button>
   </div>)}
   <button onClick={()=>setDraft(d=>({...d,owners:[...d.owners,{name:'',department:'',email:''}]}))} disabled={draft.owners.length>=30}>+ Owner 추가</button>
  </fieldset>
  <div className="people-choices developer-choices"><fieldset disabled={busy}><legend>개발 담당자 · {draft.developerIds.length}명 선택</legend>
   {data.people.filter(p=>(p.active&&['admin','team_leader','team_member','bts','bp_solution'].includes(p.role))||draft.developerIds.includes(p.id)).map(p=><label key={p.id}><input type="checkbox" checked={draft.developerIds.includes(p.id)} disabled={!p.active&&!draft.developerIds.includes(p.id)} onChange={()=>setDraft(d=>({...d,developerIds:d.developerIds.includes(p.id)?d.developerIds.filter(id=>id!==p.id):[...d.developerIds,p.id]}))}/><span><strong>{p.name}</strong><small>{p.email||'이메일 미등록'}</small></span></label>)}
  </fieldset></div>
  <label>변경 사유 (필수)<textarea value={draft.reason} maxLength={2000} disabled={busy} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
  {error&&<p role="alert" className="people-error">{error}</p>}
  <footer><button disabled={busy} onClick={()=>setDraft(null)}>취소</button><button className="primary" disabled={busy||!draft.owners.length||draft.owners.some(o=>!o.name.trim()||!o.email.trim())||!draft.reason.trim()} onClick={save}>{busy?'저장 중…':'Owner·개발 담당자 저장'}</button></footer>
 </section>;
 return <section className="governance-people" aria-label="DB 담당 계정 관리">
  <header><div><h3>Agent 과제 관리</h3><p>과제별 Owner 이름·부서·이메일과 개발 담당자의 실제 DB 계정 정보를 확인하고 수정합니다. 팀장·Admin만 담당 계정을 변경할 수 있습니다.</p></div><button disabled={loading||busy} onClick={()=>{setError('');setDraft(null);void load();}}>새로고침</button></header>
  <label>과제·담당자 검색<input type="search" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setDraft(null);}} placeholder="과제번호, 이름, 부서, 이메일"/></label>
  {loading&&<p role="status">DB 담당 계정 불러오는 중…</p>}{error&&!draft&&<p role="alert" className="people-error">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="people-table"><div className="people-row people-head"><span>Agent 과제</span><span>Project Owner · 이름 / 부서 / 이메일</span><span>개발 담당자 · 이름 / 이메일</span><span>관리</span></div>
   {visibleProjects.map(p=><Fragment key={p.no}><div className="people-row"><div><strong>{p.name}</strong><small>{p.no} · {p.stage}</small></div><div>{p.ownerIds.length?p.ownerIds.map(id=>showPerson(id,true)):'Owner 미등록'}</div><div>{p.developerIds.length?p.developerIds.map(id=>showPerson(id)):'개발 담당자 미배정'}</div><div className="people-row-actions"><button disabled={busy||loading} aria-expanded={draft?.no===p.no} onClick={()=>draft?.no===p.no?setDraft(null):edit(p)}>{draft?.no===p.no?'접기':'수정'}</button>{admin&&<button disabled={busy||loading} onClick={()=>onDelete?.(p.no)}>삭제</button>}</div></div>{draft?.no===p.no&&editor}</Fragment>)}
  </div>
  {!loading&&!error&&!visibleProjects.length&&<p role="status">{search?'검색 결과가 없습니다.':'등록된 Agent 과제가 없습니다.'}</p>}
 </section>;
}
