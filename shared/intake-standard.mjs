// INT/FEA v3.0 only. Existing lifecycle/gate authority is unchanged.
export const INTAKE_STANDARD_VERSION = '3.0';
export const ALTERNATIVE_LABELS = ['프로세스·규정 개선', '기존 시스템 기능', '매크로·엑셀', '단순 LLM 챗'];
const text = (key,label,required=false) => ({key,label,required,type:'textarea'});
const select = (key,label,options,required=true) => ({key,label,options,required,type:'select'});
const number = (key,label,required=true) => ({key,label,required,type:'number'});
export const INT_FIELDS = [
  text('int.0','어떤 업무가 힘든가요? · 번거롭거나 실수 잦은 부분',true),
  text('int.performer','누가 이 업무를 하나요?',true),
  number('int.countPerMonth','업무량 · 월평균 건수'),
  number('int.asIsMinutes','건당 처리 시간 · 분'),
  number('int.people','수행 인원 · 명'),
  text('int.quantityBasis','수치 근거 · 집계 기간 또는 대략적인 추정 여부'),
  text('int.currentProcess','지금은 어떻게 처리하나요?'),
  text('int.2','사용 시스템·파일·참고 규정 / 링크'),
  text('int.failureImpact','잘못 처리되면 어떤 일이 생기나요?',true),
  {key:'int.4',label:'완료 요청일',type:'date',required:false},
  text('int.timingReason','완료 요청일의 이유'),
];
export const INT_SECTIONS = [
  {number:2,title:'어떤 업무가 힘든가요?',fields:INT_FIELDS.slice(0,6)},
  {number:3,title:'지금은 어떻게 처리하나요?',fields:INT_FIELDS.slice(6,8)},
  {number:4,title:'잘못 처리되면 어떤 일이 생기나요?',fields:INT_FIELDS.slice(8,9)},
  {number:5,title:'완료 요청일과 이유',fields:INT_FIELDS.slice(9)},
];
export const FEA_FIELDS = [
  text('fea.summary','AI 요구 요약 · 3줄',true),
  ...ALTERNATIVE_LABELS.map((label,i)=>text(`fea.alternatives.${i}`,label+' · 검토 결과',true)),
  text('fea.conclusion','왜 에이전트가 필요한가요? / 대안이 충분한 이유',true),
  text('fea.expectedEffect','기대 효과 · 한 줄'),
  number('fea.savedMinutes','건당 예상 절감 시간 · 분',false),
  text('fea.effectBasis','절감 시간의 근거'),
  text('fea.developmentCost','예상 개발 공수'),
  select('fea.writeExec','시스템 쓰기·실행 권한',['true','false']),
  select('fea.sensitive','민감 개인정보 · 주민번호/건강/급여/인사평가',['true','false']),
  select('fea.businessIdentity','업무 식별정보 · 사번/성명/소속/일정',['true','false']),
  select('fea.scope','사용 범위',['PERSONAL','TEAM','DEPT','MULTI_DEPT','COMPANY']),
  select('fea.damageFinancial','오답이 금전적 손실·법적 문제로 이어지나요?',['true','false']),
  text('fea.maximumDamage','오답 최대 피해',true),
  select('fea.agentType','유형',['AI Agent (판단형)','업무지원 Agent (규칙형)','혼합형']),
  select('fea.autonomy','자율성 초안',['L0','L1','L2','L3','L4']),
];
export function standardValue(state,key) {
  const [,name,index]=key.split('.');
  if(key.startsWith('int.')) {
    if(/^\d$/.test(name)) return state.intakeAnswers?.[Number(name)] ?? '';
    return state.intakeDetails?.[name] ?? (['countPerMonth','asIsMinutes','people'].includes(name) ? state.feaDraft?.[name] : '') ?? '';
  }
  return (index===undefined?state.feaDraft?.[name]:state.feaDraft?.[name]?.[Number(index)]) ?? '';
}
export function numeric(value,allowZero=false) {return /^\d+(\.\d{1,2})?$/.test(String(value)) && Number(value)>=(allowZero?0:0.01) && Number(value)<=1e8;}
export function knownText(value) {return !!String(value??'').trim() && !/^(TBD|미정|모름|미확보|추후|나중에|확인 필요)[.!\s]*$/i.test(String(value).trim());}
export function fieldComplete(field,value) {
  if(field.type==='number')return numeric(value,field.key==='fea.savedMinutes') && (!field.key.endsWith('.people') || Number.isInteger(Number(value)));
  if(field.type==='select')return field.options.includes(String(value));
  if(field.type==='date')return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  return knownText(value);
}
export function intakeRequired(state) {if(state.nativeAgentArtifacts?.INT?.status==='complete')return [];return INT_FIELDS.filter(f=>f.required&&!fieldComplete(f,standardValue(state,f.key)));}
export function intakeSectionRequired(state, sectionNumber) {
  const section=INT_SECTIONS.find(section=>section.number===sectionNumber);
  return (section?.fields||[]).filter(field=>field.required&&!fieldComplete(field,standardValue(state,field.key)));
}
export function feaRequired(state) {
  if(state.nativeAgentArtifacts?.FEA?.status==='complete')return [];
  const missing=FEA_FIELDS.filter(f=>f.required&&!fieldComplete(f,standardValue(state,f.key)));
  return missing;
}
export function intakeFeasibilityMetrics(state) {
  const count=standardValue(state,'int.countPerMonth'), minutes=standardValue(state,'int.asIsMinutes'), saved=state.feaDraft?.savedMinutes;
  return {baselineHours:numeric(count)&&numeric(minutes)?Number(count)*Number(minutes)/60:null,
    savedHours:numeric(count)&&numeric(saved,true)&&knownText(state.feaDraft?.effectBasis)?Number(count)*Number(saved)/60:null};
}
export function intakeDocument(state) {
  return {standardVersion:'3.0',answers:state.intakeAnswers||[],details:state.intakeDetails||{},requester:state.requester,receivedDate:state.receivedDate,
    sections:[{title:'1. 요구자 / 부서 / 접수일',value:[state.requester,state.receivedDate].filter(Boolean).join(' · ')},
      ...INT_FIELDS.map(f=>({key:f.key,title:f.label,value:standardValue(state,f.key),required:!!f.required}))]};
}
