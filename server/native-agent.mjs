import {createHash} from 'node:crypto';
import {isProjectCode} from '../shared/project-code.mjs';
import {assignCompletedIntNumber} from './project-numbering.mjs';
import {getPool,withTransaction} from './db/pool.mjs';
import {documentAccess} from './document-files.mjs';
import {runNativeAgent} from './native-agent-runtime.mjs';
import {azureConfiguration} from './intake-agent.mjs';
import {canBackfillDocument} from '../shared/historical-import-policy.mjs';
import {canManageAssessment,canReadRecommendation,redactNativeResponse} from '../shared/document-role-policy.mjs';
const steps={INT:0,FEA:1,ARD:3};
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function nativeFormFingerprint(value){
 const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
}
export function seedNativeProject(code,state){
 const a=state.intakeAnswers||[],d=state.intakeDetails||{},f=state.feaDraft||{};
 const legacyArd=state.historicalDocuments?.[3]?.documents?.ARD?.fields;
 const map={one_line:'overview.oneLine',scope_limit:'toBe.process',in_scope:'toBe.inScope',out_scope:'toBe.outScope',human_point:'toBe.hitl',autonomy_reason:'autonomy.reason',autonomy_upgrade:'autonomy.upgrade',knowledge_refs:'knowledge.sources',knowledge_data:'knowledge.data',knowledge_owner:'knowledge.owner',constraints:'constraints.schedule'};
 const ard=legacyArd?Object.fromEntries(Object.entries(map).filter(([,key])=>typeof legacyArd[key]==='string'&&legacyArd[key]).map(([key,old])=>[key,legacyArd[old]])):null;
 if(ard)ard.autonomy_level=String(legacyArd['autonomy.level']||'').match(/^L[0-4]/)?.[0]||'';
 return {project_no:code,agent_name:state.name||'',status:'접수중',history:[],reask:{},
  int_data:{project_no:code,requester_name:state.requesterName||state.requester||'',requester_dept:state.requesterDepartment||'',received_at:state.receivedDate||new Date().toISOString().slice(0,10),problem:a[0]||'',who:d.performer||a[1]||'',frequency:d.countPerMonth??f.countPerMonth??'',minutes:d.asIsMinutes??f.asIsMinutes??'',people:d.people??f.people??'',as_is:d.currentProcess||'',systems:a[2]||'',risk:d.failureImpact||a[3]||'',when:a[4]||state.requestedDate||'',why_urgent:d.timingReason||''},
  ...(ard?{ard_form:ard}:{}),
  ...(Object.keys(f).length?{fea_form:{summary:f.summary||'',alt_process:f.alternatives?.[0]||'',alt_system:f.alternatives?.[1]||'',alt_macro:f.alternatives?.[2]||'',alt_llm:f.alternatives?.[3]||'',alt_conclusion:f.conclusion||'',roi_saving:f.expectedEffect||'',autonomy:f.autonomy||'',write_exec:f.writeExec,sensitive:f.sensitive,identifying:f.businessIdentity,damage_financial:f.damageFinancial,scope:{PERSONAL:'개인',TEAM:'팀',DEPT:'부서',MULTI_DEPT:'3개부서이상',COMPANY:'전사'}[f.scope]||f.scope||'',damage_desc:f.maximumDamage||''}}:{})};
}
export function allowedNativePath(path,method,code,document){
 if(!Object.hasOwn(steps,document)||!isProjectCode(code))return false;
 if(method==='GET')return ['/portal/access','/portal/history','/api/bootstrap','/api/projects','/api/audit',`/api/projects/${code}`,`/api/projects/${code}?state=1`].includes(path)||/^\/portal\/version\/\d+$/.test(path)||new RegExp(`^/api/export/${code}/${document}\\?fmt=(md|doc)$`).test(path);
 if(method==='PUT')return path===`/api/projects/${code}`;
 if(method!=='POST')return false;
 return ['/portal/verify-complete','/portal/complete','/api/scan','/api/rules/preview'].includes(path)||path.startsWith({INT:'/api/intake/',FEA:'/api/fea/',ARD:'/api/ard/'}[document])&&/\/(message|verify|finalize|draft|judge|generate)$/.test(path);
}
async function context(client,identity,code,document,write,summary=false){
 const access=await documentAccess(client,identity,code);
 if(!access)throw fail(403,'이 과제에 접근할 권한이 없습니다.');
 const row=(await client.query('select raw_answers from agent_portal.intake_requests where project_id=$1',[access.project.id])).rows[0];
 const state=row?.raw_answers?.portalState||{};
 const actor=access.actor;
 const member=(await client.query("select 1 from agent_portal.project_members where project_id=$1 and user_id=$2 and relationship='developer' and ended_at is null",[access.project.id,actor.id])).rowCount>0;
 const policy=nativeDocumentPolicy(actor,access.project,state,member,document);
 if(!summary&&(!policy.canReadStage||write&&!policy.canEdit))throw fail(403,'이 문서는 팀장·Admin만 조회·작성할 수 있습니다. 완료 문서는 보완 요청 전까지 변경할 수 없습니다.');
 return {...access,state,...policy};
}
export function nativeDocumentPolicy(actor,project,state,member,document){
 const related=[project.requester_id,project.owner_id].some(id=>id!=null&&String(id)===String(actor.id));
 const importing=state.historicalImport&&!state.historicalImportFinalizedAt;
 const full=document==='INT'||canManageAssessment(actor.app_role);
 const authorized=document==='INT'?(actor.app_role==='admin'||(importing?member:related||member)):canManageAssessment(actor.app_role);
 const step=Number(state.journeyStep||0),target=steps[document];
 const backfill=canBackfillDocument(state,target);
 const rework=document==='ARD'&&step===4&&Object.values(state.workflowApprovals?.G2||{}).some(v=>v.decision==='REWORK')||document==='FEA'&&step===2&&state.g1Resolution?.decision==='DROP';
 const complete=state.nativeAgentArtifacts?.[document]?.status==='complete';
 return {canReadStage:full&&target<=step,canEdit:full&&target<=step&&authorized&&(!complete||rework)&&(backfill||rework||step===target),rework,backfill,complete};
}

