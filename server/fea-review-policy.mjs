import {AGENT_FIELDS,fieldValue} from '../shared/intake-agent.mjs';
import {canWriteResumedFea,canWriteResumedIntake} from '../shared/fea-assignment.mjs';

export function canSaveResumedIntake(actor,project,state,changes){
  const keys=Object.keys(changes);
  return actor.is_active===true&&['INT','FEA'].includes(project.current_stage_code)&&
    canWriteResumedIntake({...state,requester_id:project.requester_id},actor)&&keys.length>0&&
    keys.every(key=>['intakeAnswers','intakeDetails','intakeStandardVersion','intakeDraftCompleted','requestedDate'].includes(key))&&
    (!('intakeDraftCompleted' in changes)||changes.intakeDraftCompleted===true);
}

export function canSaveResumedFea(actor,project,state,changes){
  const keys=Object.keys(changes);
  return actor.is_active===true&&['FEA','G1'].includes(project.current_stage_code)&&
    (project.current_stage_code==='G1')===(Number(state.journeyStep)===2)&&
    canWriteResumedFea({...state,requester_id:project.requester_id},actor)&&keys.length>0&&
    keys.every(key=>['feaDraft','feaCompleted'].includes(key))&&
    (!('feaCompleted' in changes)||changes.feaCompleted===true);
}

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
