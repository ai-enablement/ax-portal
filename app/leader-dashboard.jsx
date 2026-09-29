'use client';
import {useEffect,useState} from 'react';
import {CaretLeft,CaretRight,X,PencilSimple,ArrowSquareOut} from '@phosphor-icons/react';
import {kstDate,formatKst} from '../shared/portal-time.mjs';
import {calendarDays,dashboardSummary,fiscalRange,scheduleStatus,validDay,projectPeriod} from '../shared/leader-dashboard.mjs';
import {deploymentCompleted} from '../shared/deployment-progress.mjs';
import {dashboardScopeFor,dashboardView,dashboardProjects} from '../shared/dashboard-visibility.mjs';
import './leader-dashboard.css';

const statuses={done:'완료',prog:'진행중',plan:'예정',late:'지연',unknown:'일정 미입력'};
const colors={done:'#2f9e44',prog:'#3b5bdb',plan:'#98a2b3',late:'#e03131',unknown:'#98a2b3'};
const plusDay=(date,n)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
const percent=p=>p.manualProgress==null?'미입력':`${p.manualProgress}%`;

export default function LeaderDashboard({identity,devRole,onProject}) {
  const today=kstDate(),currentYear=Number(today.slice(0,4))+(Number(today.slice(5,7))>=11?1:0);
  const [projects,setProjects]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [dashboardScope,setDashboardScope]=useState(dashboardScopeFor(devRole||identity?.appRole,identity?.leaderDashboardScope));
  const [selectedCategory,setCategory]=useState('전체'),[developer,setDeveloper]=useState('전체');
  const options=dashboardView(dashboardScope,selectedCategory),category=options.category;
  const [mode,setMode]=useState('cycle'),[year,setYear]=useState(currentYear),[custom,setCustom]=useState(fiscalRange(currentYear));
  const [view,setView]=useState('gantt'),[group,setGroup]=useState('agent'),[selectedStatuses,setSelectedStatuses]=useState(Object.keys(statuses));
  const [editing,setEditing]=useState(null),[message,setMessage]=useState('');
  const headers=devRole?{'x-portal-dev-role':devRole}:{};
  async function refresh(signal) {
    try {
      const res=await fetch('/api/database/leader-dashboard',{cache:'no-store',headers,signal});
      const data=await res.json();if(!res.ok)throw Error(data.error||'과제를 불러오지 못했습니다.');
      setDashboardScope(data.dashboardScope||'personal');
      setProjects((data.projects||[]).map(p=>({...p,...projectPeriod(p)})));setError('');
    }catch(e){if(e.name!=='AbortError'){setProjects([]);setEditing(null);setError(e.message);}}finally{if(!signal?.aborted)setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[devRole]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- refresh updates state only after the network request resolves.
  const categoryProjects=dashboardProjects(projects,dashboardScope,category);
  const developers=[...new Map(categoryProjects.flatMap(p=>(p.developerIds||[]).map((id,i)=>[String(id),p.developerNames?.[i]||id]))).entries()];
  const filtered=categoryProjects.filter(p=>!options.developerFilter||developer==='전체'||p.developerIds?.map(String).includes(developer));
  const dated=filtered.filter(p=>validDay(p.start)&&(!validDay(p.end)||p.end>=p.start)).map(p=>({...p,end:p.end||(p.start>today?p.start:today)}));
  const range=mode==='custom'?custom:mode==='all'&&dated.length?{start:dated.reduce((a,p)=>p.start<a?p.start:a,dated[0].start),end:dated.reduce((a,p)=>p.end>a?p.end:a,dated[0].end)}:fiscalRange(year);
  const rangeValid=validDay(range.start)&&validDay(range.end)&&range.end>=range.start;
  const summary=dashboardSummary(filtered,range,today);
  const scoped=rangeValid?summary.scoped:[];
  const missing=filtered.filter(p=>!validDay(p.start)||(validDay(p.end)&&p.end<p.start));
  const ending=[...scoped].filter(p=>validDay(p.end)&&p.manualProgress!==100).sort((a,b)=>a.end.localeCompare(b.end)).slice(0,5);
  const visible=scoped.filter(p=>selectedStatuses.includes(scheduleStatus(p,today)));
  const tableProjects=[...visible,...(selectedStatuses.includes('unknown')?missing:[])];
  if(category!=='D2B'&&group==='developer')tableProjects.sort((a,b)=>(a.developerNames?.join(' · ')||'미배정').localeCompare(b.developerNames?.join(' · ')||'미배정','ko'));
  const canEdit=p=>dashboardScope==='all'&&!deploymentCompleted(p)&&(devRole||identity?.appRole)!=='general_user'&&p.developerIds?.map(String).some(id=>[String(identity?.userId),...(identity?.sharedUserIds||[])].includes(id));
  const toggleStatus=key=>setSelectedStatuses(old=>old.includes(key)?old.filter(s=>s!==key):[...old,key]);
  const metrics=[['진척률',summary.progress,'%','prog','담당자 입력 진척률 · 과제 기간 일수 가중 평균'],['일정 경과율',summary.elapsed,'%','','선택 기간 중 오늘까지 지난 비율'],['에이전트',scoped.length,'개','','선택 기간에 걸친 에이전트'],['완료',scoped.filter(p=>scheduleStatus(p,today)==='done').length,'개','done',''],['진행중',scoped.filter(p=>scheduleStatus(p,today)==='prog').length,'개','prog',''],['지연',scoped.filter(p=>scheduleStatus(p,today)==='late').length,'개','late','종료일 경과 · 미완료']];
  return <div className="page leader-dashboard">
    <header className="ld-heading"><div><h1>대시보드</h1><p>{options.personal?'내가 요구자 또는 Project Owner인 에이전트의 진척과 주요 일정을 확인합니다.':'에이전트별 개발 진척과 주요 일정을 한눈에 확인하고, 지연 과제와 종료 임박 일정을 관리합니다.'}</p></div><small>{today} 기준</small></header>
    <nav className="ld-category" aria-label="과제 카테고리">{options.tabs.map(c=><button key={c} aria-pressed={category===c} className={category===c?'active':''} onClick={()=>{setCategory(c);setDeveloper('전체');setGroup('agent');setEditing(null);}}>{c}</button>)}<span>{options.personal?'내 요구·Project Owner 과제 기준으로 지표와 일정 표시':'선택한 카테고리 기준으로 지표와 일정 표시'}</span></nav>
    {error&&<p className="ld-error" role="alert">{error} <button onClick={()=>refresh()}>다시 불러오기</button></p>}
    {message&&<p role="status">{message}</p>}
    {loading?<p role="status">등록된 과제를 불러오는 중입니다…</p>:<>
    <div className="ld-filters"><div className="ld-filter-row ld-period"><b>기간</b><div className="ld-segment">{[['cycle',`${year}년 주기 (${String(year-1).slice(-2)}.11 ~ ${String(year).slice(-2)}.10)${year===currentYear?' · 현재':''}`],['all','전체'],['custom','기간 지정']].map(([key,label])=><button key={key} aria-pressed={mode===key} className={mode===key?'on':''} onClick={()=>setMode(key)}>{label}</button>)}</div><button aria-label="이전 주기" disabled={mode!=='cycle'} onClick={()=>setYear(year-1)}><CaretLeft/></button><button aria-label="다음 주기" disabled={mode!=='cycle'} onClick={()=>setYear(year+1)}><CaretRight/></button><span className="ld-range"><strong>{range.start} – {range.end}</strong> · {rangeValid?Math.ceil(calendarDays(range.start,range.end)/7):'—'}주 · 에이전트 {scoped.length}개</span></div>
    {mode==='custom'&&<div className="ld-filter-row"><label>시작일 <input type="date" value={custom.start} onChange={e=>setCustom({...custom,start:e.target.value})}/></label><label>종료일 <input type="date" value={custom.end} onChange={e=>setCustom({...custom,end:e.target.value})}/></label>{!rangeValid&&<span role="alert">시작일 이후의 종료일을 선택해 주세요.</span>}</div>}
    {options.developerFilter&&<div className="ld-filter-row"><b>개발자</b><button className={`ld-chip ${developer==='전체'?'on':''}`} aria-pressed={developer==='전체'} onClick={()=>setDeveloper('전체')}>전체 {categoryProjects.length}</button>{developers.map(([id,name])=><button key={id} className={`ld-chip ${developer===id?'on':''}`} aria-pressed={developer===id} onClick={()=>setDeveloper(id)}>{name} <small>{categoryProjects.filter(p=>p.developerIds?.map(String).includes(id)).length}</small></button>)}</div>}</div>
    <div className="ld-kpis">{metrics.map(([label,value,unit,tone,hint],i)=><article key={label} className={`ld-kpi ${tone}`}><small>{label}</small><div className="ld-value">{rangeValid?(value??'—'):'—'}<small>{value==null?'':unit}</small></div>{i<2&&<progress value={rangeValid?(value??0):0} max="100"/>}<p>{hint}</p></article>)}</div>
    {(missing.length>0||summary.missingProgress>0||summary.unconfirmed>0)&&<div className="ld-quality">접수일 누락·일정 오류 {missing.length}개는 기간 집계에서 제외 · 마감일 미확정 {summary.unconfirmed}개와 진척률 미입력 {summary.missingProgress}개는 가중 평균에서 제외됩니다. <button onClick={()=>setView('table')}>미입력 과제 확인</button></div>}
    {options.ending&&<section className="ld-panel"><h2>종료 임박 일정 <small>종료일이 가까운 순 · 지연 건 우선</small></h2><div className="ld-ending">{ending.map(p=>{const days=calendarDays(today,p.end)-1;return <button key={p.no} className={`ld-end ${days<0?'over':days<=14?'soon':''}`} onClick={()=>setEditing(p)}><div><strong>{days<0?`${-days}일 초과`:`D-${days}`}</strong><small>{p.end}</small></div><b>{p.name}</b><small>{p.developerNames?.join(' · ')||'담당자 미배정'} · {percent(p)}</small><progress max="100" value={p.manualProgress??0}/></button>;})}{!ending.length&&<p className="ld-empty">선택 기간에 종료 예정인 과제가 없습니다.</p>}</div></section>}
    <section className="ld-panel"><div className="ld-toolbar"><h2>전체 일정</h2><div className="ld-segment"><button className={view==='gantt'?'on':''} aria-pressed={view==='gantt'} onClick={()=>setView('gantt')}>간트 차트</button><button className={view==='table'?'on':''} aria-pressed={view==='table'} onClick={()=>setView('table')}>과제 상세</button></div></div><div className="ld-toolbar"><div className="ld-status"><small>상태</small>{Object.entries(statuses).map(([key,label])=><button key={key} className={`ld-chip ${selectedStatuses.includes(key)?'on':''}`} aria-pressed={selectedStatuses.includes(key)} onClick={()=>toggleStatus(key)}><span style={{background:colors[key]}}/>{label}</button>)}</div>{options.developerFilter&&<div className="ld-segment"><button className={group==='agent'?'on':''} aria-pressed={group==='agent'} onClick={()=>setGroup('agent')}>에이전트별</button><button className={group==='developer'?'on':''} aria-pressed={group==='developer'} onClick={()=>setGroup('developer')}>개발자별</button></div>}</div>
    {view==='gantt'&&rangeValid?<Gantt projects={visible} range={range} today={today} group={options.developerFilter?group:'agent'} onSelect={setEditing}/>:<div className="ld-table-wrap"><table><thead><tr>{['과제','카테고리','담당 개발자','최초 접수일','G2 확정 마감일','진척률','상태','작업'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{tableProjects.map(p=><tr key={p.no}><td><small>{p.no}</small><b>{p.name}</b></td><td>{p.category}</td><td>{p.developerNames?.join(' · ')||'미배정'}</td><td>{p.start||'미입력'}</td><td>{p.end||'미확정'}</td><td>{percent(p)}</td><td>{statuses[scheduleStatus(p,today)]}</td><td><button onClick={()=>setEditing(p)}>{canEdit(p)?'진척률 입력':'상세 보기'}</button></td></tr>)}</tbody></table>{!tableProjects.length&&<p className="ld-empty">표시할 과제가 없습니다.</p>}</div>}
    {view==='gantt'&&missing.length>0&&<details className="ld-missing"><summary>일정 미입력 과제 {missing.length}개 · 최초 접수일 누락 또는 날짜 순서 확인 필요</summary>{missing.map(p=><div key={p.no}><span>{p.no} · {p.name}</span><small>{percent(p)}</small><button onClick={()=>setEditing(p)}>{canEdit(p)?'진척률 입력':'상세 보기'}</button></div>)}</details>}
    <div className="ld-legend">{Object.entries(statuses).filter(([key])=>key!=='unknown').map(([key,label])=><span key={key}><i style={{background:colors[key]}}/>{label}</span>)}<span><i className="ld-today-key" aria-hidden="true"/>오늘 {today}</span><span className="ld-open-legend">점선: 이후 일정 미정 (마감일 미확정)</span></div></section>
    <footer className="ld-footer"><p>빨간 세로 점선은 오늘(KST)을 나타냅니다. 배포·확산 단계 완료 시 진척률은 자동으로 100%가 됩니다.</p><p>진척률 = Σ(담당자 입력 진척률 × 과제 기간 일수) ÷ Σ과제 기간 일수. 선택 기간과 겹치는 과제의 전체 과제 기간을 사용합니다.</p><p>일정 경과율 = 선택 기간 중 오늘까지 지난 일수 ÷ 선택 기간 전체 일수. 시작일·종료일을 포함한 달력 일수, KST 기준입니다.</p><p>과제 기간은 최초 접수일 ~ G2 확정 마감일입니다. 마감일 미확정 과제는 접수일부터 오늘까지 실선, 이후는 점선으로 표시하며 가중 평균과 종료 임박 집계에서 제외합니다. 전체 / D2B 및 개발자 선택이 모든 지표와 일정에 적용됩니다.</p></footer>
    </>}
    {editing&&<ProgressDialog key={editing.no} project={editing} editable={canEdit(editing)} headers={headers} onClose={()=>setEditing(null)} onProject={dashboardScope==='all'||editing.isPersonalProject?()=>onProject(editing.no):undefined} onSaved={async()=>{setEditing(null);setMessage('진척률이 저장되었습니다.');await refresh();}}/>}
  </div>;
}

function Gantt({projects,range,today,group,onSelect}) {
  const total=calendarDays(range.start,range.end),width=Math.max(720,Math.min(3600,total*3));
  const tickDays=total>730?Math.ceil(total/26):14;
  const weeks=Array.from({length:Math.ceil(total/tickDays)},(_,i)=>plusDay(range.start,i*tickDays));
  const months=[];for(let date=range.start;date<=range.end;){const next=new Date(`${date.slice(0,7)}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const end=next.toISOString().slice(0,10);months.push({date,days:Math.min(calendarDays(date,range.end),calendarDays(date,end)-1)});date=end;}
  const rows=group==='agent'?projects.map(p=>({project:p,label:p.name,key:p.no})):projects.flatMap(p=>(p.developerNames?.length?p.developerNames:['미배정']).map((name,i)=>({project:p,label:`${name} · ${p.name}`,key:`${p.no}:${i}`}))).sort((a,b)=>a.label.localeCompare(b.label,'ko'));
  return <div className="ld-gantt" tabIndex={0} aria-label="개발 일정 간트 차트, 좌우 스크롤 가능"><div style={{width:width+260,minWidth:'100%'}}><div className="ld-gantt-head"><div>에이전트</div><div className="ld-months" style={{width}}>{months.map(m=><span key={m.date} style={{width:`${m.days/total*100}%`}}>{m.date.slice(0,4)}년 {Number(m.date.slice(5,7))}월</span>)}</div></div><div className="ld-gantt-head ld-weeks"><div>최초 접수일 ~ G2 확정 마감일</div><div style={{width,position:'relative'}}>{weeks.map(date=><span key={date} style={{left:`${(calendarDays(range.start,date)-1)/total*100}%`}}>{Number(date.slice(5,7))}/{Number(date.slice(8))}</span>)}</div></div>
  {rows.map(({project:p,label,key})=>{
    const status=scheduleStatus(p,today),openEnd=!validDay(p.end);
    const start=p.start<range.start?range.start:p.start;
    const actualEnd=openEnd?today:p.end,end=actualEnd>range.end?range.end:actualEnd;
    const left=(calendarDays(range.start,start)-1)/total*100,barWidth=Math.max(0,calendarDays(start,end))/total*100;
    const completedEnd=openEnd?0:Date.parse(p.start)+calendarDays(p.start,p.end)*(p.manualProgress??0)/100*86400000;
    const completedVisible=openEnd?100:Math.max(0,Math.min(calendarDays(start,end)*86400000,completedEnd-Date.parse(start)))/(calendarDays(start,end)*86400000)*100;
    const tailStart=[plusDay(today,1),p.start,range.start].sort().at(-1),tailLeft=(calendarDays(range.start,tailStart)-1)/total*100;
    return <div className="ld-gantt-row" key={key}><button className="ld-gantt-name" title={label} onClick={()=>onSelect(p)}><span style={{background:colors[status]}}/><b className="ld-task-name">{label}</b>{openEnd&&<small className="ld-open-badge">마감 미정</small>}</button><div className="ld-track" style={{width,backgroundSize:`${7/total*100}% 100%`}}>
      {barWidth>0&&<button className="ld-bar" aria-label={`${p.name}, ${percent(p)}, ${p.start}부터 ${openEnd?'오늘까지, 이후 일정 미정':p.end}`} onClick={()=>onSelect(p)} style={{left:`${left}%`,width:`${barWidth}%`,background:`${colors[status]}40`}}><span style={{width:`${completedVisible}%`,background:colors[status]}}/><small>{openEnd?`${statuses[status]} · 마감 미정`:percent(p)} · {p.developerNames?.join(', ')||'미배정'}</small></button>}
      {openEnd&&tailStart<=range.end&&<button className="ld-open-tail" aria-label={`${p.name}, 이후 일정 미정`} onClick={()=>onSelect(p)} style={{left:`${tailLeft}%`,width:`${100-tailLeft}%`}}><small>이후 일정 미정</small></button>}
      {today>=range.start&&today<=range.end&&<i className="ld-today" style={{left:`${(calendarDays(range.start,today)-1)/total*100}%`}}/>}</div></div>;
  })}
  {!rows.length&&<p className="ld-empty">선택 조건에 맞는 개발 일정이 없습니다. 미입력 과제의 최초 접수일과 마감일을 확인해 주세요.</p>}
  </div></div>;
}

function ProgressDialog({project,editable,headers,onClose,onSaved,onProject}) {
 const [value,setValue]=useState(project.manualProgress??''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const before=document.activeElement;const dialog=document.getElementById('leader-progress-dialog');dialog?.showModal();return()=>{dialog?.close();before?.focus?.();};},[]);
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const res=await fetch(`/api/database/projects/${encodeURIComponent(project.no)}`,{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({changes:{progressChange:{percent:Number(value),note,expectedRevision:project.progressRevision||0}}})});const data=await res.json();if(!res.ok)throw Error(data.error||'저장하지 못했습니다.');await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <dialog id="leader-progress-dialog" className="ld-dialog" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} aria-labelledby="ld-dialog-title"><header><div><small>{project.no} · {project.category}</small><h2 id="ld-dialog-title">{project.name}</h2></div><button aria-label="닫기" disabled={busy} onClick={onClose}><X size={20}/></button></header><p>담당 개발자: {project.developerNames?.join(' · ')||'미배정'}</p><form onSubmit={save}><fieldset disabled={!editable||busy}><div className="ld-editor-grid"><label>진척률 (%) <input autoFocus type="number" min="0" max="100" step="1" required value={value} placeholder="미입력" onChange={e=>setValue(e.target.value)}/></label><label>최초 접수일 <input type="text" readOnly value={project.start||'미등록'} aria-label="최초 접수일 (자동 연결)"/></label></div><label>진척 메모 (선택)<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="완료한 작업이나 남은 작업을 기록하세요."/></label></fieldset><p>G2 확정 마감일: <b>{project.end||'미확정'}</b> · 기존 마감일 확정 절차에서 관리합니다.</p><p className="ld-help">{deploymentCompleted(project)?'배포·확산 완료에 따라 진척률이 자동으로 100%로 관리됩니다.':editable?'진척률 저장은 승인·업무 단계를 변경하지 않습니다.':'배정된 개발 담당자만 진척률을 입력할 수 있습니다.'}</p>{error&&<p className="ld-error" role="alert">{error}</p>}<div className="ld-dialog-actions">{onProject&&<button type="button" onClick={onProject} disabled={busy}><ArrowSquareOut/> 과제 열기</button>}{editable&&<button type="submit" className="primary" disabled={busy||value===''}><PencilSimple/>{busy?'저장 중…':'진척률 저장'}</button>}</div></form><details><summary>진척률 변경 이력 ({project.progressHistory?.length||0})</summary>{[...(project.progressHistory||[])].reverse().map((entry,i)=><article className="ld-history" key={i}><b>{entry.previousPercent??'미입력'} → {entry.percent}%</b><p>{entry.note||'메모 없음'}</p><small>{entry.actorName} · {formatKst(entry.at)}</small></article>)}</details></dialog>;
}
