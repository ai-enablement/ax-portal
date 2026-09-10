import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeAgentRequest,allowedNativePath} from '../server/native-agent.mjs';
import {redactAssessmentContent,redactNativeResponse,assessmentWriteRequested} from '../shared/document-role-policy.mjs';
import {buildCumulativeMarkdown} from '../server/markdown-documents.mjs';

function fixture(role,step){
 const state={journeyStep:step,feaDraft:{summary:'PRIVATE'},historicalDocuments:{3:{documents:{ARD:{fields:{secret:'PRIVATE'}}}}}};
 const pool={query:async sql=>{
  if(sql.includes('from agent_portal.projects'))return {rows:[{id:1,requester_id:1,owner_id:2,current_stage_code:step===1?'FEA':'ARD'}]};
  if(sql.includes('from agent_portal.users'))return {rows:[{id:1,app_role:role,display_name:'Role test'}]};
  if(sql.includes('from agent_portal.project_members'))return {rows:[{user_id:1,relationship:'developer'}],rowCount:1};
  if(sql.includes('from agent_portal.intake_requests'))return {rows:[{raw_answers:{portalState:state}}]};
  if(sql.includes('native_agent_sessions'))return {rows:[{payload:{fea_form:{secret:'PRIVATE'},fea_md:'PRIVATE',verdict:{verdict:'Conditional Go',headline:'권고',conditions:['사람 검토 필요'],secret:'PRIVATE'},judgement:{track:{track:'중'},autonomy:{level:'L1'}}}}]};
  if(sql.includes('native_agent_documents'))return {rows:[]};
  throw new Error('Unexpected query: '+sql);
 }};
 return {pool,runAgent:async()=>({status:200,body:{verdict:{verdict:'Conditional Go',headline:'권고',conditions:['사람 검토 필요'],secret:'PRIVATE'}}})};
}
test('server FEA/ARD access matrix, membership never overrides restricted content',async()=>{
 for(const [doc,step] of [['FEA',1],['ARD',3]])for(const role of ['admin','team_leader','team_member','bts','bp_solution','general_user']){
  const deps=fixture(role,step),identity={email:'role@example.com'};
  const access=await nativeAgentRequest(identity,'2026-043',doc,'/portal/access','GET',{},0,deps);
  const full=['admin','team_leader'].includes(role);
  assert.equal(access.body.mode,full?'full':role==='general_user'?'status':'recommendation');
  assert.doesNotMatch(JSON.stringify(access.body),/PRIVATE/);
  assert.equal(access.body.status,'진행 중');
  if(full)assert.equal((await nativeAgentRequest(identity,'2026-043',doc,'/portal/history','GET',{},0,deps)).status,200);
  else for(const [path,method] of [['/api/bootstrap','GET'],['/portal/history','GET'],['/portal/version/1','GET'],['/portal/verify-complete','POST'],[`/api/export/2026-043/${doc}?fmt=md`,'GET']])await assert.rejects(nativeAgentRequest(identity,'2026-043',doc,path,method,{},0,deps),e=>e.status===403);
 }
});
test('INT cannot export another document, and project responses strip restricted documents and chats',()=>{
 assert.equal(allowedNativePath('/api/export/2026-043/FEA?fmt=md','GET','2026-043','INT'),false);
 const raw={int_data:{problem:'Allowed'},fea_form:{secret:'PRIVATE'},ard_md:'PRIVATE',judgement:{secret:'PRIVATE'},verdict:{secret:'PRIVATE'},history:[{value:'PRIVATE'}]};
 assert.doesNotMatch(JSON.stringify(redactNativeResponse({project:raw,projects:[raw]})),/PRIVATE/);
 const portal={feaDraft:{secret:'PRIVATE'},ardLite:{secret:'PRIVATE'},intakeMessages:[{text:'PRIVATE'}],agentSession:{secret:'PRIVATE'},historicalDocuments:{1:{secret:'PRIVATE'},3:{secret:'PRIVATE'}},journeyStep:3};
 assert.doesNotMatch(JSON.stringify(redactAssessmentContent(portal,'general_user')),/PRIVATE/);
 assert.equal(redactAssessmentContent(portal,'admin'),portal);
 for(const changes of [{feaCompleted:true},{feaDraft:{}},{historicalDocuments:{3:{fields:{}}}},{fastTrackAction:{type:'complete_ard_lite'}}])assert.equal(assessmentWriteRequested(changes),true);
 assert.equal(assessmentWriteRequested({gateVote:{gate:'G2'}}),false);
});
test('cumulative downloads omit restricted FEA and ARD originals for non-author roles',()=>{
 const state={feaDraft:{summary:'PRIVATE-FEA'},historicalDocuments:{3:{documents:{ARD:{fields:{'overview.oneLine':'PRIVATE-ARD'}}}}}};
 const text=buildCumulativeMarkdown({project_name:'Test',project_code:'2026-043'},state,'design',[],[],false);
 assert.doesNotMatch(text,/PRIVATE/);assert.match(text,/접근 제한/);
});
