'use client';
import {useState} from 'react';
import {exclusionStatus} from '../shared/rpa-visibility.mjs';
export default function RpaVisibility({projects,hiddenProjects,busy,onSave,onDetail,canManage=false}){
 const [hidden,setHidden]=useState(true),[query,setQuery]=useState(''),[selected,setSelected]=useState([]),[page,setPage]=useState(1);
 const rows=(hidden?hiddenProjects:projects).filter(p=>[p.code,p.name,p.department,...(p.pics||[])].join(' ').toLowerCase().includes(query.toLowerCase()));
 const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/10))),shown=rows.slice((currentPage-1)*10,currentPage*10);
 const chosen=rows.filter(p=>selected.includes(p.id));
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 async function save(){
  if(!canManage)return;
  if(chosen.length>100){window.alert('한 번에 최대 100개까지 변경할 수 있습니다.');return;}
  if(!window.confirm(`선택한 ${chosen.length}개 과제를 ${hidden?'숨김 해제':'숨김 처리'}할까요? 데이터와 기존 유지보수 요청은 보존됩니다.`))return;
  if(await onSave({action:'master-visibility',hidden:!hidden,items:chosen.map(p=>({id:p.id,revision:p.revision??0}))}))setSelected([]);
 }
 return <section className="rpa-visibility" aria-label="과제 숨김 관리">
  <p className="rpa-muted">원본의 제외(미개발)·제외(개발완료) 과제는 기본 숨김 처리됩니다. 숨김 해제하면 연결된 PIC의 목록에도 다시 표시됩니다. 기존 유지보수 요청과 이력은 계속 확인할 수 있습니다.</p>
  {!canManage&&<p className="rpa-muted">조회 권한이 있는 과제만 표시됩니다. 숨김 변경은 AI 활성화팀 또는 Admin에게 요청해 주세요.</p>}
  <div className="rpa-toolbar"><button aria-pressed={hidden} onClick={()=>{setHidden(true);setSelected([]);setPage(1);}}>숨김 과제 ({hiddenProjects.length})</button><button aria-pressed={!hidden} onClick={()=>{setHidden(false);setSelected([]);setPage(1);}}>표시 중 과제 ({projects.length})</button><label className="rpa-search"><input aria-label="숨김 관리 과제 검색" placeholder="과제 번호, 제목, PIC, 부서 검색" value={query} onChange={e=>{setQuery(e.target.value);setSelected([]);setPage(1);}}/></label><button className="rpa-primary" hidden={!canManage} disabled={!canManage||busy||!chosen.length} onClick={save}>선택 {chosen.length}개 {hidden?'숨김 해제':'숨기기'}</button></div>
  <div className="rpa-visibility-table"><table><thead><tr><th hidden={!canManage}><input type="checkbox" aria-label="현재 페이지 모두 선택" disabled={busy||!shown.length} checked={!!shown.length&&shown.every(p=>selected.includes(p.id))} onChange={e=>setSelected(s=>e.target.checked?[...new Set([...s,...shown.map(p=>p.id)])]:s.filter(id=>!shown.some(p=>p.id===id)))}/></th><th>과제 번호 / 과제명</th><th>부서 / PIC</th><th>숨김 사유</th><th>상세</th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td hidden={!canManage}><input type="checkbox" aria-label={`${p.code} 선택`} checked={selected.includes(p.id)} disabled={busy} onChange={()=>toggle(p.id)}/></td><td><small>{p.code}</small><strong>{p.name}</strong></td><td>{p.department}<small>{(p.pics||[]).join(' / ')||'PIC 미지정'}</small></td><td>{hidden?(p.visibility?.hidden?'관리자 지정':exclusionStatus(p)):'표시 중'}</td><td><button onClick={()=>onDetail(p)}>상세 보기</button></td></tr>)}</tbody></table>{!shown.length&&<p className="rpa-empty">해당 과제가 없습니다.</p>}</div>
  <div className="rpa-pagination"><span>총 {rows.length}개 · {currentPage} / {Math.max(1,Math.ceil(rows.length/10))}</span><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>이전</button><button disabled={currentPage*10>=rows.length} onClick={()=>setPage(currentPage+1)}>다음</button></div>
 </section>;
}
