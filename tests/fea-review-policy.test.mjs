import test from 'node:test';
import assert from 'node:assert/strict';
import {canCompleteOwnFea,canSaveResumedFea,canSaveResumedIntake,reconcileManualAgentFields} from '../server/fea-review-policy.mjs';
import {canWriteResumedFea} from '../shared/fea-assignment.mjs';
import {applyWorkflow} from '../server/workflow-v31.mjs';
import {missingFields,applyProposals} from '../shared/intake-agent.mjs';
const actor={id:7,is_active:true,app_role:'general_user'};
const project={requester_id:7,owner_id:8,current_stage_code:'FEA'};

test('resumed INT supplementation belongs to requester, not importing admin or Owner',()=>{
 const s={historicalImport:true,historicalImportFinalizedAt:'2026-09-09',journeyStep:1,createdByUserId:'99'};
 const changes={intakeAnswers:['업무'],intakeDetails:{},intakeStandardVersion:'3.0',requestedDate:'2026-10-01'};
 assert.equal(canSaveResumedIntake(actor,project,s,changes),true);
 for(const id of [8,9,99])assert.equal(canSaveResumedIntake({...actor,id},project,s,changes),false);
 for(const extra of [{historicalContactUpdate:{}},{ownerId:'7'},{developerIds:['7']},{journeyStep:2},{gateVote:{}},{intakeDraftCompleted:false}])assert.equal(canSaveResumedIntake(actor,project,s,{...changes,...extra}),false);
 assert.equal(canSaveResumedIntake(actor,{...project,current_stage_code:'G2'},{...s,journeyStep:4},changes),false);
 assert.equal(canSaveResumedIntake(actor,project,{...s,historicalImportFinalizedAt:null},changes),false);
});

test('resumed G1 Drop lets requester revise FEA without granting approval or skipping G1',()=>{
 const s={historicalImport:true,historicalImportFinalizedAt:'2026-09-09',journeyStep:2,feaCompleted:true,g1Resolution:{decision:'DROP',reason:'보완'},workflowApprovals:{G1:{team_leader:{decision:'REJECTED'}}}};
 const changes={feaDraft:{summary:'보완 후'},feaCompleted:true};
 assert.equal(canSaveResumedFea(actor,{...project,current_stage_code:'G1'},s,changes),true);
 const result=applyWorkflow(s,changes,{...s,...changes},actor,project);
 assert.equal(result.journeyStep,2);
 assert.equal(result.g1Resolution,undefined);
 assert.deepEqual(result.workflowApprovals.G1,{});
 assert.equal(result.workflowApprovalHistory.length,1);
 const draft=applyWorkflow(s,{feaDraft:{summary:'임시 보완'}},{...s,feaDraft:{summary:'임시 보완'},feaCompleted:false},actor,project);
 assert.equal(draft.journeyStep,2);
 assert.equal(draft.feaCompleted,false);
 assert.equal(canSaveResumedFea(actor,{...project,current_stage_code:'G1'},draft,{feaDraft:{summary:'추가 보완'}}),true);
 assert.equal(canSaveResumedFea(actor,{...project,current_stage_code:'G1'},draft,{feaCompleted:true}),true);
});

test('historical importer is not an assignment: actual requester can save and submit only current FEA',()=>{
 const state={historicalImport:true,historicalImportFinalizedAt:'2026-09-08',journeyStep:1,workflowVersion:'3.1',feaAuthor:{id:'99',name:'Importer'},developerIds:['9']};
 assert.equal(canWriteResumedFea({...state,requesterId:'7'},actor),true);
 for(const changes of [{feaDraft:{summary:'수정'}},{feaDraft:{summary:'수정'},feaCompleted:true}])assert.equal(canSaveResumedFea(actor,project,state,changes),true);
 for(const id of [8,9,99])assert.equal(canSaveResumedFea({...actor,id},project,state,{feaDraft:{}}),false);
 for(const changes of [{journeyStep:2,feaCompleted:true},{historicalDocuments:{'3':{}}},{finalizeHistoricalImport:true},{feaCompleted:false}])assert.equal(canSaveResumedFea(actor,project,state,changes),false);
 for(const patch of [{journeyStep:0},{journeyStep:2},{journeyStep:3},{feaCompleted:true},{historicalImportFinalizedAt:null}])assert.equal(canSaveResumedFea(actor,project,{...state,...patch},{feaDraft:{}}),false);
 assert.equal(canSaveResumedFea({...actor,is_active:false},project,state,{feaDraft:{}}),false);
 const result=applyWorkflow(state,{feaDraft:{summary:'완료'},feaCompleted:true},{...state,feaCompleted:true,journeyStep:2},actor,project);
 assert.equal(result.journeyStep,2);
 assert.equal(result.g1Resolution,undefined);
});
test('only requester or owner can complete their active regular FEA',()=>{
 const state={journeyStep:1},changes={feaCompleted:true};
 assert.equal(canCompleteOwnFea(actor,project,state,changes),true);
 assert.equal(canCompleteOwnFea({...actor,id:8},project,state,changes),true);
 for(const id of [9,10])assert.equal(canCompleteOwnFea({...actor,id},project,state,changes),false);
 for(const s of [{journeyStep:0},{journeyStep:2},{...state,historicalImport:true},{...state,feaCompleted:true}])assert.equal(canCompleteOwnFea(actor,project,s,changes),false);
 assert.equal(canCompleteOwnFea({...actor,is_active:false},project,state,changes),false);
 assert.equal(canCompleteOwnFea(actor,project,state,{feaCompleted:false}),false);
});
test('manual save retires changed proposals and preserves untouched pending items and evidence',()=>{
 const state={journeyStep:1,feaDraft:{summary:'사람이 수정한 요약',conclusion:'기존 결론'},agentSession:{revision:3,proposals:[{key:'fea.summary',baseValue:'기존 요약',value:'AI 요약',evidence:'원문'},{key:'fea.conclusion',baseValue:'기존 결론',value:'AI 결론'}]}};
 reconcileManualAgentFields(state,{feaDraft:state.feaDraft},actor);
 assert.equal(state.agentSession.revision,4);assert.equal(state.agentSession.proposals.length,1);
 assert.equal(state.agentSession.proposals[0].key,'fea.conclusion');
 assert.equal(state.agentSession.proposalHistory[0].evidence,'원문');
 assert.equal(state.agentSession.confirmed['fea.summary'].value,'사람이 수정한 요약');
 assert.equal(applyProposals(state,['fea.summary'],7).state.feaDraft.summary,'사람이 수정한 요약');
});
test('clearing a pending field resolves the obsolete proposal but leaves the required field incomplete',()=>{
 const state={journeyStep:1,feaDraft:{summary:''},agentSession:{proposals:[{key:'fea.summary',baseValue:'기존 요약',value:'AI 요약'}]}};
 reconcileManualAgentFields(state,{feaDraft:{summary:''}},actor);
 assert.equal(state.agentSession.proposals.length,0);
 assert.ok(missingFields(state,'fea.').some(f=>f.key==='fea.summary'));
});
