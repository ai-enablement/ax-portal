'use client';
import {useState} from 'react';
import {CaretRight,Desktop,Clock,PlusCircle,ClockCounterClockwise,ListBullets} from '@phosphor-icons/react';
import {MASTER_COLUMNS,STATUS_LABELS,masterCells,projectHistory,isRpaRunDay} from '../shared/rpa-display.mjs';
import {formatKst} from '../shared/portal-time.mjs';
const show=v=>v===null||v===undefined||v===''?'미등록':String(v);
export function RequestTable({requests,open}){
 return <div className="rpa-table-wrap"><table className="rpa-requests"><thead><tr>{['티켓 번호 / 우선순위','과제 번호','요청 부서/자','유형','요청 제목 및 내용','진행 상태','담당 개발자','접수 / 완료 일시','완료 메일','관리'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id} onClick={()=>open(r)}><td>{r.code}<small>{r.priority==='urgent'?'긴급':'일반'}</small></td><td>{r.project?.code}</td><td>{r.requester}<small>{r.project?.department}</small></td><td>{r.type}</td><td><button className="rpa-row-title" onClick={()=>open(r)}>{r.title}</button><small className="rpa-truncate">{r.description}</small></td><td><span className={'rpa-badge '+r.status}>{STATUS_LABELS[r.status]}</span></td><td>{r.assignee||'미배정'}</td><td>{formatKst(r.createdAt)}<small>{r.completedAt?formatKst(r.completedAt):'진행중'}</small></td><td>{r.mailStatus==='sent'?'발송 완료':'미발송'}</td><td><button aria-label={r.code+' 상세'} onClick={()=>open(r)}><CaretRight/></button></td></tr>)}</tbody></table>{!requests.length&&<p className="rpa-empty">조회 가능한 요청이 없습니다.</p>}</div>;
}
export function MasterTable({projects,requests,onDetail,onRequest,onHistory,onBrowse}){
 return <><p className="rpa-scroll-hint">표를 좌우로 스크롤해 전체 항목을 확인하세요. 작업 버튼은 오른쪽에 고정됩니다.</p><div className="rpa-table-wrap rpa-master-wrap" role="region" aria-label="RPA 과제 마스터 시트" tabIndex={0}><table className="rpa-master"><thead><tr>{[...MASTER_COLUMNS,'작업'].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{projects.map(p=>{const rows=requests.filter(r=>r.projectId===p.id);return <tr key={p.id}>{masterCells(p).map((v,i)=><td key={MASTER_COLUMNS[i]}>{i===4?<button className="rpa-row-title" onClick={()=>onDetail(p)}>{show(v)}</button>:i===5?<span className="rpa-intake-tag">{show(v)}</span>:i===10?<span className="rpa-pc"><Desktop size={17} aria-hidden="true"/>{show(v)}</span>:i===12?<div className="rpa-schedule"><span className="rpa-schedule-time"><Clock size={15} aria-hidden="true"/>{show(p.fields?.['실행 시간'])}</span><small>{p.fields?.['실행일']?'('+p.fields['실행일']+')':'실행일 미등록'}</small><div className="rpa-weekdays" aria-label="요일별 실행 일정">{['월','화','수','목','금','토','일'].map(d=><span key={d} className={isRpaRunDay(p.fields?.[d])?'active':''} aria-label={d+'요일 '+(isRpaRunDay(p.fields?.[d])?'실행':'미지정')}>{d}</span>)}</div></div>:show(v)}</td>)}<td className="rpa-actions-cell"><div className="rpa-row-actions"><button className="rpa-action-request" onClick={()=>onRequest(p)}><PlusCircle size={17}/>오류/수정 요청</button><button onClick={()=>onHistory(p)}><ClockCounterClockwise size={16}/>이력로그 <span className="rpa-count">{projectHistory(p,requests).length}건</span></button><button className="rpa-action-browse" onClick={()=>onBrowse(p)}><ListBullets size={16}/>과제 {rows.length}건 등록 <span className="rpa-running">{rows.filter(r=>r.status!=='completed').length}진행</span></button></div></td></tr>;})}</tbody></table>{!projects.length&&<p className="rpa-empty">조회 가능한 과제가 없습니다.</p>}</div></>;
}
export function ProjectLog({project,requests,onOpen,onBrowse,onClose}){
 const [kind,setKind]=useState('all');const entries=projectHistory(project,requests),shown=entries.filter(h=>kind==='all'||h.kind===kind);
 const types=[['all','전체 이력 보기'],['master','마스터 등록'],['created','신규 접수'],['assigned','담당자 배정'],['status','상태 변경'],['updated','조치 내용 갱신'],['completed','처리 완료'],['mail','완료 알림 메일']];
 const fields=project.fields||{},status=show(project.status||fields['진행 상태']);
 const tone=/완료/.test(status)?'completed':/보류|중단|반려/.test(status)?'held':/진행|개발|운영/.test(status)?'working':'received';
 return <div className="rpa-project-log">
  <header className="rpa-log-heading"><h2>{project.code} · {project.name}</h2><p className="rpa-muted">과제별 변경 및 완료 이력 · {entries.length}건</p></header>
  <dl className="rpa-log-summary" aria-label="RPA 과제 요약">
   <div><dt>진행 상태</dt><dd><span className={'rpa-badge '+tone}>{status}</span></dd></div>
   <div><dt>배포일자</dt><dd>{show(fields['현업배포일자'])}</dd></div>
   <div><dt>부서</dt><dd>{show(project.department)}</dd></div>
   <div><dt>현업 PIC</dt><dd>{show(project.pics?.join('/'))}</dd></div>
   <div><dt>개발자</dt><dd>{show(project.developer)}</dd></div>
   <div><dt>운영 PC</dt><dd><Desktop size={15} aria-hidden="true"/>{show(fields['운영 PC'])}</dd></div>
   <div className="rpa-log-schedule"><dt>스케줄</dt><dd><Clock size={15} aria-hidden="true"/>{[fields['실행 시간'],fields['실행일']].filter(Boolean).join(' · ')||'미등록'}</dd></div>
  </dl>
  <div className="rpa-log-toolbar"><h3>이력 타임라인</h3><label>유형 필터<select value={kind} onChange={e=>setKind(e.target.value)}>{types.map(([v,l])=><option key={v} value={v}>{l} ({v==='all'?entries.length:entries.filter(h=>h.kind===v).length})</option>)}</select></label></div>
  <ol className="rpa-history rpa-log-timeline">{shown.map((h,i)=><li key={i}>
   <div className="rpa-log-event-head"><span className={'rpa-log-kind '+h.kind}>{types.find(([v])=>v===h.kind)?.[1]||'변경 이력'}</span>{h.requestCode&&<span className="rpa-log-ticket">{h.requestCode}</span>}<time><Clock size={13} aria-hidden="true"/>{formatKst(h.at)}</time></div>
   <strong>{h.label}</strong><div className="rpa-log-event-meta"><span>작성자: {show(h.actor)}</span>{h.requestId&&<button onClick={()=>onOpen(requests.find(r=>r.id===h.requestId))}>과제 상세 열기 <CaretRight size={13}/></button>}</div>
   {h.reason&&<p>{h.reason}</p>}{h.changes&&<dl>{Object.entries(h.changes).map(([k,v])=><div key={k}><dt>{({status:'진행 상태',assignee:'담당자',analysis:'원인 분석',resolution:'조치 내용',expectedAt:'예정 일시'})[k]||k}</dt><dd>{STATUS_LABELS[v.before]||show(v.before)} → {STATUS_LABELS[v.after]||show(v.after)}</dd></div>)}</dl>}
  </li>)}</ol>
  {!shown.length&&<p className="rpa-empty">{entries.length?'선택한 유형의 이력이 없습니다.':'등록된 이력이 없습니다. 새로운 요청과 변경 사항이 여기에 표시됩니다.'}</p>}
  <footer className="rpa-log-footer"><button onClick={()=>onBrowse(project)}>이 과제의 요청 목록 보기 <CaretRight size={14}/></button>{onClose&&<button onClick={onClose}>닫기</button>}</footer>
 </div>;
}
export function ProgressEditor({request,developers,onSave,busy}){
 const [draft,setDraft]=useState(()=>({status:request.status,assignee:request.assignee||'',analysis:request.analysis||'',resolution:request.resolution||'',expectedAt:request.expectedAt?new Date(new Date(request.expectedAt).getTime()+9*3600000).toISOString().slice(0,16):'',reason:''}));
 const change=(key,value)=>setDraft({...draft,[key]:value});
 const save=async(next)=>{await onSave({action:'update',id:request.id,version:request.updatedAt,...draft,status:next||draft.status,expectedAt:draft.expectedAt?draft.expectedAt+':00+09:00':''});};
 const next=({received:'working',working:'testing',testing:'completed'})[draft.status];
 return <form className="rpa-form" onSubmit={e=>{e.preventDefault();save();}}><h3>유지보수 진행상황 관리</h3><div className="rpa-form-pair"><label>진행 상태<select value={draft.status} onChange={e=>change('status',e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>담당 개발자<input list="rpa-developer-options" maxLength={200} value={draft.assignee} onChange={e=>change('assignee',e.target.value)}/><datalist id="rpa-developer-options">{developers.map(d=><option key={d} value={d}/>)}</datalist></label></div><label>반영 예정 일시 (KST)<input type="datetime-local" value={draft.expectedAt} onChange={e=>change('expectedAt',e.target.value)}/></label><label>원인 분석 결과<textarea rows={3} maxLength={15000} value={draft.analysis} onChange={e=>change('analysis',e.target.value)}/></label><label>조치 내용 및 수정 내역<textarea rows={4} maxLength={15000} value={draft.resolution} onChange={e=>change('resolution',e.target.value)}/></label><label>변경 / 반려·보류 사유<textarea required={draft.status==='held'} maxLength={15000} value={draft.reason} onChange={e=>change('reason',e.target.value)}/></label><p className="rpa-muted">작업자와 변경 시간은 실제 로그인 계정·KST 기준으로 기록됩니다.</p><div className="rpa-form-actions"><button disabled={busy}>작업 내용 저장</button>{next&&<button disabled={busy} className="rpa-primary" type="button" onClick={()=>save(next)}>현재 단계 완료 → {STATUS_LABELS[next]}</button>}</div></form>;
}
