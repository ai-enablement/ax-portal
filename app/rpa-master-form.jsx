'use client';
import RpaSelect from './rpa-select';
import {initialPics,picFields} from '../shared/rpa-pics.mjs';
import {useState} from 'react';
import {dayTimes,timeKey,scheduleSummary,applySchedulePreset} from '../shared/rpa-schedule.mjs';
import {isRpaRunDay} from '../shared/rpa-display.mjs';
import {developerOptions} from '../shared/rpa-developers.mjs';
import {Check,Circle,PlusCircle} from '@phosphor-icons/react';

const keys=['과제번호','과제명','법인','본부','부서','접수타입','PIC','현업 이메일','개발자','운영 PC','현업배포일자','사용 화면','주기','실행 방법','실행일','실행 시간','개발공수(DAY)','월 작업 MH (25일)','비고'];
const days=['월','화','수','목','금','토','일'];
const requiredKeys=['과제번호','과제명','부서','PIC','개발자','운영 PC'];
export default function RpaMasterForm({onSave,onDelete,onCancel,busy,projects=[],people=[],links=[],project=null}){
 const [pics,setPics]=useState(()=>project?initialPics(project,links):[{pic:'',email:''}]);
 const [deleteReason,setDeleteReason]=useState(''),[confirmCode,setConfirmCode]=useState('');
 const [fields,setFields]=useState(()=>({...Object.fromEntries([...keys,...days].map(k=>[k,days.includes(k)?(isRpaRunDay(project?.fields?.[k])?'O':''):String(project?.fields?.[k]??(k==='과제번호'?project?.code||'':''))])),...Object.fromEntries(days.map(d=>[timeKey(d),dayTimes(project?.fields)[d]]))})),[reason,setReason]=useState('');
 const set=(k,v)=>setFields(prev=>({...prev,[k]:v}));
 const presets=selected=>setFields(prev=>applySchedulePreset(prev,selected));
 function field(key,label=key,{span=1,type='text',placeholder='',options=false,area=false}={}){
  const list=key==='개발자'?developerOptions(projects,people):options?[...new Set(projects.map(p=>p.fields?.[key]).filter(Boolean))]:[];
  return <label className={`rpa-master-span-${span}`} key={key}>{label}{requiredKeys.includes(key)&&<span className="rpa-required" aria-hidden="true"> *</span>}{area?<textarea rows={3} value={fields[key]} maxLength={10000} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>:options?<RpaSelect aria-label={label} options={list} multiple={key==='개발자'} allowCustom required={requiredKeys.includes(key)} value={fields[key]} onChange={e=>set(key,e.target.value)}/>:<input readOnly={!!project&&key==='과제번호'} required={requiredKeys.includes(key)} type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} maxLength={10000} value={fields[key]} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>}</label>;
 }
 return <form className="rpa-form rpa-master-form" onSubmit={e=>{e.preventDefault();if(!busy)onSave({action:project?'master-update':'master',pics,fields:{...fields,...picFields(pics),'실행 시간':days.some(d=>fields[timeKey(d)])?scheduleSummary(fields):fields['실행 시간']},...(project?{id:project.id,revision:project.revision??0,reason}:{})});}}>
  <h2>{project?'RPA 과제 정보 수정':'신규 RPA 과제 등록'}</h2>
  <section><h3><Circle weight="fill"/>1. 과제 기본 식별 정보</h3>
   <div className="rpa-master-name-grid">{field('과제번호','과제번호',{placeholder:'예: HQ-0007'})}{field('과제명','과제명',{placeholder:'예: 수출입 선적 서류 자동 검증 및 관세청 유니패스 연동'})}</div>
   <div className="rpa-master-grid">{field('법인','법인',{options:true})}{field('본부')}{field('부서','부서명')}{field('접수타입','접수구분',{options:true})}</div>
   <div className="rpa-pic-list">{pics.map((p,i)=><div className="rpa-pic-row" key={i}><label>현업 담당자 (PIC)<input required disabled={busy} maxLength={100} value={p.pic} onChange={e=>setPics(prev=>prev.map((x,j)=>j===i?{...x,pic:e.target.value}:x))}/></label><label>PIC MS 계정 이메일<input type="email" disabled={busy} maxLength={254} value={p.email} placeholder="미입력 시 계정 미연결" onChange={e=>setPics(prev=>prev.map((x,j)=>j===i?{...x,email:e.target.value}:x))}/></label><button type="button" disabled={busy||pics.length===1} onClick={()=>setPics(prev=>prev.filter((_,j)=>j!==i))}>PIC 삭제</button></div>)}</div><button type="button" disabled={busy||pics.length>=50} onClick={()=>setPics(prev=>[...prev,{pic:'',email:''}])}>PIC 추가</button>
   {project?.fields?.['현업 이메일']&&project.pics?.length>1&&<p className="rpa-request-note">기존 이메일: {project.fields['현업 이메일']} · 각 PIC의 이메일 연결을 확인해 주세요. 이름 순서만으로 자동 배정하지 않습니다.</p>}
  </section>
  <section><h3><Circle weight="fill"/>2. 개발 및 가상PC 운영 인프라</h3><div className="rpa-master-grid">{field('개발자','담당 개발자',{options:true,span:2})}{field('운영 PC','운영 가상 PC',{options:true})}{field('현업배포일자','현업 배포일',{type:'date'})}{field('사용 화면','사용 화면 / 대상 시스템 연계',{span:4,area:true,placeholder:'예: SAP ERP > SD모듈\n관세청 유니패스 수입화물조회'})}</div></section>
  <section><h3><Circle weight="fill"/>3. 실행 스케줄 및 요일 설정</h3><div className="rpa-master-grid">{field('주기','주기',{options:true})}{field('실행 방법','실행방법',{options:true})}{field('실행일','실행일 구분',{options:true})}{field('실행 시간','기존 일정 / 추가 설명',{placeholder:'요일별 시간은 아래에서 입력'})}</div>
   <div className="rpa-master-days"><div className="rpa-master-days-heading"><strong>요일별 실행 지정</strong><div>{[['주중 (월~금)',days.slice(0,5)],['매일 (월~일)',days],['초기화',[]]].map(([label,selected])=><button key={label} type="button" aria-pressed={selected.length?days.every(d=>(fields[d]==='O')===selected.includes(d)):undefined} onClick={()=>presets(selected)}>{label}</button>)}</div></div><div className="rpa-master-day-times">{days.map(d=><div key={d}><button type="button" aria-label={d+'요일 실행'} aria-pressed={fields[d]==='O'} onClick={()=>set(d,fields[d]==='O'?'':'O')}>{d}{fields[d]==='O'&&<Check size={12} weight="bold"/>}</button><input aria-label={d+'요일 실행 시간'} disabled={fields[d]!=='O'} value={fields[timeKey(d)]} placeholder="예: 15:00" pattern={String.raw`([01]?[0-9]|2[0-3]):[0-5][0-9](\s*,\s*([01]?[0-9]|2[0-3]):[0-5][0-9])*`} onChange={e=>set(timeKey(d),e.target.value)}/></div>)}</div><p className="rpa-request-note">요일을 선택한 뒤 시간을 입력하세요. 여러 번 실행하면 쉼표로 구분합니다. 예: 09:00, 15:30 (KST)</p></div>
  </section>
  <section><h3><Circle weight="fill"/>4. 공수 및 작업시간 (선택)</h3><div className="rpa-master-grid">{field('개발공수(DAY)','개발 공수 (M/D)',{span:2,type:'number',placeholder:'예: 10'})}{field('월 작업 MH (25일)','월 작업시간 (MH · 25일 기준)',{span:2,type:'number',placeholder:'예: 15.0'})}{field('비고','비고 및 특이사항',{span:4,placeholder:'예: 매월 1일 전월 마감 후 수동 확인 필요'})}</div></section>
  {project&&<label>변경 사유 <span className="rpa-required">*</span><textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="변경 사유를 입력해 주세요."/></label>}
  <p className="rpa-request-note">PIC 이메일은 MS 로그인 계정, 과제 조회 권한, 완료 메일 수신에 함께 사용됩니다. 이메일을 비워 두면 미연결 상태입니다.</p>
  {project&&onDelete&&<details className="rpa-master-delete"><summary>과제 삭제</summary><p>과제와 연결된 완료 요청이 목록에서 제외됩니다. 원본·첨부파일·이력은 보관하며, 진행 중인 요청이 있으면 삭제할 수 없습니다.</p><label>삭제 사유<textarea maxLength={1000} value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} disabled={busy}/></label><label>확인: 과제번호 {project.code} 입력<input value={confirmCode} onChange={e=>setConfirmCode(e.target.value)} disabled={busy} autoComplete="off"/></label><button type="button" disabled={busy||!deleteReason.trim()||confirmCode!==project.code} onClick={()=>onDelete({action:'master-delete',id:project.id,revision:project.revision??0,reason:deleteReason,confirmCode})}>과제 삭제 확인</button></details>}
  <footer className="rpa-form-actions"><button type="button" disabled={busy} onClick={onCancel}>취소</button><button className="rpa-primary" disabled={busy}><PlusCircle size={17}/>{busy?'저장 중…':project?'변경 내용 저장':'과제 마스터에 신규 등록'}</button></footer>
 </form>;
}
