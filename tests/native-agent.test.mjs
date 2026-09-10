import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedNativePath,seedNativeProject,nativeFormFingerprint,nativeDocumentPolicy} from '../server/native-agent.mjs';
import {runNativeAgent} from '../server/native-agent-runtime.mjs';
import {gateGaps,requiredApprovers,projectTrack} from '../shared/workflow-v31.mjs';
test('generated form fingerprint survives PostgreSQL JSONB key ordering',()=>{
 assert.equal(nativeFormFingerprint({z:1,a:{y:2,x:3}}),nativeFormFingerprint({a:{x:3,y:2},z:1}));
 assert.notEqual(nativeFormFingerprint({a:1}),nativeFormFingerprint({a:2}));
});
test('INT/FEA/ARD author roles and historical boundary retain portal permissions',()=>{
 const project={requester_id:1,owner_id:2};
 const requester={id:1,app_role:'general_user'},owner={id:2,app_role:'general_user'},developer={id:3,app_role:'team_member'},leader={id:4,app_role:'team_leader'},admin={id:5,app_role:'admin'};
 for(const [document,journeyStep] of [['INT',0],['FEA',1],['ARD',3]]){
  const state={journeyStep};
  for(const actor of [requester,owner,admin])assert.equal(nativeDocumentPolicy(actor,project,state,false,document).canEdit,true);
  assert.equal(nativeDocumentPolicy(developer,project,state,true,document).canEdit,true);
  for(const actor of [developer,leader,{id:8,app_role:'general_user'}])assert.equal(nativeDocumentPolicy(actor,project,state,false,document).canEdit,false);
  const importing={...state,historicalImport:true,historicalBaselineStep:journeyStep};
  assert.equal(nativeDocumentPolicy(requester,project,importing,false,document).canEdit,false);
  assert.equal(nativeDocumentPolicy(developer,project,importing,true,document).canEdit,true);
  const finalized={...importing,historicalImportFinalizedAt:'2026-09-10',historicalCompletedThrough:{step:journeyStep},journeyStep:journeyStep+1};
  assert.equal(nativeDocumentPolicy(requester,project,finalized,false,document).canEdit,true);
  assert.equal(nativeDocumentPolicy(requester,project,finalized,false,document).backfill,true);
 }
 assert.equal(nativeDocumentPolicy(admin,project,{journeyStep:0},false,'ARD').canEdit,false);
});
test('native adapter restricts project, document and administrative routes',()=>{
 assert.equal(allowedNativePath('/api/fea/draft','POST','2026-033','FEA'),true);
 assert.equal(allowedNativePath('/api/ard/draft','POST','2026-033','FEA'),false);
 assert.equal(allowedNativePath('/api/projects/2026-044','GET','2026-033','INT'),false);
 for(const p of ['/api/settings','/api/projects','/api/projects/2026-033/restore'])assert.equal(allowedNativePath(p,'POST','2026-033','INT'),false);
 assert.equal(allowedNativePath('/api/projects/2026-033','DELETE','2026-033','INT'),false);
 assert.equal(allowedNativePath('/api/export/2026-033/INT?fmt=md','GET','2026-033','INT'),true);
});
test('legacy INT values seed original engine fields without losing quantitative values',()=>{
 const p=seedNativeProject('2026-033',{name:'Example',intakeAnswers:['meeting','','Outlook','','2026-10-10'],intakeDetails:{currentProcess:'manual',failureImpact:'delay',performer:'team',countPerMonth:0}});
 assert.equal(p.int_data.as_is,'manual');assert.equal(p.int_data.risk,'delay');assert.equal(p.project_no,'2026-033');
 assert.equal(p.int_data.frequency,0);
});
test('native documents satisfy document readiness but do not impersonate approvers',()=>{
 const state={feaCompleted:true,nativeAgentArtifacts:{INT:{status:'complete',version:1},FEA:{status:'complete',version:1,track:'MEDIUM'},ARD:{status:'complete',version:1,autonomy:'L2'}}};
 assert.deepEqual(gateGaps('G1',state),[]);assert.deepEqual(gateGaps('G2',state),[]);
 assert.deepEqual(requiredApprovers('G2',state),['requester','owner','team_leader']);
 assert.equal(projectTrack(state),'HIGH');
});
test('original Python engine bootstrap, INT generation, FEA and ARD retain source functionality',{skip:!process.env.PORTAL_AGENT_PYTHON},async()=>{
 let project={project_no:'2099-001',agent_name:'Integration test',history:[],int_data:{project_no:'2099-001',requester_name:'Test',requester_dept:'QA',problem:'회의실 예약 가능 시간을 여러 일정표에서 대조합니다.',who:'팀 일정 담당자',as_is:'일정표를 열어 빈 시간을 확인합니다.',risk:'일정이 중복되어 회의가 지연됩니다.',when:'다음 달',frequency:'20',minutes:'10',people:'1'}};
 const env={...process.env,AZURE_OPENAI_API_KEY:'',AZURE_OPENAI_ENDPOINT:'',AZURE_OPENAI_DEPLOYMENT:''};
 const call=async(path,body={})=>{const r=await runNativeAgent({project,path,body,method:path==='/api/bootstrap'?'GET':'POST',actor:'Test'}, {env});assert.equal(r.status,200,JSON.stringify(r.body));project=r.project;return r.body;};
 const b=await call('/api/bootstrap');assert.equal(b.form.length,5);assert.equal(b.fea_form.length,6);assert.equal(b.ard_form.length,7);
 const int=await call('/api/intake/finalize');assert.match(int.markdown,/2099-001-INT/);
 const fea=await call('/api/fea/draft');assert.ok(fea.form);assert.ok(project.fea_form);
 await call('/api/fea/generate',{form:{...project.fea_form,summary:'회의실 일정 확인 자동화',alt_process:'규정 변경만으로 일정 대조를 해결할 수 없습니다.',alt_system:'기존 시스템에는 통합 조회가 없습니다.',alt_macro:'여러 일정 시스템을 연결해야 합니다.',alt_llm:'실시간 일정 조회가 필요합니다.',alt_conclusion:'일정 통합 조회가 필요합니다.',roi_saving:'일정 조회 시간 단축',write_exec:false,sensitive:false,scope:'팀',damage_financial:false,autonomy:'L1',needs_judgment:true,has_rule_flow:true,damage_desc:'회의 일정 지연'}});
 const ard=await call('/api/ard/draft');assert.ok(ard.form);assert.ok(project.ard_form);
 const doc=await call('/api/ard/generate');assert.match(doc.markdown,/2099-001-ARD/);
});
