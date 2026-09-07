import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNEY_V31,requiredApprovers,gateGaps,documentComplete} from '../shared/workflow-v31.mjs';
import {applyWorkflow,persistWorkflowApprovals,sanitizeNewWorkflow} from '../server/workflow-v31.mjs';
import {standardDocuments} from '../shared/standard-documents.mjs';
const leader={id:3,app_role:'team_leader',is_active:true,display_name:'팀장'};
const admin={id:4,app_role:'admin',is_active:true,display_name:'Admin'};
const requester={id:1,app_role:'general_user',is_active:true,display_name:'요구자'};
const owner={id:2,app_role:'general_user',is_active:true,display_name:'오너'};
const developer={id:5,app_role:'team_member',is_active:true,display_name:'개발자'};
const project={id:10,requester_id:1,owner_id:2};
const run=(s,c,a=leader)=>applyWorkflow(s,c,{...structuredClone(s),...c},a,project,'2026-09-07T00:00:00Z');
function doc(code){
 const fields={};
 for(const s of standardDocuments[code].sections)for(const f of s.fields){
  fields[s.id+'.'+f.id]=f.kind==='select'?f.options[0]:f.kind==='checklist'?f.options.map(()=>true):f.kind==='date'?'2026-09-07':f.kind==='fr-table'?[{ID:'1',기능:'기능','입력 → 에이전트 행동 → 출력':'범위',우선순위:'M'}]:f.kind==='failure-table'?[{실패유형:'실패','실패 유형':'실패',예시:'예',피해:'피해',대응:'조치'}]:'테스트 내용';
 }
 return {status:'complete',fields};
}
const gateState=(step=4)=>({journeyStep:step,workflowTrack:'MEDIUM',developerIds:['5'],historicalDocuments:{3:{documents:{ARD:doc('ARD')}},5:{documents:{EVR:doc('EVR')}}},markdownDocuments:{DES:{phases:{design:{version:1}}},EVD:{phases:{development_evaluation:{version:1},deployment_rollout:{version:2}}}},gateChecks:{G3:{criteriaPassed:true,zeroViolations:true,evidence:'평가 v1 전건 확인'},G4:{criteriaPassed:true,evidence:'사용 20건 오류 0건 만족도 4.5, 종료 조건 충족'}},uatRecord:{completed:true,cases:5,actorId:'1'}});
const vote=(gate,role)=>({gateVote:{gate,role,decision:'APPROVED'}});
test('six stages and every regular gate remain visible in order',()=>{
 assert.equal(JOURNEY_V31.filter(n=>n.number).length,6);
 assert.deepEqual(JOURNEY_V31.filter(n=>n.gate).map(n=>n.gate),['G1','G2','G3','G4']);
 assert.deepEqual(JOURNEY_V31.filter(n=>n.step===5).map(n=>n.phase),['design','development']);
});
test('new registration never accepts fabricated gate approvals, route or UAT',()=>{
 const s=sanitizeNewWorkflow({workflowTrack:'LOW',lowRoute:{enabled:true},workflowApprovals:{G2:{owner:{decision:'APPROVED'}}},uatRecord:{completed:true},g1Resolution:{decision:'GO'},intakeAnswers:['keep']});
 assert.equal(s.workflowApprovals,undefined);assert.equal(s.lowRoute,undefined);assert.equal(s.uatRecord,undefined);assert.equal(s.g1Resolution,undefined);assert.deepEqual(s.intakeAnswers,['keep']);
});
test('G2 requires requester, owner and leader, not developer or admin',()=>{
 let s=gateState();assert.equal(documentComplete(s,3,'ARD'),true);
 assert.throws(()=>run(s,vote('G2','owner'),developer),/담당자/);
 assert.throws(()=>run(s,vote('G2','team_leader'),admin),/담당자/);
 s=run(s,vote('G2','requester'),requester);assert.equal(s.journeyStep,4);
 s=run(s,vote('G2','team_leader'));assert.equal(s.journeyStep,4);
 s=run(s,vote('G2','owner'),owner);assert.equal(s.journeyStep,5);
 assert.throws(()=>run(s,vote('G2','owner'),owner),/현재/);
});
test('same account can occupy two roles but each role requires an explicit vote',()=>{
 const s=gateState(),p={...project,owner_id:1};
 const next=applyWorkflow(s,vote('G2','requester'),{...s},requester,p);
 assert.equal(next.workflowApprovals.G2.owner,undefined);
});
test('G3 requires UAT plus security approval for high track',()=>{
 let s={...gateState(6),workflowTrack:'HIGH',securityReviewerId:'6'};
 assert.deepEqual(requiredApprovers('G3',s),['team_leader','security_reviewer']);
 assert.throws(()=>run({...s,uatRecord:undefined},vote('G3','team_leader')),/UAT/);
 s=run(s,vote('G3','team_leader'));assert.equal(s.journeyStep,6);
 s=run(s,vote('G3','security_reviewer'),{id:6,app_role:'team_member',is_active:true});assert.equal(s.journeyStep,7);
});
test('G4 waits for owner and leader and pilot evidence',()=>{
 let s=gateState(8);
 assert.throws(()=>run({...s,gateChecks:{}},vote('G4','team_leader')),/파일럿/);
 s=run(s,vote('G4','owner'),owner);assert.equal(s.journeyStep,8);
 s=run(s,vote('G4','team_leader'));assert.equal(s.journeyStep,9);
});
test('a rework vote blocks transition until that role approves again',()=>{
 let s=run(gateState(),{gateVote:{gate:'G2',role:'owner',decision:'REWORK',reason:'범위 보완'}},owner);
 s=run(s,vote('G2','requester'),requester);s=run(s,vote('G2','team_leader'));assert.equal(s.journeyStep,4);
 s=run(s,vote('G2','owner'),owner);assert.equal(s.journeyStep,5);
});
test('basis edits reset current votes and retain history',()=>{
 let s=run(gateState(),vote('G2','requester'),requester);
 const docs=structuredClone(s.historicalDocuments);docs[3].documents.ARD.fields['overview.name']='변경';
 s=run(s,{historicalDocuments:docs},developer);
 assert.deepEqual(s.workflowApprovals.G2,{});
 assert.equal(s.workflowApprovalHistory[0].approvals.requester.actorId,'1');
});
test('no direct gate jump or fabricated approval; no future documents',()=>{
 assert.throws(()=>run(gateState(),{journeyStep:5}),/전원/);
 assert.throws(()=>run(gateState(),{workflowApprovals:{G2:{}}}),/서버/);
 assert.throws(()=>run(gateState(),{journeyStep:9}),/현재 단계/);
 assert.throws(()=>run(gateState(),{historicalDocuments:{9:{}}},developer),/이후/);
});
test('only requester records positive UAT count and evidence',()=>{
 assert.throws(()=>run(gateState(5),{uatConfirm:{cases:5,evidence:'확인'}},admin),/요구자/);
 assert.throws(()=>run(gateState(5),{uatConfirm:{cases:0,evidence:'확인'}},requester),/건수/);
 assert.equal(run(gateState(5),{uatConfirm:{cases:5,evidence:'실제 사례 확인'}},requester).uatRecord.actorId,'1');
});

