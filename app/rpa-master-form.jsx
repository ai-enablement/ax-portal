'use client';
import {useState} from 'react';
import {Check,Circle,PlusCircle} from '@phosphor-icons/react';

const keys=['과제번호','과제명','법인','본부','부서','접수타입','PIC','현업 이메일','개발자','운영 PC','진행 상태','현업배포일자','사용 화면','주기','실행 방법','실행일','실행 시간','개발공수(DAY)','월 작업 MH (25일)','비고'];
const days=['월','화','수','목','금','토','일'];
const requiredKeys=['과제번호','과제명','부서','PIC','개발자','운영 PC'];
export default function RpaMasterForm({onSave,onCancel,busy,projects=[],project=null}){
 const [fields,setFields]=useState(()=>Object.fromEntries([...keys,...days].map(k=>[k,String(project?.fields?.[k]??(k==='과제번호'?project?.code||'':''))]))),[reason,setReason]=useState('');
 const set=(k,v)=>setFields(prev=>({...prev,[k]:v}));
 const presets=selected=>setFields(prev=>({...prev,...Object.fromEntries(days.map(d=>[d,selected.includes(d)?'O':'']))}));
 function field(key,label=key,{span=1,type='text',placeholder='',options=false,area=false}={}){
  const list=options?[...new Set(projects.map(p=>p.fields?.[key]).filter(Boolean))]:[];
  const id=`rpa-master-${keys.indexOf(key)}`;
  return <label className={`rpa-master-span-${span}`} key={key}>{label}{requiredKeys.includes(key)&&<span className="rpa-required" aria-hidden="true"> *</span>}{area?<textarea rows={3} value={fields[key]} maxLength={10000} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>:<input readOnly={!!project&&key==='과제번호'} required={requiredKeys.includes(key)} type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} maxLength={10000} list={options?id:undefined} value={fields[key]} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>} {options&&<datalist id={id}>{list.map(v=><option key={v} value={v}/>)}</datalist>}</label>;
 }
 return <form className="rpa-form rpa-master-form" onSubmit={e=>{e.preventDefault();if(!busy)onSave({action:project?'master-update':'master',fields,...(project?{id:project.id,revision:project.revision??0,reason}:{})});}}>
  <h2>{project?'RPA 과제 정보 수정':'신규 RPA 과제 등록'}</h2>
  <section><h3><Circle weight="fill"/>1. 과제 기본 식별 정보</h3>
   <div className="rpa-master-name-grid">{field('과제번호','과제번호',{placeholder:'예: HQ-0007'})}{field('과제명','과제명',{placeholder:'예: 수출입 선적 서류 자동 검증 및 관세청 유니패스 연동'})}</div>
   <div className="rpa-master-grid">{field('법인','법인',{options:true})}{field('본부')}{field('부서','부서명')}{field('접수타입','접수구분',{options:true})}{field('PIC','현업 담당자 (PIC)',{span:2,placeholder:'예: 김철수 / 이영희 과장'})}{field('현업 이메일','현업 이메일',{span:2,type:'email',placeholder:'예: cskim@company.com'})}</div>
  </section>
  <section><h3><Circle weight="fill"/>2. 개발 및 가상PC 운영 인프라</h3><div className="rpa-master-grid">{field('개발자','담당 개발자',{options:true})}{field('운영 PC','운영 가상 PC',{options:true})}{field('진행 상태','진행상태',{options:true})}{field('현업배포일자','현업 배포일',{type:'date'})}{field('사용 화면','사용 화면 / 대상 시스템 연계',{span:4,area:true,placeholder:'예: SAP ERP > SD모듈\n관세청 유니패스 수입화물조회'})}</div></section>
  <section><h3><Circle weight="fill"/>3. 실행 스케줄 및 요일 설정</h3><div className="rpa-master-grid">{field('주기','주기',{options:true})}{field('실행 방법','실행방법',{options:true})}{field('실행일','실행일 구분',{options:true})}{field('실행 시간','실행 시간',{placeholder:'예: 10:00'})}</div>
   <div className="rpa-master-days"><div className="rpa-master-days-heading"><strong>요일별 실행 지정</strong><div>{[['주중 (월~금)',days.slice(0,5)],['매일 (월~일)',days],['초기화',[]]].map(([label,selected])=><button key={label} type="button" aria-pressed={selected.length?days.every(d=>(fields[d]==='O')===selected.includes(d)):undefined} onClick={()=>presets(selected)}>{label}</button>)}</div></div><div className="rpa-master-day-buttons">{days.map(d=><button type="button" key={d} aria-label={`${d}요일 실행`} aria-pressed={fields[d]==='O'} onClick={()=>set(d,fields[d]==='O'?'':'O')}>{d}{fields[d]==='O'&&<Check size={12} weight="bold"/>}</button>)}</div></div>
  </section>
  <section><h3><Circle weight="fill"/>4. 공수 및 작업시간 (선택)</h3><div className="rpa-master-grid">{field('개발공수(DAY)','개발 공수 (M/D)',{span:2,type:'number',placeholder:'예: 10'})}{field('월 작업 MH (25일)','월 작업시간 (MH · 25일 기준)',{span:2,type:'number',placeholder:'예: 15.0'})}{field('비고','비고 및 특이사항',{span:4,placeholder:'예: 매월 1일 전월 마감 후 수동 확인 필요'})}</div></section>
  {project&&<label>변경 사유 <span className="rpa-required">*</span><textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="변경 사유를 입력해 주세요."/></label>}
  <p className="rpa-request-note">현업 이메일은 연락 정보로 저장됩니다. 조회 권한은 PIC 계정 연결에서 별도로 지정합니다.</p>
  <footer className="rpa-form-actions"><button type="button" disabled={busy} onClick={onCancel}>취소</button><button className="rpa-primary" disabled={busy}><PlusCircle size={17}/>{busy?'저장 중…':project?'변경 내용 저장':'과제 마스터에 신규 등록'}</button></footer>
 </form>;
}
