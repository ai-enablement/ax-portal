import {canReadAllRpa} from './rpa-policy.mjs';
export function workflowAction(status,payload,actor,requesterId){
 if(payload.completedAt||payload.deletedAt)return null;
 if(status==='received')return canReadAllRpa(actor.app_role)?'assign':null;
 if(status==='testing')return [String(actor.id),...(actor.sharedUserIds||[])].includes(String(requesterId))?'verify':null;
 if(!canReadAllRpa(actor.app_role))return null;
 const assigned=!!payload.assigneeEmail&&payload.assigneeEmail.toLowerCase()===actor.email.toLowerCase();
 if(status==='working')return assigned?'resolve':null;
 if(status==='completed'&&payload.verification?.decision==='approved')return assigned?'finalize':null;
 return null;
}
export function workflowTransition(status,payload,action,body){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 const text=(key,required=false)=>{const value=String(body[key]||'').trim();if(value.length>15000||(required&&!value))fail('필수 입력 내용을 확인해 주세요.');return value;};
 if(action==='assign'){
  const expectedAt=text('expectedAt',true);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)||!Number.isFinite(Date.parse(expectedAt))||new Date(expectedAt).toISOString().slice(0,10)!==expectedAt)fail('반영 예정일을 올바른 날짜로 입력해 주세요.');
  return {status:'working',values:{assigneeEmail:text('assigneeEmail',true).toLowerCase(),expectedAt}};
 }
 if(action==='resolve')return {status:'testing',values:{analysis:text('analysis',true),resolution:text('resolution',true),verification:null}};
 if(action==='verify'){
  if(!['approved','rejected'].includes(body.decision))fail('검증 결과를 선택해 주세요.');
  return {status:body.decision==='approved'?'completed':'working',values:{verification:{decision:body.decision,comment:text('comment'),reason:body.decision==='rejected'?text('reason',true):''}}};
 }
 if(action==='finalize')return {status:'completed',values:{}};
 fail('현재 단계에서 처리할 수 없는 작업입니다.');
}