test('partial development document edits do not falsely modify signed ARD',()=>{
 const s=gateState(5);
 const changed=structuredClone(s.historicalDocuments[5]);changed.documents.EVR.fields['summary.result']='새 결과';
 assert.doesNotThrow(()=>run(s,{historicalDocuments:{5:changed}},developer));
});
test('G1 low track assignment enters registration, never invents skipped approvals',()=>{
 const s={journeyStep:2,workflowTrack:'LOW',g1Resolution:{decision:'GO'},developerIds:[]};
 const n=run(s,{developerIds:['5']},admin);
 assert.equal(n.journeyStep,9);assert.equal(n.lowRoute.phase,'registration');
 assert.equal(n.workflowApprovals.G2,undefined);assert.equal(n.workflowApprovals.G3,undefined);assert.equal(n.workflowApprovals.G4,undefined);
 assert.throws(()=>run(n,{lowRouteAction:'deploy'},admin),/운영대장/);
 const registered=applyWorkflow(n,{lowRouteAction:'register'},{...n},admin,{...project,registrationKnowledgeOwner:'지식담당'});
 assert.equal(registered.historicalDocuments[9].schemaVersion,2);
 assert.equal(run(registered,{lowRouteAction:'deploy'},admin).lowRoute.phase,'operating');
});
test('unconfirmed classification is never treated as low; admin assignment does not approve G1',()=>{
 const s={journeyStep:2,developerIds:[]};
 const n=run(s,{developerIds:['5']},admin);assert.equal(n.journeyStep,2);assert.equal(n.lowRoute,undefined);
 assert.throws(()=>run(s,{g1Resolution:{decision:'GO'}},admin),/팀장/);
});
test('FEA changes before assignment invalidate prior G1 so low track cannot bypass new risks',()=>{
 const s={journeyStep:2,workflowTrack:'LOW',g1Resolution:{decision:'GO'},developerIds:[],feaDraft:{scope:'TEAM',autonomy:'L0',writeExec:false,sensitive:false,damageFinancial:false}};
 const n=run(s,{feaDraft:{...s.feaDraft,writeExec:true}},admin);
 assert.equal(n.g1Resolution,undefined);assert.equal(n.workflowTrack,undefined);
 const assigned=run(n,{developerIds:['5']},admin);assert.equal(assigned.journeyStep,2);assert.equal(assigned.lowRoute,undefined);
});
test('historical import stays put while open, resumes strict gate checks after finalization',()=>{
 const s={...gateState(),historicalImport:true};
 assert.throws(()=>run(s,vote('G2','team_leader')),/이관 완료/);
 assert.equal(run(s,{name:'보완'},admin).journeyStep,4);
 assert.throws(()=>run({...s,historicalImportFinalizedAt:'2026-09-07'},{journeyStep:5}),/전원/);
});
test('normalized approval persistence writes identified roles with exact completion status',async()=>{
 let s=gateState();s=run(s,vote('G2','requester'),requester);s=run(s,vote('G2','owner'),owner);
 const n=run(s,vote('G2','team_leader'));
 const calls=[],client={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:10}]};}};
 await persistWorkflowApprovals(client,project,n,s,leader);
 const writes=calls.filter(c=>c.sql.startsWith('insert into agent_portal.gate_approvals'));
 assert.deepEqual(writes.map(c=>c.params[2]).sort(),['owner','requester','team_leader']);
 assert.ok(calls.some(c=>c.sql.startsWith('update agent_portal.gates set')&&c.params[1]==='approved'));
});
