import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JOURNEY_V31,requiredApprovers,gateGaps,documentComplete,historicalGateComplete} from '../shared/workflow-v31.mjs';
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
test('journey footer does not expose the removed operations handoff button',async()=>{
 const source=await readFile(new URL('../app/workflow-v31.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/>운영 이관/);
 assert.doesNotMatch(source,/>운영대장 등록·배포/);
});
test('historical gates before the immutable import baseline display as complete',()=>{
 const imported={historicalImport:true,historicalBaselineStep:7,historicalResumeStep:7,journeyStep:7};
 assert.equal(historicalGateComplete('G1',imported),true);
 assert.equal(historicalGateComplete('G2',imported),true);
 assert.equal(historicalGateComplete('G3',imported),true);
 assert.equal(historicalGateComplete('G4',imported),false);
 assert.equal(historicalGateComplete('G1',{...imported,historicalImport:false}),false);
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
test('team leader can request documented rework at every regular gate',()=>{
 for(const [gate,step] of [['G2',4],['G3',6],['G4',8]]){
  const s=run(gateState(step),{gateVote:{gate,role:'team_leader',decision:'REWORK',reason:`${gate} 근거 보완`}},leader);
  assert.equal(s.journeyStep,step);
  assert.equal(s.workflowApprovals[gate].team_leader.decision,'REWORK');
  assert.equal(s.workflowApprovals[gate].team_leader.reason,`${gate} 근거 보완`);
 }
});
test('journey keeps rich current, completed Gate and rejection visuals with a rework guide',async()=>{
 const ui=await readFile(new URL('../app/workflow-v31.jsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../app/workflow-v31.css',import.meta.url),'utf8');
 assert.match(ui,/workflow-current-marker/);
 assert.match(ui,/rejected\?<X/);
 assert.match(ui,/done\?<Check/);
 assert.match(ui,/workflow-rework-banner/);
 assert.match(ui,/이관 승인 완료/);
 assert.match(css,/\.workflow-imported-gate/);
 assert.match(css,/\.workflow-current-marker/);
 assert.match(css,/\.workflow-v31-track \.gate\.done span/);
 assert.match(css,/\.workflow-v31-track \.rejected span/);
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
 assert.throws(()=>run(gateState(),{markdownDocuments:{EVD:{phases:{development_evaluation:{version:99}}}}}),/서버/);
 assert.throws(()=>run(gateState(),{journeyStep:9}),/현재 단계/);
 assert.throws(()=>run(gateState(),{historicalDocuments:{9:{}}},developer),/이후/);
});
test('Markdown upload stays draft until the author completes each phase',()=>{
 let design={...gateState(5),deliveryPhase:'design',markdownDocuments:{DES:{phases:{design:{version:2,status:'draft'}}}}};
 assert.throws(()=>run(design,{deliveryPhase:'development'},developer),/완료 버튼/);
 design=run(design,{markdownCompleteAction:{phase:'design'}},developer);
 assert.equal(design.markdownDocuments.DES.phases.design.status,'complete');
 assert.equal(design.markdownDocuments.DES.phases.design.completedVersion,2);
 assert.equal(design.deliveryPhase,'development');

 let development={...design,markdownDocuments:{...design.markdownDocuments,EVD:{phases:{development_evaluation:{version:3,status:'draft'}}}}};
 assert.throws(()=>run(development,{journeyStep:6},developer),/완료 버튼/);
 development=run(development,{markdownCompleteAction:{phase:'development_evaluation'}},developer);
 assert.equal(development.journeyStep,6);
 assert.equal(development.markdownDocuments.EVD.phases.development_evaluation.status,'complete');

 let rollout={...gateState(7),markdownDocuments:{...gateState(7).markdownDocuments,EVD:{phases:{...gateState(7).markdownDocuments.EVD.phases,deployment_rollout:{version:4,status:'draft'}}}}};
 rollout=run(rollout,{markdownCompleteAction:{phase:'deployment_rollout'}},developer);
 assert.equal(rollout.journeyStep,8);
 assert.equal(rollout.markdownDocuments.EVD.phases.deployment_rollout.completedVersion,4);
 assert.throws(()=>run({...gateState(5),deliveryPhase:'design',markdownDocuments:{}},{markdownCompleteAction:{phase:'design'}},developer),/최종 버전/);
});
test('historical registration preserves the split design and development phase only',()=>{
 const design=sanitizeNewWorkflow({historicalImport:true,journeyStep:5,deliveryPhase:'design'});
 const development=sanitizeNewWorkflow({historicalImport:true,journeyStep:5,deliveryPhase:'development'});
 const later=sanitizeNewWorkflow({historicalImport:true,journeyStep:7,deliveryPhase:'design'});
 const newProject=sanitizeNewWorkflow({historicalImport:false,journeyStep:5,deliveryPhase:'development'});
 assert.equal(design.deliveryPhase,'design');
 assert.equal(development.deliveryPhase,'development');
 assert.equal(later.deliveryPhase,'development');
 assert.equal(newProject.deliveryPhase,undefined);
});
test('Fast Track accepts only an explicit external deadline request',()=>{
 assert.throws(()=>sanitizeNewWorkflow({historicalImport:false,fastTrack:{requested:true,externalFactor:'',externalDeadline:'',externalReason:''}}),/Fast Track 필수/);
 const s=sanitizeNewWorkflow({historicalImport:false,journeyStep:1,intakeDraftCompleted:true,fastTrack:{requested:true,externalFactor:'AUDIT',externalDeadline:'2026-10-01',externalReason:'외부 감사 시정 기한'}});
 assert.equal(s.fastTrack.status,'REQUESTED');
 assert.equal(s.journeyStep,0);
 assert.equal(s.status,'Fast Track 자격 판정 대기');
});
test('Fast Track requires leader qualification, complete ARD-Lite and developer assignment before GF',()=>{
 let s=sanitizeNewWorkflow({historicalImport:false,journeyStep:0,developerIds:[],fastTrack:{requested:true,externalFactor:'REGULATION',externalDeadline:'2026-10-01',externalReason:'법규 시행일'}});
 assert.throws(()=>run(s,{fastTrackAction:{type:'qualify',reason:'외부 기한 확인'}},admin),/팀장/);
 s=run(s,{fastTrackAction:{type:'qualify',reason:'시행 공문 확인'}},leader);
 assert.equal(s.fastTrack.status,'QUALIFIED');
 assert.throws(()=>run(s,{fastTrackAction:{type:'approve_gf'}},leader),/ARD-Lite/);
 const ardLite={definition:'품질 담당자가 시행일부터 규정 질의를 확인',outOfScope:'자동 승인 제외',autonomy:'L1 초안 생성',successCriteria:'정확도 90% 이상',prohibitedActions:'근거 없는 승인 금지',emergencyReasonAndDeadline:'법규 시행 2026-10-01'};
 s=run(s,{fastTrackAction:{type:'save_ard_lite',ardLite}},requester);
 assert.throws(()=>run(s,{fastTrackAction:{type:'approve_gf'}},leader),/개발 담당자/);
 s=run(s,{developerIds:['5']},admin);
 s=run(s,{fastTrackAction:{type:'approve_gf'}},leader);
 assert.equal(s.fastTrack.status,'GF_APPROVED');
 assert.equal(s.journeyStep,5);
 assert.equal(s.deliveryPhase,'development');
 assert.ok(s.fastTrack.ownerNotificationDueAt);
 s={...s,journeyStep:7,securityReviewerId:'6',workflowApprovals:{G3:{team_leader:{decision:'APPROVED'},security_reviewer:{decision:'APPROVED'}}}};
 s=run(s,{fastTrackAction:{type:'start_temporary'}},leader);
 assert.equal(s.fastTrack.status,'TEMPORARY');
 assert.ok(s.fastTrack.regularizationDueAt.startsWith('2026-10-07'));
 assert.throws(()=>run(s,{fastTrackAction:{type:'regularization_vote',role:'requester',decision:'APPROVED'}},requester),/정규화 필수/);
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
