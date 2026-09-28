'use client';
import RpaSelect from './rpa-select';
import {MAIL_LABELS} from '../shared/rpa-progress.mjs';
import {useState} from 'react';
import {CaretRight,Desktop,Clock,PlusCircle,ClockCounterClockwise,ListBullets,PencilSimple,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {MASTER_COLUMNS,STATUS_LABELS,masterCells,projectHistory,isRpaRunDay} from '../shared/rpa-display.mjs';
import {formatKst} from '../shared/portal-time.mjs';
const show=v=>v===null||v===undefined||v===''?'미등록':String(v);
export function RequestHistory({history}){
 const labels={stage:'작성 단계',comment:'현업 코멘트',decision:'검증 결과',reason:'반려 사유',assigneeEmail:'개발자 계정',status:'다음 단계',assignee:'담당 개발자',analysis:'원인 분석 결과',resolution:'조치 내용 및 수정 내역',expectedAt:'반영 예정 일시',mailStatus:'메일 발송 상태'};
 const value=(key,v)=>['status','stage'].includes(key)?(STATUS_LABELS[v]||show(v)):key==='decision'?(v==='approved'?'완료':v==='rejected'?'반려':show(v)):key==='mailStatus'?(MAIL_LABELS[v]||show(v)):key==='expectedAt'&&v?formatKst(v):show(v);
 return <ol className="rpa-history">{history.map((h,i)=><li key={i}><details><summary><strong>{h.label}</strong><span>{h.actor} · {formatKst(h.at)}</span></summary>{h.reason&&<p>{h.reason}</p>}{h.snapshot&&<dl className="rpa-fields">{Object.entries(h.snapshot).map(([k,v])=><div key={k}><dt>{labels[k]||k}</dt><dd>{value(k,v)}</dd></div>)}</dl>}{h.changes&&<dl className="rpa-fields">{Object.entries(h.changes).map(([k,v])=><div key={k}><dt>{labels[k]||k} 변경</dt><dd>이전: {value(k,v.before)}<br/>이후: {value(k,v.after)}</dd></div>)}</dl>}{!h.snapshot&&!h.changes&&<p className="rpa-muted">이 이력에는 상세 내용이 기록되어 있지 않습니다.</p>}</details></li>)}</ol>;
}
export function RequestTable({requests,open}){
 return <div className="rpa-table-wrap"><table className="rpa-requests"><thead><tr>{['티켓 번호 / 우선순위','과제 번호','요청 부서/자','유형','요청 제목 및 내용','진행 상태','담당 개발자','접수 / 완료 일시','완료 메일','관리'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id} onClick={()=>open(r)}><td>{r.code}<span className={`rpa-priority-tag ${r.priority==='urgent'?'urgent':'normal'}`}>{r.priority==='urgent'&&<WarningCircle size={14} weight="fill" aria-hidden="true"/>}{r.priority==='urgent'?'긴급':'일반'}</span></td><td>{r.project?.code}</td><td>{r.requester}<small>{r.project?.department}</small></td><td>{r.type}</td><td><button className="rpa-row-title" onClick={()=>open(r)}>{r.title}</button><small className="rpa-truncate">{r.description}</small></td><td><span className={'rpa-badge '+r.status}>{r.status==='completed'&&!r.completedAt?'개발자 최종 확인 대기':STATUS_LABELS[r.status]}</span></td><td>{r.assignee||'미배정'}</td><td>{formatKst(r.createdAt)}<small>{r.completedAt?formatKst(r.completedAt):'진행중'}</small></td><td>{MAIL_LABELS[r.mailStatus]||'미발송'}</td><td><button aria-label={r.code+' 상세'} onClick={()=>open(r)}><CaretRight/></button></td></tr>)}</tbody></table>{!requests.length&&<p className="rpa-empty">조회 가능한 요청이 없습니다.</p>}</div>;
}
export function MasterTable({projects,requests,onDetail,onRequest,onHistory,onBrowse,onEdit,canManage=false}){
 return <><p className="rpa-scroll-hint">페이지당 10개 과제를 표시합니다.</p><div className="rpa-table-wrap rpa-master-wrap" role="region" aria-label="RPA 과제 마스터 시트" tabIndex={0}><table className="rpa-master"><colgroup>{[5,3,5,4,17,4,7,3,5,6,6,5,15,15].map((width,i)=><col key={i} style={{width:(width/110*100)+'%'}}/>)}</colgroup><thead><tr>{[...MASTER_COLUMNS,'작업'].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{projects.map(p=>{const rows=requests.filter(r=>r.projectId===p.id);return <tr key={p.id}>{masterCells(p).map((v,i)=><td key={MASTER_COLUMNS[i]}>{i===4?<button className="rpa-row-title" onClick={()=>onDetail(p)}>{show(v)}</button>:i===5?<span className="rpa-intake-tag">{show(v)}</span>:i===10?<span className="rpa-pc"><Desktop size={17} aria-hidden="true"/>{show(v)}</span>:i===12?<div className="rpa-schedule"><span className="rpa-schedule-time"><Clock size={15} aria-hidden="true"/>{show(p.fields?.['실행 시간'])}</span><small>{p.fields?.['실행일']?'('+p.fields['실행일']+')':'실행일 미등록'}</small><div className="rpa-weekdays" aria-label="요일별 실행 일정">{['월','화','수','목','금','토','일'].map(d=><span key={d} className={isRpaRunDay(p.fields?.[d])?'active':''} aria-label={d+'요일 '+(isRpaRunDay(p.fields?.[d])?'실행':'미지정')}>{d}</span>)}</div></div>:show(v)}</td>)}<td className="rpa-actions-cell"><div className="rpa-row-actions"><button className="rpa-action-request" onClick={()=>canManage?onEdit(p):onRequest(p)}>{canManage?<PencilSimple size={17}/>:<PlusCircle size={17}/>} {canManage?'과제 정보 수정':'오류/수정 요청'}</button><button onClick={()=>onHistory(p)}><ClockCounterClockwise size={16}/>이력로그 <span className="rpa-count">{projectHistory(p,requests).length}건</span></button><button className="rpa-action-browse" onClick={()=>onBrowse(p)}><ListBullets size={16}/>과제 {rows.length}건 등록 <span className="rpa-running">{rows.filter(r=>!r.completedAt).length}진행</span></button></div></td></tr>;})}</tbody></table>{!projects.length&&<p className="rpa-empty">조회 가능한 과제가 없습니다.</p>}</div></>;
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
export function ProgressEditor({request,developers,onSave,busy}){
 const action=request.allowedAction,locked=!action;
 const [draft,setDraft]=useState({assigneeEmail:request.assigneeEmail||'',expectedAt:request.expectedAt?new Date(new Date(request.expectedAt).getTime()+9*3600000).toISOString().slice(0,16):'',analysis:request.analysis||'',resolution:request.resolution||'',comment:'',reason:'',decision:'approved'});
 const change=(k,v)=>setDraft(prev=>({...prev,[k]:v}));
 const label=({assign:'접수 완료 · 조치·개발중으로 이동',resolve:'조치 완료 · 현업 검증 요청',verify:draft.decision==='rejected'?'반려 · 조치·개발중으로 이동':'검증 완료 · 개발자 최종 확인 요청',finalize:'최종 확인 · 조치 완료'})[action];
 return <form className="rpa-form rpa-progress-editor" onSubmit={async e=>{e.preventDefault();if(busy||locked)return;await onSave({action:'update',operation:action,id:request.id,version:request.updatedAt,...draft,expectedAt:draft.expectedAt?draft.expectedAt+':00+09:00':''});}}>
 <header className="rpa-progress-heading"><h3><ClockCounterClockwise size={18}/>RPA 유지보수 진행 상황</h3></header>
 {request.stageMailStatus&&<p className="rpa-muted">다음 담당자 알림: {MAIL_LABELS[request.stageMailStatus]||request.stageMailStatus}</p>}
 <fieldset className="rpa-progress-stages" disabled><legend>현재 진행 단계</legend><div>{Object.entries(STATUS_LABELS).filter(([k])=>k!=='held').map(([k,v],i)=><button type="button" key={k} aria-pressed={request.status===k}>{i+1}. {v}</button>)}</div></fieldset>
 {locked&&<p className="rpa-muted">{request.completedAt?'최종 완료 · 읽기 전용':request.status==='completed'?'담당 개발자의 최종 확인 대기':'현재 단계 담당자만 작성할 수 있습니다.'}</p>}
 <div className="rpa-form-pair">{action==='assign'?<label>담당 개발자<RpaSelect required aria-label="담당 개발자" options={developers} value={draft.assigneeEmail} onChange={e=>change('assigneeEmail',e.target.value)} disabled={busy}/></label>:<div>담당 개발자<strong style={{display:'block'}}>{request.assignee||'미배정'}</strong></div>}<label>반영 예정 일시 (KST)<input required={action==='assign'} disabled={busy||action!=='assign'} type="datetime-local" value={draft.expectedAt} onChange={e=>change('expectedAt',e.target.value)}/></label></div>
 {request.status!=='received'&&<><label>원인 분석 결과<textarea required={action==='resolve'} disabled={busy||action!=='resolve'} rows={3} value={draft.analysis} maxLength={15000} onChange={e=>change('analysis',e.target.value)}/></label><label>조치 내용 및 수정 내역<textarea required={action==='resolve'} disabled={busy||action!=='resolve'} rows={3} value={draft.resolution} maxLength={15000} onChange={e=>change('resolution',e.target.value)}/></label></>}
 {action==='verify'&&<><p className="rpa-muted">조치 내용을 확인한 뒤 요청하신 대로 처리되었으면 완료해 주세요. 그렇지 않으면 반려를 선택하고 사유를 작성해 주세요.</p><label>검증 결과<RpaSelect value={draft.decision} onChange={e=>change('decision',e.target.value)} disabled={busy}><option value="approved">검증 완료</option><option value="rejected">반려</option></RpaSelect></label><label>코멘트 (선택)<textarea maxLength={15000} value={draft.comment} onChange={e=>change('comment',e.target.value)} disabled={busy}/></label>{draft.decision==='rejected'&&<label>반려 사유<textarea required maxLength={15000} value={draft.reason} onChange={e=>change('reason',e.target.value)} disabled={busy}/></label>}</>}
 {request.verification&&<div className="rpa-source"><strong>현업 검증: {request.verification.decision==='approved'?'완료':'반려'}</strong><p>{request.verification.actor} · {formatKst(request.verification.at)}</p><p>{request.verification.comment||'코멘트 없음'}</p>{request.verification.reason&&<p>반려 사유: {request.verification.reason}</p>}</div>}
 {request.completedAt&&<p className="rpa-muted">완료 메일: {MAIL_LABELS[request.mailStatus]||'미발송'}</p>}
 <footer className="rpa-progress-footer"><p>각 단계의 작성 내용과 처리자가 수정 이력에 기록됩니다.</p>{action&&<button className="rpa-progress-complete" disabled={busy} type="submit"><CheckCircle size={18}/>{busy?'반영 중…':label}<CaretRight size={18}/></button>}</footer>
 </form>;
}
