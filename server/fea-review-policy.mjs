import {AGENT_FIELDS,fieldValue} from '../shared/intake-agent.mjs';

export function canCompleteOwnFea(actor,project,state,changes){
  return actor.is_active===true && [project.requester_id,project.owner_id].some(id=>id!=null&&String(id)===String(actor.id)) &&
    !state.historicalImport && Number(state.journeyStep)===1 && project.current_stage_code==='FEA' && !state.feaCompleted &&
    changes.feaCompleted===true;
}

export function reconcileManualAgentFields(state,changes,actor){
  if(!state.agentSession||!(changes.intakeDetails||changes.intakeAnswers||changes.feaDraft))return;
  const session=state.agentSession=structuredClone(state.agentSession);
  session.confirmed||={};
  const resolved=new Set();
  for(const field of AGENT_FIELDS){
    const [,name,index]=field.key.split('.');
    const supplied=field.key.startsWith('int.')?(/^\d$/.test(name)?changes.intakeAnswers?.[Number(name)]!==undefined:changes.intakeDetails?.[name]!==undefined):
      (index===undefined?changes.feaDraft?.[name]!==undefined:changes.feaDraft?.[name]?.[Number(index)]!==undefined);
    if(!supplied)continue;
    const value=fieldValue(state,field.key);
    session.confirmed[field.key]={value,kind:'manual',actorId:String(actor.id),at:new Date().toISOString()};
    const proposal=session.proposals?.find(p=>p.key===field.key);
    if(proposal&&(value!==proposal.baseValue||value===proposal.value))resolved.add(field.key);
  }
  const removed=(session.proposals||[]).filter(p=>resolved.has(p.key));
  if(removed.length){
    session.proposalHistory=[...(session.proposalHistory||[]),...removed.map(p=>({...p,resolution:'manual',actorId:String(actor.id),at:new Date().toISOString()}))];
    session.proposals=(session.proposals||[]).filter(p=>!resolved.has(p.key));
    session.held=(session.held||[]).filter(key=>!resolved.has(key));
  }
  session.revision=(session.revision||0)+1;
}
