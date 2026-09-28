'use client';
import RpaSelect from './rpa-select';
import {useRef} from 'react';
import {Paperclip,PaperPlaneTilt} from '@phosphor-icons/react';
import {RPA_TYPES} from '../shared/rpa-policy.mjs';

export default function RpaRequestForm({form,setForm,projects,actor,files,setFiles,setError,busy,onSubmit,onCancel}){
 const picker=useRef(null),project=projects.find(p=>p.id===form.projectId),fields=project?.fields||{};
 const change=(key,value)=>setForm({...form,[key]:value});
 const required=<span className="rpa-required" aria-hidden="true">*</span>;
 return <form className="rpa-form rpa-intake-form" onSubmit={onSubmit}>
  <div className="rpa-request-project">
   <label>대상 RPA 과제 선택 {required}<RpaSelect required value={form.projectId} onChange={e=>change('projectId',e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>[{p.code}] {p.name} ({p.department} / 담당: {p.pics?.join('/')||'미지정'})</option>)}</RpaSelect></label>
   <div className="rpa-request-context"><span>운영 PC: <b>{fields['운영 PC']||'미등록'}</b></span><span>실행주기: <b>{fields['주기']||'미등록'} {fields['실행 시간']&&`(${fields['실행 시간']})`}</b></span><span>기존 개발자: <b>{project?.developer||'미등록'}</b></span></div>
  </div>
  <div className="rpa-request-grid">
   <label>요청자 성명 {required}<input readOnly value={actor.name||actor.email}/></label>
   <label>요청 부서<input readOnly value={project?.department||'미등록'}/></label>
   <label>완료 알림 이메일 {required}<input type="email" required value={form.notifyEmail} onChange={e=>change('notifyEmail',e.target.value)}/></label>
   <label>요청 유형 {required}<RpaSelect value={form.type} onChange={e=>change('type',e.target.value)}>{RPA_TYPES.map(t=><option key={t} value={t}>{t==='오류 수정'?'단순 오류 수정 (봇 중단/에러)':t}</option>)}</RpaSelect></label>
   <label>긴급도 / 우선순위 {required}<RpaSelect value={form.priority} onChange={e=>change('priority',e.target.value)}><option value="normal">일반 (정기 일정 및 일반 처리)</option><option value="urgent">긴급 (업무 중단 · 우선 처리)</option></RpaSelect></label>
   <label>오류 발생 날짜<input type="date" required value={form.occurredDate} onChange={e=>change('occurredDate',e.target.value)}/></label>
  </div>
  <label>요청 제목 {required}<input required maxLength={200} placeholder="예: SAP ZSDM0510 출고일자 필드 인식 불가로 인한 스케줄 중단" value={form.title} onChange={e=>change('title',e.target.value)}/></label>
  <label>오류 상세 내용 및 현상 {required}<textarea required rows={4} maxLength={15000} placeholder="오류가 발생한 전후 상황, 재현 절차 또는 변경을 희망하는 요구를 구체적으로 기재해 주세요." value={form.description} onChange={e=>change('description',e.target.value)}/></label>
  <label>오류 발생 단계 (선택)<input maxLength={1000} placeholder="예: SAP 로그인 후 출고 내역 조회 단계" value={form.errorStep||''} onChange={e=>change('errorStep',e.target.value)}/></label>
  <label>에러 메시지 / 로그 내용 (선택)<textarea className="rpa-request-log" rows={2} maxLength={15000} placeholder="예: SelectorNotFoundException: Cannot find UI element... 또는 타임아웃 발생" value={form.log} onChange={e=>change('log',e.target.value)}/></label>
  <div className="rpa-request-upload"><span>첨부 파일 (에러 캡처 이미지 또는 샘플 문서)</span><div className="rpa-upload-row"><output aria-live="polite">{files.length?files.map(f=>f.name).join(', '):'선택된 파일이 없습니다.'}</output><button type="button" disabled={busy} onClick={()=>picker.current?.click()}><Paperclip size={17}/>샘플 첨부</button></div>
   <input ref={picker} className="rpa-file-picker" aria-label="첨부파일 선택" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv" onChange={e=>{const chosen=[...e.target.files];if(chosen.length>5||chosen.some(f=>f.size>5*1024*1024)||chosen.reduce((s,f)=>s+f.size,0)>10*1024*1024){setError('첨부파일은 개별 5MB, 최대 5개 / 총 10MB까지 가능합니다.');e.target.value='';setFiles([]);}else{setFiles(chosen);setError('');}}}/>
   <small>개별 5MB · 최대 5개 / 총 10MB</small>
  </div>
  <p className="rpa-request-note">조치 완료 시 연결된 PIC에게 완료 메일을 보냅니다. PIC 이메일이 미연결이면 위 완료 알림 이메일을 사용합니다.</p>
  <footer className="rpa-form-actions"><button type="button" disabled={busy} onClick={onCancel}>취소</button><button className="rpa-primary" disabled={busy}><PaperPlaneTilt size={17}/>{busy?'접수 중…':'요청 접수 등록'}</button></footer>
 </form>;
}
