import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {acceptModelTurn,progress} from '../shared/intake-agent.mjs';
import {completeIntakeReview,handleAgentRequest} from '../server/intake-agent.mjs';
import {applyWorkflow} from '../server/workflow-v31.mjs';
const int=()=>({journeyStep:0,intakeAnswers:['문서 수작업 확인','','','',''],intakeDetails:{performer:'품질 담당',countPerMonth:'20',asIsMinutes:'30',people:'2',failureImpact:'재작업 발생'},agentSession:{request:{status:'complete'},proposals:[],confirmed:{}}});

test('Fast Track INT review unlocks requirements without entering FEA or approving gates',()=>{
 for(const status of ['REQUESTED','QUALIFIED']){
  const result=completeIntakeReview({...int(),fastTrack:{requested:true,status}},{id:7,display_name:'요구자'});
  assert.equal(result.journeyStep,0);
  assert.ok(result.intakeReview.at);
  assert.equal(result.fastTrack.status,status);
  assert.equal(result.workflowApprovals,undefined);
  assert.equal(result.feaCompleted,undefined);
 }
});
test('direct INT review creates a session and persists FEA transition without an AI call',async()=>{
 const state={...int(),intakeStandardVersion:'3.0'};delete state.agentSession;
 let stored,stage='INT';
 const client={query:async(sql,params)=>{
  if(sql.startsWith('select id,app_role'))return {rows:[{id:7,app_role:'admin',is_active:true,display_name:'실제 작성자'}]};
  if(sql.startsWith('select p.*'))return {rows:[{id:1,project_code:'2026-999',project_name:'검증 과제',current_stage_code:stage,state:stored||state}]};
  if(sql.startsWith('select agent_portal.change_project_stage'))stage='FEA';
  if(sql.startsWith('update agent_portal.intake_requests set raw_answers='))stored=JSON.parse(params[1]);
  if(sql.startsWith('select id,current_version'))return {rows:[{id:12,current_version:1}]};
  if(sql.startsWith('select id from agent_portal.intake_conversations'))return {rows:[{id:13}]};
  return {rows:[],rowCount:0};
 }};
 const args={identity:{email:'test@example.invalid'},code:'2026-999',pool:client,transaction:fn=>fn(client),generate:async()=>{assert.fail('INT review must not invoke Azure');}};
 const result=await handleAgentRequest({...args,method:'POST',body:{action:'review_intake',keys:[],revision:0}});
 assert.equal(stage,'FEA');assert.equal(result.project.journeyStep,1);assert.equal(result.progress.phase,'FEA');
 assert.equal(stored.agentSession.revision,1);assert.deepEqual(stored.agentSession.proposals,[]);assert.equal(stored.intakeReview.actorName,'실제 작성자');
 assert.deepEqual((await handleAgentRequest({...args,method:'GET'})).project,stored);
 assert.equal(state.agentSession,undefined);
});
test('INT review is required before FEA, never depends on FEA completeness',()=>{
 const s=int();assert.equal(progress(s).phase,'INT');assert.equal(progress(s).ready,true);
 const n=completeIntakeReview(s,{id:7,display_name:'실제 요구자'});assert.equal(n.journeyStep,1);assert.equal(n.intakeReview.actorName,'실제 요구자');assert.equal(n.feaCompleted,undefined);assert.equal(n.g1Resolution,undefined);
 assert.equal(progress(n).phase,'FEA');
 assert.throws(()=>completeIntakeReview({...s,intakeDetails:{}},{id:7}),/필수/);
 assert.doesNotThrow(()=>completeIntakeReview({...s,agentSession:{proposals:[]}},{id:7,display_name:'실제 요구자'}));
 assert.throws(()=>completeIntakeReview({...s,agentSession:{request:{status:'complete'},proposals:[{key:'int.0'}]}},{id:7}),/대기/);
});
test('INT model output cannot fill FEA; FEA summary auto fills once and preserves manual edits',()=>{
 const result={reply:'확인한 내용의 요약입니다.',target:'fea.summary',question:'요약을 작성해 주세요.',proposals:[{key:'fea.summary',value:'문서 확인을 자동 보조합니다.',kind:'suggested',evidence:'문서 수작업 확인'}]};
 assert.equal(acceptModelTurn(int(),result,'문서 수작업 확인').state.feaDraft,undefined);
 const s={...int(),journeyStep:1};const n=acceptModelTurn(s,result,'문서 수작업 확인');
 assert.equal(n.state.feaDraft.summary,result.proposals[0].value);assert.ok(n.state.agentSession.generatedSummary);assert.ok(!n.reply.includes('요약을 작성해 주세요.'));
 const edited={...s,feaDraft:{summary:'담당자가 직접 보완한 요약'}};assert.equal(acceptModelTurn(edited,result,'문서 수작업 확인').state.feaDraft.summary,edited.feaDraft.summary);
});
test('server blocks premature FEA, future ARD, forged author and intake review',()=>{
 const s=int(),actor={id:7,app_role:'admin'};
 for(const c of [{feaDraft:{summary:'미리 작성'}},{journeyStep:1},{historicalDocuments:{3:{}}},{feaAuthor:{name:'가짜'}},{intakeReview:{actorId:7}}])assert.throws(()=>applyWorkflow(s,c,{...s,...c},actor,{id:1}));
});
test('operational views do not use mock stage calculation, synthetic project fallback or optimistic completion',async()=>{
 const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('current.source === "database" || current.historicalImport ? current.journeyStep'));
 assert.ok(source.includes('const homeProjectItems = baseProjectItems'));
 assert.ok(!source.includes('project.no === projectNo ? { ...project, ...changes } : project'));
 const ui=await readFile(new URL('../app/workflow-v31.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes('project.feaAuthor?.name'));assert.ok(ui.includes('project.developerNames.join'));
});
