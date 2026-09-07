// Adapted from toreBang/intake-feasibility-agent a956da8:
// slot quality, bounded re-asking, human confirmation, deterministic classification.
import { classifyProject } from './project-classification.mjs';
import {INT_FIELDS,FEA_FIELDS,standardValue,feaRequired,intakeFeasibilityMetrics,knownText} from './intake-standard.mjs';

export const AGENT_FIELDS = [...INT_FIELDS,...FEA_FIELDS].map(f=>({key:f.key,label:f.label,min:3,optional:!f.required,...(f.type==='select'?{choices:f.options}:{}),...(f.type==='number'?{number:true,integer:f.key.endsWith('.people'),allowZero:f.key==='fea.savedMinutes'}:{}),...(f.type==='date'?{date:true}:{})}));
// Legacy quantities remain readable; new interviews collect INT quantities once.
for(const name of ['countPerMonth','asIsMinutes','people','toBeMinutes'])AGENT_FIELDS.push({key:'fea.'+name,label:'이전 양식 수치 · '+name,number:true,integer:name==='people',optional:true});
export const FIELD_MAP = new Map(AGENT_FIELDS.map(f=>[f.key,f]));
const booleanKeys = new Set(['fea.writeExec','fea.sensitive','fea.businessIdentity','fea.damageFinancial']);
export function fieldValue(state, key) {
  return String(standardValue(state,key));
}
export function validField(field, value) {
  if(typeof value !== 'string' || value.length > 6000) return false;
  if(field.choices) return field.choices.includes(value);
  if(field.number) return /^\d+(\.\d{1,2})?$/.test(value) && Number(value)>=(field.allowZero?0:0.01) && Number(value)<=1e8 && (!field.integer || Number.isInteger(Number(value)));
  if(field.date) return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  return knownText(value);
}
export function setField(state, key, value) {
  state.intakeStandardVersion='3.0';
  const [,name,index] = key.split('.');
  if(key.startsWith('int.')) {
    if(/^\d$/.test(name)) { state.intakeAnswers ||= ['','','','','']; state.intakeAnswers[Number(name)] = value; if(name==='4') state.requestedDate=value; }
    else { state.intakeDetails ||= {}; state.intakeDetails[name] = value; }
  } else {
    state.feaDraft ||= {summary:'',alternatives:['','','',''],conclusion:'',developmentCost:'',scope:'',track:'',autonomy:'',agentType:''};
    state.feaDraft.standardVersion='3.0';
    if(index !== undefined) { state.feaDraft[name] ||= []; state.feaDraft[name][Number(index)] = value; }
    else state.feaDraft[name] = booleanKeys.has(key) ? value === 'true' : value;
  }
}
export function missingFields(state, prefix = '') {
  const required = AGENT_FIELDS.filter(f=> !f.optional && f.key.startsWith(prefix) && (
    !validField(f,fieldValue(state,f.key)) ||
    // Default false/track selections are not evidence. Explicit confirmation is required.
    (f.choices && !f.key.includes('fitGrades') && state.agentSession?.confirmed?.[f.key]?.value !== fieldValue(state,f.key))
  ));
  if(!prefix || prefix.startsWith('fea')) for(const field of feaRequired(state)) if(!required.some(f=>f.key===field.key)) required.push(FIELD_MAP.get(field.key));
  return required;
}
export function interviewMissingFields(state,prefix='') {
  if(prefix!=='int.')return missingFields(state,prefix);
  return AGENT_FIELDS.filter(field=>field.key.startsWith(prefix)&&!validField(field,fieldValue(state,field.key)));
}
export function progress(state) {
  const prefix=Number(state.journeyStep||0)===0?'int.':'fea.';
  const missing = missingFields(state,prefix);
  const interviewMissing = interviewMissingFields(state,prefix);
  const held = state.agentSession?.held || [];
  return {phase:prefix==='int.'?'INT':'FEA',total:AGENT_FIELDS.filter(f=>!f.optional&&f.key.startsWith(prefix)).length, missing:missing.map(f=>({key:f.key,label:f.label,held:held.includes(f.key)})),interviewMissing:interviewMissing.map(f=>({key:f.key,label:f.label,held:held.includes(f.key)})), ready:missing.length===0};
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
    if(Number(state.journeyStep||0)===0&&!key.startsWith('int.'))continue;
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
function sourceEvidence(evidence,sources) {
  if(typeof evidence!=='string'||sources.includes(evidence))return evidence;
  const trimmed=evidence.trim();
  // Formatting quotes are not evidence: strip one matching outer pair ONLY
  // when the entire inner string is verbatim in an actual source.
  const pairs=[['“','”'],['"','"'],['「','」'],['‘','’']];
  const candidate=pairs.some(([a,b])=>trimmed.startsWith(a)&&trimmed.endsWith(b))?trimmed.slice(1,-1):trimmed;
  return candidate&&sources.includes(candidate)?candidate:evidence;
}
export function acceptModelTurn(state, result, message, snapshot=state) {
  if(!result || typeof result.reply!=='string' || !Array.isArray(result.proposals) || result.reply.length>8000 || !safeMessage(result.reply)) throw new Error('AI 응답을 검증하지 못했습니다. 다시 시도해 주세요.');
  const next = structuredClone(state);
  const session = next.agentSession;
  const sources = [message,...(next.intakeMessages || []).filter(m=>m.role==='user').map(m=>m.text),...AGENT_FIELDS.map(f=>fieldValue(state,f.key))].join('\n');
  const accepted = new Map((session.proposals || []).map(p=>[p.key,p]));
  for(const proposal of result.proposals.slice(0,AGENT_FIELDS.length)) {
    const item={...proposal,evidence:sourceEvidence(proposal?.evidence,sources)};
    const field = FIELD_MAP.get(item?.key);
    if(Number(state.journeyStep||0)===0&&!item.key?.startsWith('int.'))continue;
    if(!field || !validField(field,item.value) || !safeMessage(item.value) || typeof item.evidence!=='string' || item.evidence.length>1200 || !safeMessage(item.evidence)) continue;
    if(!['extracted','suggested'].includes(item.kind)) continue;
    // Numbers must come verbatim from an actual answer, not from model-generated estimates.
    if(field.number && (item.kind!=='extracted' || !item.evidence.trim() || !sources.includes(item.evidence) || !item.evidence.match(/\d+(?:\.\d+)?/g)?.includes(item.value))) continue;
    if(field.number) {
      const unit = item.key.endsWith('.people') ? /명|인원|사람/ : item.key.endsWith('.countPerMonth') ? /월|매달/ : /분/;
      if(!unit.test(item.evidence) || /\d\s*[~～]/.test(item.evidence)) continue;
    }
    if(item.kind==='extracted' && (!item.evidence.trim() || !sources.includes(item.evidence))) continue;
    if(fieldValue(state,item.key)===item.value && session.confirmed?.[item.key]) continue;
    accepted.set(item.key,{key:item.key,value:item.value,evidence:item.evidence,kind:item.kind,baseValue:fieldValue(snapshot,item.key)});
  }
  session.proposals = [...accepted.values()];
  const summary=accepted.get('fea.summary');
  if(Number(state.journeyStep)===1&&summary&&!fieldValue(state,'fea.summary')){
    setField(next,'fea.summary',summary.value);
    session.generatedSummary={kind:'AI 초안 · 담당자 검토 필요',evidence:summary.evidence,at:new Date().toISOString()};
    accepted.delete('fea.summary');session.proposals=[...accepted.values()];
  }
  const phasePrefix=Number(state.journeyStep||0)===0?'int.':'fea.';
  const missing = interviewMissingFields(next,phasePrefix).filter(f=>f.key!=='fea.summary'&&!(session.held||[]).includes(f.key) && !accepted.has(f.key));
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
  if(state.intakeStandardVersion==='3.0'||f.standardVersion==='3.0') {const metrics=intakeFeasibilityMetrics(state);const checked=['writeExec','sensitive','businessIdentity','scope','damageFinancial','track','autonomy','agentType'].every(k=>state.agentSession?.confirmed?.[`fea.${k}`]?.value===fieldValue(state,`fea.${k}`));return {classification:checked?classifyProject({...f,standardVersion:'3.0'}):null,roi:metrics.savedHours===null?null:{monthlyHours:metrics.savedHours,citation:'표준체계 v3.0 FEA 3번 · 월 총 건수 × 건당 절감 시간'},baselineHours:metrics.baselineHours};}
  const classification = ['writeExec','sensitive','scope','damageFinancial','autonomy','agentType'].every(k=>state.agentSession?.confirmed?.[`fea.${k}`]?.value===fieldValue(state,`fea.${k}`)) ? classifyProject(f) : null;
  const numbers=['countPerMonth','asIsMinutes','people','toBeMinutes'];
  const complete=numbers.every(k=>validField(FIELD_MAP.get(`fea.${k}`),String(f[k]??'')));
  return {classification, roi:complete ? {monthlyHours:(Number(f.asIsMinutes)-Number(f.toBeMinutes))*Number(f.countPerMonth)*Number(f.people)/60,citation:'표준체계 문서② FEA 기대 효과'} : null};
}