// Every operation is awaited and revision checked. Failed validation or document
// generation cannot mark a stage complete; gate approval remains separate.
export async function verifyAndComplete(document,data,revision,call){
 const prefix={INT:'/api/intake',FEA:'/api/fea',ARD:'/api/ard'}[document];
 const verified=await call(prefix+'/verify',data,revision);
 if(verified.status>=400||!verified.body?.done||verified.body.blocked||verified.body.llm_error)return verified;
 const generated=await call(prefix+(document==='INT'?'/finalize':'/generate'),{project_no:data.project_no},verified.revision);
 if(generated.status>=400)return generated;
 const complete=await call('/portal/complete',{},generated.revision);
 if(complete.status>=400)return complete;
 return {...complete,body:{...verified.body,portalCompleted:true,projectCode:complete.body?.projectCode},canEdit:false};
}
export async function nativeAgentRequest(identity,code,document,path,method,data={},revision,dependencies={}){
 if(!allowedNativePath(path,method,code,document))throw fail(400,'허용되지 않은 Agent 작업입니다.');
 const write=method!=='GET'&&!['/api/scan','/api/rules/preview'].includes(path);
 const pool=dependencies.pool||getPool(),transact=dependencies.transact||withTransaction,ctx=await context(pool,identity,code,document,write,path==='/portal/access');
 if(path==='/portal/access'){
  const step=Number(ctx.state.journeyStep||0),target=steps[document];
  const body={mode:ctx.canReadStage?'full':canReadRecommendation(ctx.actor.app_role)&&target<=step?'recommendation':'status',status:ctx.complete||step>target?'완료':step===target?'진행 중':'예정',canEdit:ctx.canEdit};
  if(body.mode==='recommendation'){
   const saved=(await pool.query('select payload from agent_portal.native_agent_sessions where project_id=$1',[ctx.project.id])).rows[0]?.payload;
   // Explicit allowlist: no forms, source evidence, chat, or full markdown.
   const snapshot=saved||seedNativeProject(code,ctx.state);
   const calculated=await (dependencies.runAgent||runNativeAgent)({project:snapshot,path:'/api/fea/judge',method:'POST',body:{project_no:code},actor:ctx.actor.display_name});
   if(calculated.status>=400)throw fail(503,'판정 권고를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
   const verdict=calculated.body?.verdict||saved?.verdict;
   body.recommendation=verdict?[verdict.verdict,verdict.headline,...(verdict.conditions||[])].filter(v=>typeof v==='string').join('\n'):saved?.fea_data?.recommendation||null;
   body.track=calculated.body?.judgement?.track?.track||ctx.state.nativeAgentArtifacts?.FEA?.track||null;
   body.autonomy=document==='ARD'?(snapshot.ard_form?.autonomy_level||null):(calculated.body?.judgement?.autonomy?.level||null);
  }
  return {status:200,body,canEdit:ctx.canEdit};
 }
 if(path==='/portal/verify-complete')return verifyAndComplete(document,{...data,project_no:code},revision,(operation,input,rev)=>nativeAgentRequest(identity,code,document,operation,'POST',input,rev,dependencies));
 if(path==='/portal/history')return {status:200,body:{versions:(await pool.query('select id,version_number,original_name,created_at from agent_portal.native_agent_documents where project_id=$1 and document_type=$2 order by version_number desc',[ctx.project.id,document])).rows},canEdit:ctx.canEdit};
 if(path.startsWith('/portal/version/')){
  const row=(await pool.query('select markdown from agent_portal.native_agent_documents where id=$1 and project_id=$2 and document_type=$3',[path.split('/').at(-1),ctx.project.id,document])).rows[0];
  if(!row)throw fail(404,'문서 버전을 찾을 수 없습니다.');
  return {status:200,text:row.markdown,contentType:'text/markdown; charset=utf-8'};
 }
 const stored=(await pool.query('select revision,payload from agent_portal.native_agent_sessions where project_id=$1',[ctx.project.id])).rows[0];
 const rev=stored?.revision||0;
 if(write&&revision!==rev)throw fail(409,'다른 화면에서 문서가 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
 let project=stored?.payload||seedNativeProject(code,ctx.state);
 if(method==='PUT'){
  const keys=document==='INT'?['int_data','int_md']:document==='FEA'?['fea_data','fea_md']:['ard_data','ard_md'];
  if(Object.keys(data).some(key=>!keys.includes(key)&&key!=='project_no'&&key!=='user'))throw fail(400,'다른 단계 데이터는 변경할 수 없습니다.');
 }
 let result;
 if(path==='/portal/complete'){
  const markdown=project[document.toLowerCase()+'_md'];
  if(!markdown?.trim())throw fail(400,'먼저 문서 초안을 생성하고 검토해 주세요.');
  const field={INT:'int_data',FEA:'fea_form',ARD:'ard_form'}[document];
  if(project._portal_generated_from?.[document]!==nativeFormFingerprint(project[field]||{}))throw fail(400,'양식 변경 후 문서를 다시 생성해 주세요.');
  result=await runNativeAgent({project,path,method,body:{document},allowHistoricalIncomplete:ctx.backfill,actor:ctx.actor.display_name});
 }else{
  if(process.env.AZURE_OPENAI_API_KEY)azureConfiguration();
  result=await runNativeAgent({project,path,method,body:data,actor:ctx.actor.display_name});
 }
 if(result.status>=400)return {...result,revision:rev};
 if(!write)return {...result,body:canManageAssessment(ctx.actor.app_role)||path==='/api/bootstrap'?result.body:redactNativeResponse(result.body),revision:rev,canEdit:ctx.canEdit};
 return transact(async client=>{
  await client.query('select id from agent_portal.projects where id=$1 for update',[ctx.project.id]);
  const latest=await context(client,identity,code,document,true);
  await client.query("insert into agent_portal.native_agent_sessions(project_id,payload) values($1,$2::jsonb) on conflict do nothing",[ctx.project.id,JSON.stringify(project)]);
  const lock=(await client.query('select revision from agent_portal.native_agent_sessions where project_id=$1 for update',[ctx.project.id])).rows[0];
  if(lock.revision!==rev)throw fail(409,'문서가 변경되었습니다. 새로고침해 주세요.');
  project=result.project;
  if(/\/(finalize|generate)$/.test(path))project._portal_generated_from={...project._portal_generated_from,[document]:nativeFormFingerprint(project[{INT:'int_data',FEA:'fea_form',ARD:'ard_form'}[document]]||{})};
  const type=document.toLowerCase(),markdown=project[type+'_md'];
  let doc;
  if(markdown){
   const hash=createHash('sha256').update(markdown).digest('hex');
   doc=(await client.query('select id,version_number,content_sha256 from agent_portal.native_agent_documents where project_id=$1 and document_type=$2 order by version_number desc limit 1',[ctx.project.id,document])).rows[0];
   if(doc?.content_sha256!==hash)doc=(await client.query('insert into agent_portal.native_agent_documents(project_id,document_type,version_number,original_name,markdown,content_sha256,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id,version_number,content_sha256',[ctx.project.id,document,(doc?.version_number||0)+1,`${code}-${document}.md`,markdown,hash,ctx.actor.id])).rows[0];
  }
  if(path==='/portal/complete'){
   let state=structuredClone(latest.state);
   if(document==='INT'){
    const assigned=await assignCompletedIntNumber(client,ctx.project.id,code,state,project,ctx.actor.id);
    state=assigned.state;project=assigned.payload;
    result.body={...result.body,projectCode:assigned.code};
    if(project._portal_generated_from)project._portal_generated_from.INT=nativeFormFingerprint(project.int_data||{});
   }
   state.nativeAgentArtifacts={...state.nativeAgentArtifacts,[document]:{id:String(doc.id),version:doc.version_number,status:'complete',at:new Date().toISOString(),authorId:String(ctx.actor.id)}};
   if(document==='INT'){
    const d=project.int_data||{};
    state.intakeAnswers=[d.problem||'',d.who||'',d.systems||'',d.risk||'',d.when||''];
    state.intakeDetails={...state.intakeDetails,performer:d.who||'',currentProcess:d.as_is||'',failureImpact:d.risk||'',countPerMonth:d.frequency??'',asIsMinutes:d.minutes??'',people:d.people??'',timingReason:d.why_urgent||''};
    state.intakeDraftCompleted=true;state.intakeReview={at:new Date().toISOString(),actorId:String(ctx.actor.id),source:'native-agent'};
   }
   if(document==='ARD')state.nativeAgentArtifacts.ARD.autonomy=project.ard_form?.autonomy_level;
   if(document==='FEA'){
    state.feaCompleted=true;state.feaAuthor={id:String(ctx.actor.id),name:ctx.actor.display_name};
    const f=project.fea_form||{},j=project.judgement||{};
    state.feaDraft={...state.feaDraft,summary:f.summary||project.fea_data?.summary||'',track:{상:'HIGH',중:'MEDIUM',하:'LOW'}[j.track?.track]||j.track?.track||'UNKNOWN',autonomy:f.autonomy||state.feaDraft?.autonomy,writeExec:f.write_exec===true||f.write_exec==='true',sensitive:f.sensitive===true||f.sensitive==='true',damageFinancial:f.damage_financial===true||f.damage_financial==='true',scope:{개인:'PERSONAL',팀:'TEAM',부서:'DEPT',다부서:'MULTI_DEPT',전사:'COMPANY'}[f.scope]||'TEAM',alternatives:[f.alt_process,f.alt_system,f.alt_macro,f.alt_llm],maximumDamage:f.damage_desc||'',conclusion:f.alt_conclusion||''};
    state.nativeAgentArtifacts.FEA.track=state.feaDraft.track;
   }
   if(!latest.backfill&&!(document==='INT'&&state.fastTrack?.requested&&state.fastTrack.status!=='REJECTED')){
    state.journeyStep=steps[document]+1;state.status={INT:'타당성 평가 진행 중',FEA:'G1 착수 승인 진행 중',ARD:'G2 개발 착수 승인 진행 중'}[document];
    state.stage={INT:2,FEA:2,ARD:3}[document];state.progress=Math.round(state.journeyStep/9*100);state.nextAction=state.status;
    await client.query('update agent_portal.projects set current_stage_code=$2,project_status=$3,progress_percent=$4,next_action=$5,updated_at=now() where id=$1',[ctx.project.id,{INT:'FEA',FEA:'G1',ARD:'G2'}[document],document==='INT'?'in_progress':'in_review',state.progress,state.nextAction]);
   }
   await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[ctx.project.id,JSON.stringify(state)]);
  }else if(latest.state.nativeAgentArtifacts?.[document]?.status==='complete'||latest.rework){
   const state=structuredClone(latest.state);
   state.nativeAgentArtifacts={...state.nativeAgentArtifacts,[document]:{...state.nativeAgentArtifacts?.[document],status:'draft'}};
   if(document==='INT')delete state.intakeReview;
   if(document==='FEA')state.feaCompleted=false;
   if(latest.rework){
    const gate=document==='ARD'?'G2':'G1';
    state.workflowApprovalHistory=[...(state.workflowApprovalHistory||[]),{gate,approvals:state.workflowApprovals?.[gate]||{},at:new Date().toISOString(),reason:'원본 Agent 보완 작성'}];
    state.workflowApprovals={...state.workflowApprovals,[gate]:{}};
    if(document==='FEA')delete state.g1Resolution;
    state.journeyStep=steps[document];
    await client.query("update agent_portal.projects set current_stage_code=$2,project_status='in_progress',updated_at=now() where id=$1",[ctx.project.id,document]);
   }
   await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[ctx.project.id,JSON.stringify(state)]);
  }
  await client.query('update agent_portal.native_agent_sessions set payload=$2::jsonb,revision=revision+1,updated_by=$3,updated_at=now() where project_id=$1',[ctx.project.id,JSON.stringify(project),ctx.actor.id]);
  await client.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,after_data) values($1,$2,'NATIVE_AGENT','document',$3,$4::jsonb)",[ctx.actor.id,ctx.project.id,`${code}-${document}`,JSON.stringify({operation:path,revision:rev+1,documentVersion:doc?.version_number,events:result.audit?.map(a=>a.event)})]);
  return {...result,body:canManageAssessment(ctx.actor.app_role)?result.body:redactNativeResponse(result.body),revision:rev+1,canEdit:path==='/portal/complete'?false:latest.canEdit};
 });
}
