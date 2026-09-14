import {createHash} from 'node:crypto';
import {withTransaction} from './db/pool.mjs';
import {documentAccess} from './document-files.mjs';
import {finalDocument,withArdApprovals} from '../shared/final-document.mjs';
import {persistArdApprovalDocument} from './ard-approval-document.mjs';
import {persistWorkflowApprovals} from './workflow-v31.mjs';
import {seedNativeProject} from './native-agent.mjs';
const codes=['INT','FEA','G1','ARD','G2','DES','G3','PILOT','G4','OPS'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function historicalAdminChange(previous,actor,input,now=new Date().toISOString()){
 if(actor?.app_role!=='admin'||previous.historicalImport!==true)throw fail(403,'Admin만 과거 이관 과제를 변경할 수 있습니다.');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)throw fail(400,'변경 사유를 입력해 주세요.');
 if(input.previousStep!==Number(previous.journeyStep)||!input.documents&&input.previousVersion!==Number(previous.nativeAgentArtifacts?.[input.document]?.version||0))throw fail(409,'과제가 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
 const state=structuredClone(previous),event={action:input.action,reason:input.reason.trim(),at:now,actorId:String(actor.id),actorName:actor.display_name,previousStep:Number(previous.journeyStep)};
 if(input.action==='replace'){
  const files=input.documents??[input];
  if(!Array.isArray(files)||!files.length||files.length>3||new Set(files.map(f=>f?.document)).size!==files.length)throw fail(400,'INT·FEA·ARD별로 파일을 하나씩 선택해 주세요.');
  for(const file of files){
   if(!file||!['INT','FEA','ARD'].includes(file.document)||typeof file.name!=='string'||!file.name.toLowerCase().endsWith('.md')||typeof file.markdown!=='string'||!file.markdown.trim()||Buffer.byteLength(file.markdown)>1024*1024||file.markdown.includes('\u0000'))throw fail(400,'각각 1MB 이하의 UTF-8 .md 문서를 첨부해 주세요.');
   if(file.previousVersion!==Number(previous.nativeAgentArtifacts?.[file.document]?.version||0))throw fail(409,`${file.document} 문서가 변경되었습니다. 새로고침 후 다시 시도해 주세요.`);
   if(file.document==='INT')state.intakeDraftCompleted=true;
   if(file.document==='FEA')state.feaCompleted=true;
  }
  if(input.documents)event.documents=files.map(file=>({document:file.document,previousVersion:file.previousVersion}));
  else {event.document=input.document;event.previousVersion=input.previousVersion;}
 }else if(input.action==='move'){
  if(!Number.isInteger(input.step)||!codes[input.step]||input.step===5&&!['design','development'].includes(input.phase))throw fail(400,'이동할 단계를 선택해 주세요.');
  if(input.step===Number(previous.journeyStep)&&(input.step!==5||input.phase===(previous.deliveryPhase||'design')))throw fail(400,'이미 현재 단계입니다.');
  state.journeyStep=input.step;state.deliveryPhase=input.step===5?input.phase:'design';
  event.previousPhase=previous.deliveryPhase||'design';delete state.g2ReworkState;
  if(state.lowRoute?.enabled){event.previousLowRoute=state.lowRoute;state.lowRoute={...state.lowRoute,enabled:false};}
  state.historicalBaselineStep=input.step;state.historicalResumeStep=input.step;
  state.historicalCompletedThrough={step:input.step===5&&input.phase==='development'?5:input.step-1,phase:input.step===5&&input.phase==='development'?'design':'development',source:'admin_force_import',at:now};
  state.workflowVersion='3.1';state.progress=Math.round(input.step/9*100);
  state.status='과거 과제 · Admin 단계 이관';state.nextAction=state.status;
  event.step=input.step;event.phase=state.deliveryPhase;
 }else throw fail(400,'지원하지 않는 작업입니다.');
 // Preserve actual signatures in history, never fabricate an approver's vote.
 state.workflowApprovalHistory=[...(state.workflowApprovalHistory||[]),{approvals:state.workflowApprovals||{},reason:event.reason,at:now,source:'admin_historical_override'}];
 state.workflowApprovals={G1:{},G2:{},G3:{},G4:{}};delete state.g1Resolution;
 state.historicalAdminHistory=[...(state.historicalAdminHistory||[]),event];
 return {state,event};
}
export async function historicalAdminUpdate(identity,code,input,transact=withTransaction){
 return transact(async client=>{
  const access=await documentAccess(client,identity,code);
  if(!access||access.actor.app_role!=='admin')throw fail(403,'Admin 전용 기능입니다.');
  await client.query('select id from agent_portal.projects where id=$1 for update',[access.project.id]);
  const previous=(await client.query('select raw_answers from agent_portal.intake_requests where project_id=$1',[access.project.id])).rows[0]?.raw_answers?.portalState||{};
  const {state,event}=historicalAdminChange(previous,access.actor,input);
  if(input.action==='replace'){
   for(const file of input.documents??[input]){
   const input=file;
   let markdown=finalDocument(input.markdown,input.document,access.actor.display_name,event.at);
   if(input.document==='ARD')markdown=withArdApprovals(markdown,state);
   const latest=(await client.query('select max(version_number)::int as version from agent_portal.native_agent_documents where project_id=$1 and document_type=$2',[access.project.id,input.document])).rows[0];
   const doc=(await client.query('insert into agent_portal.native_agent_documents(project_id,document_type,version_number,original_name,markdown,content_sha256,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id,version_number',[access.project.id,input.document,(latest.version||0)+1,input.name.replace(/[\\/\r\n]/g,'_').slice(0,200),markdown,createHash('sha256').update(markdown).digest('hex'),access.actor.id])).rows[0];
   state.nativeAgentArtifacts={...state.nativeAgentArtifacts,[input.document]:{...state.nativeAgentArtifacts?.[input.document],id:String(doc.id),version:doc.version_number,contentVersion:doc.version_number,status:'complete',source:'admin_historical_upload',at:event.at,authorId:String(access.actor.id),authorName:access.actor.display_name}};
   if(event.documents)event.documents.find(item=>item.document===input.document).version=doc.version_number;
   else event.version=doc.version_number;
   const existing=(await client.query('select project_id from agent_portal.native_agent_sessions where project_id=$1',[access.project.id])).rows[0];
   const payload={...(existing?{}:seedNativeProject(code,state)),project_no:code,[input.document.toLowerCase()+'_md']:markdown};
   await client.query('insert into agent_portal.native_agent_sessions(project_id,payload,updated_by) values($1,$2::jsonb,$3) on conflict(project_id) do update set payload=agent_portal.native_agent_sessions.payload||excluded.payload,revision=agent_portal.native_agent_sessions.revision+1,updated_by=excluded.updated_by,updated_at=now()',[access.project.id,JSON.stringify(payload),access.actor.id]);
   }
  }else{
   await client.query("update agent_portal.project_stage_history set exited_at=now(),stage_state='completed',note=coalesce(note,'')||' · Admin 강제 이관' where project_id=$1 and stage_state='active'",[access.project.id]);
   await client.query("insert into agent_portal.project_stage_history(project_id,stage_code,stage_state,entered_at,changed_by,note) values($1,$2,'active',now(),$3,$4)",[access.project.id,codes[state.journeyStep],access.actor.id,'Admin 강제 이관: '+event.reason]);
   const status=state.journeyStep===9?'operating':[2,4,6,8].includes(state.journeyStep)?'in_review':state.journeyStep===0?'submitted':'in_progress';
   await client.query('update agent_portal.projects set current_stage_code=$2,progress_percent=$3,next_action=$4,project_status=$5,updated_at=now() where id=$1',[access.project.id,codes[state.journeyStep],state.progress,state.nextAction,status]);
  }
  if(state.nativeAgentArtifacts?.ARD?.id&&!(input.action==='replace'&&(input.documents??[input]).some(file=>file.document==='ARD')))await persistArdApprovalDocument(client,{...access.project,project_code:code},state,access.actor);
  await persistWorkflowApprovals(client,access.project,state,previous,access.actor);
  await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[access.project.id,JSON.stringify(state)]);
  await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,after_data) values($1,$2,'ADMIN_HISTORICAL_OVERRIDE','project',$3,$4::jsonb)",[access.actor.id,access.project.id,code,JSON.stringify(event)]);
  return {ok:true};
 });
}
