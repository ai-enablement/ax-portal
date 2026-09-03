// Adapted from toreBang/intake-feasibility-agent a956da8:
// slot quality, bounded re-asking, human confirmation, deterministic classification.
import { classifyProject, AGENT_TYPES } from './project-classification.mjs';

const narrative = (key, label, min = 15, optional = false) => ({key, label, min, optional});
const choice = (key, label, choices) => ({key, label, choices});
export const AGENT_FIELDS = [
  narrative('int.0', '업무 문제와 가장 번거롭거나 실수 잦은 부분', 25),
  narrative('int.currentProcess', '현재 업무 처리 절차와 수행자', 20),
  narrative('int.1', '현재 업무량·빈도·처리 시간', 5),
  narrative('int.2', '사용 시스템·자료·참고 규정', 3),
  narrative('int.3', '기대하는 처리 결과', 15),
  narrative('int.failureImpact', '오답·실패 시 최대 피해', 15),
  {key:'int.4', label:'희망 완료일', date:true, optional:true},
  narrative('fea.summary', 'FEA 요구 요약', 30),
  ...['프로세스·규정 개선','기존 시스템 기능·설정','매크로·Excel','단순 LLM 챗·검색'].map((label,i)=>narrative(`fea.alternatives.${i}`, `대안 검토: ${label}`,25)),
  narrative('fea.conclusion','대안 검토 결론',30),
  ...['규칙 문서화 가능성','데이터 접근성','오류 허용도','반복성·볼륨','정치적 이슈'].flatMap((label,i)=>[
    choice(`fea.fitGrades.${i}`,`${label} 등급`,['상','중','하']), narrative(`fea.fitNotes.${i}`,`${label} 근거`,15),
  ]),
  ...[['countPerMonth','월간 건수'],['asIsMinutes','현재 건당 시간(분)'],['people','수행 인원(명)'],['toBeMinutes','목표 건당 시간(분)']].map(([key,label])=>({key:`fea.${key}`,label,number:true,integer:key==='people'})),
  choice('fea.writeExec','시스템 쓰기·실행 권한',['true','false']),
  choice('fea.sensitive','개인정보·기밀정보 취급',['true','false']),
  choice('fea.scope','사용 범위',['PERSONAL','TEAM','DEPT','MULTI_DEPT','COMPANY']),
  choice('fea.damageFinancial','금전·법적 피해 가능성',['true','false']),
  choice('fea.autonomy','자율성 수준',['L0','L1','L2','L3','L4']),
  choice('fea.agentType','Agent 유형',AGENT_TYPES),
];
export const FIELD_MAP = new Map(AGENT_FIELDS.map(f=>[f.key,f]));
const booleanKeys = new Set(['fea.writeExec','fea.sensitive','fea.damageFinancial']);
export function fieldValue(state, key) {
  const [,name,index] = key.split('.');
  if(key.startsWith('int.')) return /^\d$/.test(name) ? state.intakeAnswers?.[Number(name)] ?? '' : state.intakeDetails?.[name] ?? '';
  const value = index === undefined ? state.feaDraft?.[name] : state.feaDraft?.[name]?.[Number(index)];
  return value === undefined || value === null ? '' : String(value);
}
export function validField(field, value) {
  if(typeof value !== 'string' || value.length > 6000) return false;
  if(field.choices) return field.choices.includes(value);
  if(field.number) return /^\d+(\.\d{1,2})?$/.test(value) && Number(value)>0 && Number(value)<=1e8 && (!field.integer || Number.isInteger(Number(value)));
  if(field.date) return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  return value.trim().length >= field.min && !/^(미정|모름|없음|미확보|나중에|추후|잘 모르|해당없음)[.!\s]*$/.test(value.trim());
}
export function setField(state, key, value) {
  const [,name,index] = key.split('.');
  if(key.startsWith('int.')) {
    if(/^\d$/.test(name)) { state.intakeAnswers ||= ['','','','','']; state.intakeAnswers[Number(name)] = value; if(name==='4') state.requestedDate=value; }
    else { state.intakeDetails ||= {}; state.intakeDetails[name] = value; }
  } else {
    state.feaDraft ||= {summary:'',alternatives:['','','',''],conclusion:'',fitGrades:['미평가','미평가','미평가','미평가','미평가'],fitNotes:['','','','',''],countPerMonth:'',asIsMinutes:'',people:'',toBeMinutes:'',developmentCost:'',writeExec:false,sensitive:false,scope:'',damageFinancial:false,autonomy:'',agentType:''};
    if(index !== undefined) { state.feaDraft[name] ||= []; state.feaDraft[name][Number(index)] = value; }
    else state.feaDraft[name] = booleanKeys.has(key) ? value === 'true' : value;
  }
}
export function missingFields(state, prefix = '') {
  return AGENT_FIELDS.filter(f=> !f.optional && f.key.startsWith(prefix) && (
    !validField(f,fieldValue(state,f.key)) ||
    // Default false/track selections are not evidence. Explicit confirmation is required.
    (f.choices && !f.key.includes('fitGrades') && state.agentSession?.confirmed?.[f.key]?.value !== fieldValue(state,f.key))
  ));
}
export function progress(state) {
  const missing = missingFields(state);
  const held = state.agentSession?.held || [];
  return {total:AGENT_FIELDS.filter(f=>!f.optional).length, missing:missing.map(f=>({key:f.key,label:f.label,held:held.includes(f.key)})), ready:missing.length===0};
}
export function safeMessage(text) {
  return !/(?:\d{6}[- ]?[1-8]\d{6}|\b(?:sk-|AIza)[A-Za-z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY-----|(?:api[_ -]?key|비밀키)\s*[:=：]\s*[A-Za-z0-9_-]{16,}|(?:계좌|카드)\s*(?:번호)?\s*[:：]?\s*[\d -]{10,})/i.test(text);
}
export function applyProposals(state, keys, actorId) {
  const next = structuredClone(state);
  const session = next.agentSession;
  if(!session) throw new Error('AI 초안을 먼저 생성해 주세요.');
  const conflicts = [];
  for(const key of keys) {
    const item = session.proposals?.find(p=>p.key===key);
    const field = FIELD_MAP.get(key);
    if(!item || !field || !validField(field,item.value)) continue;
    if(fieldValue(next,key) !== item.baseValue) {conflicts.push(field.label); continue;}
    setField(next,key,item.value);
    session.confirmed ||= {};
    session.confirmed[key] = {value:item.value, evidence:item.evidence, kind:item.kind, actorId:String(actorId), at:new Date().toISOString()};
    session.held = (session.held || []).filter(k=>k!==key);
    session.proposals = session.proposals.filter(p=>p.key!==key);
  }
  return {state:next, conflicts};
}
export function acceptModelTurn(state, result, message, snapshot=state) {
  if(!result || typeof result.reply!=='string' || !Array.isArray(result.proposals) || result.reply.length>8000 || !safeMessage(result.reply)) throw new Error('AI 응답을 검증하지 못했습니다. 다시 시도해 주세요.');
  const next = structuredClone(state);
  const session = next.agentSession;
  const sources = [message,...(next.intakeMessages || []).filter(m=>m.role==='user').map(m=>m.text),...AGENT_FIELDS.map(f=>fieldValue(state,f.key))].join('\n');
  const accepted = new Map((session.proposals || []).map(p=>[p.key,p]));
  for(const item of result.proposals.slice(0,AGENT_FIELDS.length)) {
    const field = FIELD_MAP.get(item?.key);
    if(!field || !validField(field,item.value) || !safeMessage(item.value) || typeof item.evidence!=='string' || item.evidence.length>1200 || !safeMessage(item.evidence)) continue;
    if(!['extracted','suggested'].includes(item.kind)) continue;
    // Numbers must come verbatim from an actual answer, not from model-generated estimates.
    if(field.number && (item.kind!=='extracted' || !item.evidence.trim() || !sources.includes(item.evidence) || !item.evidence.match(/\d+(?:\.\d+)?/g)?.includes(item.value))) continue;
    if(field.number) {
      const unit = item.key==='fea.people' ? /명|인원|사람/ : item.key==='fea.countPerMonth' ? /월|매달/ : /분/;
      if(!unit.test(item.evidence) || /대략|대충|추정|정도|약\s*\d|\d\s*[~～]/.test(item.evidence)) continue;
    }
    if(item.kind==='extracted' && (!item.evidence.trim() || !sources.includes(item.evidence))) continue;
    if(fieldValue(state,item.key)===item.value && session.confirmed?.[item.key]) continue;
    accepted.set(item.key,{key:item.key,value:item.value,evidence:item.evidence,kind:item.kind,baseValue:fieldValue(snapshot,item.key)});
  }
  session.proposals = [...accepted.values()];
  const missing = missingFields(next).filter(f=>!(session.held||[]).includes(f.key) && !accepted.has(f.key));
  const target = missing.find(f=>f.key===result.target) || missing[0];
  let question = '';
  if(target) {
    session.attempts ||= {};
    const count = (session.attempts[target.key] || 0)+1;
    session.attempts[target.key]=count;
    if(count >= (target.number ? 2 : 3)) session.held=[...new Set([...(session.held||[]),target.key])];
    question = target.key===result.target && typeof result.question==='string' && result.question.length<2000 && safeMessage(result.question) ? result.question : `${target.label}을 구체적으로 알려주세요. 확인이 어려우면 보류하고 나중에 보완할 수 있습니다.`;
  }
  const reply = [result.reply,question,accepted.size ? '아래 확인 대기 항목을 검토해 주세요. 확인한 내용만 문서에 반영됩니다.' : '',!target && missingFields(next).length ? '아직 미확보 항목이 있습니다. 완료 처리하지 않고 보류하며, 나중에 답변을 주시면 다시 반영합니다.' : ''].filter(Boolean).join('\n\n');
  return {state:next, reply};
}
export function deterministicSummary(state) {
  const f=state.feaDraft || {};
  const classification = ['writeExec','sensitive','scope','damageFinancial','autonomy','agentType'].every(k=>state.agentSession?.confirmed?.[`fea.${k}`]?.value===fieldValue(state,`fea.${k}`)) ? classifyProject(f) : null;
  const numbers=['countPerMonth','asIsMinutes','people','toBeMinutes'];
  const complete=numbers.every(k=>validField(FIELD_MAP.get(`fea.${k}`),String(f[k]??'')));
  return {classification, roi:complete ? {monthlyHours:(Number(f.asIsMinutes)-Number(f.toBeMinutes))*Number(f.countPerMonth)*Number(f.people)/60,citation:'표준체계 문서② FEA 기대 효과'} : null};
}
