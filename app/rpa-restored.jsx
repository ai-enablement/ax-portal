'use client';
import RpaSelect from './rpa-select';
import {useState} from 'react';
import {CaretRight,Desktop,Clock,PlusCircle,ClockCounterClockwise,ListBullets,PencilSimple,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {MASTER_COLUMNS,STATUS_LABELS,masterCells,projectHistory,isRpaRunDay} from '../shared/rpa-display.mjs';
import {formatKst} from '../shared/portal-time.mjs';
const show=v=>v===null||v===undefined||v===''?'미등록':String(v);
export function RequestTable({requests,open}){
 return <div className="rpa-table-wrap"><table className="rpa-requests"><thead><tr>{['티켓 번호 / 우선순위','과제 번호','요청 부서/자','유형','요청 제목 및 내용','진행 상태','담당 개발자','접수 / 완료 일시','완료 메일','관리'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id} onClick={()=>open(r)}><td>{r.code}<span className={`rpa-priority-tag ${r.priority==='urgent'?'urgent':'normal'}`}>{r.priority==='urgent'&&<WarningCircle size={14} weight="fill" aria-hidden="true"/>}{r.priority==='urgent'?'긴급':'일반'}</span></td><td>{r.project?.code}</td><td>{r.requester}<small>{r.project?.department}</small></td><td>{r.type}</td><td><button className="rpa-row-title" onClick={()=>open(r)}>{r.title}</button><small className="rpa-truncate">{r.description}</small></td><td><span className={'rpa-badge '+r.status}>{STATUS_LABELS[r.status]}</span></td><td>{r.assignee||'미배정'}</td><td>{formatKst(r.createdAt)}<small>{r.completedAt?formatKst(r.completedAt):'진행중'}</small></td><td>{r.mailStatus==='sent'?'발송 완료':'미발송'}</td><td><button aria-label={r.code+' 상세'} onClick={()=>open(r)}><CaretRight/></button></td></tr>)}</tbody></table>{!requests.length&&<p className="rpa-empty">조회 가능한 요청이 없습니다.</p>}</div>;
}
export function MasterTable({projects,requests,onDetail,onRequest,onHistory,onBrowse,onEdit,canManage=false}){
 return <><p className="rpa-scroll-hint">페이지당 10개 과제를 표시합니다.</p><div className="rpa-table-wrap rpa-master-wrap" role="region" aria-label="RPA 과제 마스터 시트" tabIndex={0}><table className="rpa-master"><colgroup>{[5,3,5,4,17,4,7,3,5,6,6,5,15,15].map((width,i)=><col key={i} style={{width:(width/110*100)+'%'}}/>)}</colgroup><thead><tr>{[...MASTER_COLUMNS,'작업'].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{projects.map(p=>{const rows=requests.filter(r=>r.projectId===p.id);return <tr key={p.id}>{masterCells(p).map((v,i)=><td key={MASTER_COLUMNS[i]}>{i===4?<button className="rpa-row-title" onClick={()=>onDetail(p)}>{show(v)}</button>:i===5?<span className="rpa-intake-tag">{show(v)}</span>:i===10?<span className="rpa-pc"><Desktop size={17} aria-hidden="true"/>{show(v)}</span>:i===12?<div className="rpa-schedule"><span className="rpa-schedule-time"><Clock size={15} aria-hidden="true"/>{show(p.fields?.['실행 시간'])}</span><small>{p.fields?.['실행일']?'('+p.fields['실행일']+')':'실행일 미등록'}</small><div className="rpa-weekdays" aria-label="요일별 실행 일정">{['월','화','수','목','금','토','일'].map(d=><span key={d} className={isRpaRunDay(p.fields?.[d])?'active':''} aria-label={d+'요일 '+(isRpaRunDay(p.fields?.[d])?'실행':'미지정')}>{d}</span>)}</div></div>:show(v)}</td>)}<td className="rpa-actions-cell"><div className="rpa-row-actions"><button className="rpa-action-request" onClick={()=>canManage?onEdit(p):onRequest(p)}>{canManage?<PencilSimple size={17}/>:<PlusCircle size={17}/>} {canManage?'과제 정보 수정':'오류/수정 요청'}</button><button onClick={()=>onHistory(p)}><ClockCounterClockwise size={16}/>이력로그 <span className="rpa-count">{projectHistory(p,requests).length}건</span></button><button className="rpa-action-browse" onClick={()=>onBrowse(p)}><ListBullets size={16}/>과제 {rows.length}건 등록 <span className="rpa-running">{rows.filter(r=>r.status!=='completed').length}진행</span></button></div></td></tr>;})}</tbody></table>{!projects.length&&<p className="rpa-empty">조회 가능한 과제가 없습니다.</p>}</div></>;
}
export function ProjectLog({project,requests,onOpen,onBrowse,onClose}){
 const [kind,setKind]=useState('all');const entries=projectHistory(project,requests),shown=entries.filter(h=>kind==='all'||h.kind===kind);
 const types=[['all','전체 이력 보기'],['master','마스터 등록'],['master_updated','과제 정보 수정'],['created','신규 접수'],['assigned','담당자 배정'],['status','상태 변경'],['updated','조치 내용 갱신'],['completed','처리 완료'],['mail','완료 알림 메일']];
 const fields=project.fields||{};

 return <div className="rpa-project-log">
  <header className="rpa-log-heading"><h2>{project.code} · {project.name}</h2><p className="rpa-muted">과제별 변경 및 완료 이력 · {entries.length}건</p></header>
  <dl className="rpa-log-summary" aria-label="RPA 과제 요약">

   <div><dt>배포일자</dt><dd>{show(fields['현업배포일자'])}</dd></div>
   <div><dt>부서</dt><dd>{show(project.department)}</dd></div>
   <div><dt>현업 PIC</dt><dd>{show(project.pics?.join('/'))}</dd></div>
   <div><dt>개발자</dt><dd>{show(project.developer)}</dd></div>
   <div><dt>운영 PC</dt><dd><Desktop size={15} aria-hidden="true"/>{show(fields['운영 PC'])}</dd></div>
   <div className="rpa-log-schedule"><dt>스케줄</dt><dd><Clock size={15} aria-hidden="true"/>{[fields['실행 시간'],fields['실행일']].filter(Boolean).join(' · ')||'미등록'}</dd></div>
  </dl>
  <div className="rpa-log-toolbar"><h3>이력 타임라인</h3><label>유형 필터<RpaSelect value={kind} onChange={e=>setKind(e.target.value)}>{types.map(([v,l])=><option key={v} value={v}>{l} ({v==='all'?entries.length:entries.filter(h=>h.kind===v).length})</option>)}</RpaSelect></label></div>
  <ol className="rpa-history rpa-log-timeline">{shown.map((h,i)=><li key={i}>
   <div className="rpa-log-event-head"><span className={'rpa-log-kind '+h.kind}>{types.find(([v])=>v===h.kind)?.[1]||'변경 이력'}</span>{h.requestCode&&<span className="rpa-log-ticket">{h.requestCode}</span>}<time><Clock size={13} aria-hidden="true"/>{formatKst(h.at)}</time></div>
   <strong>{h.label}</strong><div className="rpa-log-event-meta"><span>작성자: {show(h.actor)}</span>{h.requestId&&<button onClick={()=>onOpen(requests.find(r=>r.id===h.requestId))}>과제 상세 열기 <CaretRight size={13}/></button>}</div>
   {h.reason&&<p>{h.reason}</p>}{h.changes&&<dl>{Object.entries(h.changes).map(([k,v])=><div key={k}><dt>{({status:'진행 상태',assignee:'담당자',analysis:'원인 분석',resolution:'조치 내용',expectedAt:'예정 일시'})[k]||k}</dt><dd>{STATUS_LABELS[v.before]||show(v.before)} → {STATUS_LABELS[v.after]||show(v.after)}</dd></div>)}</dl>}
  </li>)}</ol>
  {!shown.length&&<p className="rpa-empty">{entries.length?'선택한 유형의 이력이 없습니다.':'등록된 이력이 없습니다. 새로운 요청과 변경 사항이 여기에 표시됩니다.'}</p>}
  <footer className="rpa-log-footer"><button onClick={()=>onBrowse(project)}>이 과제의 요청 목록 보기 <CaretRight size={14}/></button>{onClose&&<button onClick={onClose}>닫기</button>}</footer>
 </div>;
}
export function ProgressEditor({request,developers,onSave,busy,actor}){
 const [draft,setDraft]=useState(()=>({status:request.status,assignee:request.assignee||'',analysis:request.analysis||'',resolution:request.resolution||'',expectedAt:request.expectedAt?new Date(new Date(request.expectedAt).getTime()+9*3600000).toISOString().slice(0,16):'',reason:''}));
 const change=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
 const next=({received:'working',working:'testing',testing:'completed'})[draft.status];
 const target=draft.status!==request.status?draft.status:(next||draft.status);
 const actionLabel=draft.status!==request.status?`${STATUS_LABELS[target]} 적용`:next?`완료 · ${STATUS_LABELS[next]}로 이동`:draft.status==='held'?'보류 내용 반영':'완료 내용 반영';
 return <form className="rpa-form rpa-progress-editor" onSubmit={async e=>{e.preventDefault();if(busy)return;await onSave({action:'update',id:request.id,version:request.updatedAt,...draft,status:target,expectedAt:draft.expectedAt?draft.expectedAt+':00+09:00':''});}}>
  <header className="rpa-progress-heading"><h3><ClockCounterClockwise size={18}/>RPA 담당자 유지보수 진행상황 갱신</h3><span>작업자: <strong>{actor?.display_name||actor?.name||actor?.email||'현재 로그인 사용자'}</strong></span></header>
  <fieldset className="rpa-progress-stages" disabled={busy}><legend>진행 상태 단계 변경</legend><div>{Object.entries(STATUS_LABELS).map(([key,label],i)=><button type="button" key={key} aria-pressed={draft.status===key} onClick={()=>change('status',key)}>{i<4?`${i+1}. `:''}{label}</button>)}</div></fieldset>
  <div className="rpa-form-pair"><label>담당 개발자<RpaSelect aria-label="담당 개발자" allowCustom options={developers} value={draft.assignee} onChange={e=>change('assignee',e.target.value)} disabled={busy}/></label><label>반영 예정 일시 (KST)<input disabled={busy} type="datetime-local" value={draft.expectedAt} onChange={e=>change('expectedAt',e.target.value)}/></label></div>
  <label>원인 분석 결과 (Root Cause)<textarea disabled={busy} rows={3} maxLength={15000} value={draft.analysis} onChange={e=>change('analysis',e.target.value)} placeholder="오류가 발생한 기술적·환경적 원인을 기재해 주세요. 예: 화면 선택자 변경, 타임아웃, 마스터 코드 미등록 등"/></label>
  <label>조치 내용 및 수정 내역 (Solution Description)<textarea disabled={busy} required={target==='completed'} rows={3} maxLength={15000} value={draft.resolution} onChange={e=>change('resolution',e.target.value)} placeholder="수정된 소스코드, 선택자 변경 내용, 테스트 결과 및 운영 반영 내역을 기재해 주세요."/></label>
  {draft.status==='held'?<label>반려·보류 사유<textarea disabled={busy} required rows={2} maxLength={15000} value={draft.reason} onChange={e=>change('reason',e.target.value)} placeholder="반려 또는 보류 사유를 입력해 주세요."/></label>:<details className="rpa-progress-reason"><summary>변경 사유 추가 (선택)</summary><label>변경 사유<textarea disabled={busy} rows={2} maxLength={15000} value={draft.reason} onChange={e=>change('reason',e.target.value)}/></label></details>}
  <footer className="rpa-progress-footer"><p>버튼을 누르면 입력 내용과 단계가 함께 반영됩니다.<br/>작업자와 변경 시간은 로그인 계정·KST 기준으로 기록됩니다.</p><button disabled={busy} className="rpa-progress-complete" type="submit"><CheckCircle size={18}/>{busy?'반영 중…':actionLabel}<CaretRight size={18}/></button></footer>
 </form>;
}
