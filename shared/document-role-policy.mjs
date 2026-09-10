// Document content permissions are independent from project membership and gate voting.
export const canManageAssessment = role => ['admin','team_leader'].includes(role);
export const canReadRecommendation = role => ['team_member','bts','bp_solution'].includes(role);
export const restrictedDocument = code => ['FEA','ARD','ARD_LITE'].includes(code);

export function redactAssessmentContent(project, role) {
  if (canManageAssessment(role)) return project;
  const safe=structuredClone(project);
  for(const key of ['feaDraft','ardLite','agentSession','intakeMessages','feaMessages','ardMessages'])delete safe[key];
  for(const step of [1,3]){
    const record=safe.historicalDocuments?.[step];
    if(record)safe.historicalDocuments[step]={status:record.status,completedAt:record.completedAt};
  }
  return safe;
}

// INT's embedded application loads a whole project. Never let that become a
// back door to the other tabs, chats, markdown, judgement or revision history.
export function redactNativeResponse(value) {
  if(Array.isArray(value))return value.map(redactNativeResponse);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>! /^(fea|ard)(_|$)/i.test(key)&&!['judgement','verdict','roi','track_answers','guardrails','history','audit','_portal_generated_from'].includes(key)).map(([key,val])=>[key,redactNativeResponse(val)]));
}

export function assessmentWriteRequested(changes, previous={}) {
  return Object.keys(changes).some(key=>['feaDraft','feaCompleted','feaAuthor','ardLite'].includes(key))
    || [1,3].some(step=>changes.historicalDocuments?.[step]!==undefined&&JSON.stringify(changes.historicalDocuments[step])!==JSON.stringify(previous.historicalDocuments?.[step]))
    || ['complete_ard_lite','save_ard_lite'].includes(changes.fastTrackAction?.type);
}
