import test from 'node:test';
import assert from 'node:assert/strict';
import {canCompleteOwnFea,reconcileManualAgentFields} from '../server/fea-review-policy.mjs';
import {missingFields,applyProposals} from '../shared/intake-agent.mjs';
const actor={id:7,is_active:true,app_role:'general_user'};
const project={requester_id:7,owner_id:8,current_stage_code:'FEA'};
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
