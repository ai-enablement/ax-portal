import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {AGENT_FIELDS,FIELD_MAP,validField,fieldValue,missingFields,interviewMissingFields,progress,safeMessage,applyProposals,autoApplyIntakeExtractions,acceptModelTurn,deterministicSummary,setField} from '../shared/intake-agent.mjs';
import {azureConfiguration,generateTurn,assertAgentAccess,AgentError} from '../server/intake-agent.mjs';
import {canUseResumedFeaAgent} from '../shared/fea-assignment.mjs';
const configured={AZURE_OPENAI_ENDPOINT:'https://test.openai.azure.com/',AZURE_OPENAI_API_KEY:'test-only',AZURE_OPENAI_DEPLOYMENT:'test-deployment'};
const blank=()=>({journeyStep:1,name:'테스트 과제',intakeAnswers:['','','','',''],agentSession:{revision:1,confirmed:{},proposals:[],held:[],attempts:{}}});

test('finalized historical FEA reuses the agent for actual requester, assigned developer and admin only',()=>{
 const project={requester_id:'1',owner_id:'2',current_stage_code:'FEA'};
 const state={...blank(),historicalImport:true,historicalImportFinalizedAt:'2026-09-09',intakeDraftCompleted:true,developerIds:['3']};
 for(const [id,app_role] of [['1','general_user'],['3','team_member'],['9','admin']]){
  const actor={id,app_role,is_active:true};
  assert.equal(canUseResumedFeaAgent({...state,requesterId:'1'},actor),true);
  assert.doesNotThrow(()=>assertAgentAccess(actor,project,state,false));
 }
 for(const [id,app_role] of [['2','general_user'],['4','team_member'],['5','team_leader']])assert.throws(()=>assertAgentAccess({id,app_role,is_active:true},project,state,true),e=>e.status===403);
 const actor={id:'1',app_role:'general_user',is_active:true};
 for(const patch of [{historicalImportFinalizedAt:null},{intakeDraftCompleted:false},{feaCompleted:true},{journeyStep:0},{journeyStep:2}])assert.throws(()=>assertAgentAccess(actor,project,{...state,...patch},true));
 assert.throws(()=>assertAgentAccess(actor,{...project,current_stage_code:'G1'},state,true));
 assert.throws(()=>assertAgentAccess({...actor,is_active:false},project,state,true));
});

test('historical FEA receives INT evidence without changing import history or asking INT questions',async()=>{
 const state={...blank(),historicalImport:true,historicalImportFinalizedAt:'2026-09-09',historicalBaselineStep:0,intakeDraftCompleted:true,intakeAnswers:['시화 일정을 매일 공유한다.','','','',''],intakeMessages:[{role:'user',text:'기존 INT 내용'}]};
 const original=structuredClone(state);let context;
 const output={reply:'일정 공유 내용을 요약합니다.',proposals:[{key:'fea.summary',value:'일정 공유를 자동화한다.',evidence:'시화 일정을 매일 공유한다.',kind:'suggested'}],target:'fea.alternatives.0',question:'업무 규정 변경으로 해결할 수 있나요?'};
 const generated=await generateTurn(state,'FEA 인터뷰 시작',{env:configured,fetcher:async(_url,options)=>{context=JSON.parse(JSON.parse(options.body).messages[1].content);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})};}});
 assert.ok(context.fields.every(f=>f.key.startsWith('fea.')));
 assert.equal(context.intakeReference['int.0'],state.intakeAnswers[0]);
 const next=acceptModelTurn(state,generated,'FEA 인터뷰 시작').state;
 assert.deepEqual(state,original);
 assert.deepEqual(next.intakeAnswers,original.intakeAnswers);
 assert.equal(next.historicalImportFinalizedAt,original.historicalImportFinalizedAt);
 assert.equal(next.historicalBaselineStep,0);
 assert.equal(progress(next).phase,'FEA');
 assert.equal(next.journeyStep,1);
 assert.equal(next.feaCompleted,undefined);
 assert.equal(next.workflowApprovals,undefined);
});

test('historical FEA panel is mounted after import completion and offers continuation despite old INT messages',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const panel=await readFile(new URL('../app/intake-agent-panel.tsx',import.meta.url),'utf8');
 assert.match(page,/selectedJourney===1&&canUseResumedFeaAgent\(current,identity\)/);
 assert.match(page,/resumedHistorical=\{Boolean\(current.historicalImport\)\}/);
 assert.match(panel,/INT 기반 FEA 인터뷰 시작·계속/);
 assert.doesNotMatch(panel,/신규 과제 전용/);
});

test('FEA has one INT-based interview action for both new and resumed projects',async()=>{
 const panel=await readFile(new URL('../app/intake-agent-panel.tsx',import.meta.url),'utf8');
 assert.equal((panel.match(/>INT 기반 FEA 인터뷰 시작·계속<\/button>/g)||[]).length,1);
 assert.doesNotMatch(panel,/>FEA 인터뷰 시작<|>FEA 인터뷰 계속<|저장된 INT로 FEA 인터뷰 시작·계속/);
 assert.match(panel,/phase==='FEA'&&!data.progress.collectionComplete&&<button/);
 assert.match(panel,/저장된 INT를 바탕으로 요구 요약 3줄을 제안하고 FEA에서 아직 부족한 정보를 하나씩 질문/);
 assert.match(panel,/phase==='FEA'&&data.progress.collectionComplete&&<button[^]*?send\('complete_fea'\)/);
});
test('FEA distinguishes collected proposals from reflected document and never asks for an autonomy code',()=>{
 const state=blank();
 for(const field of AGENT_FIELDS.filter(f=>f.key.startsWith('fea.')&&!f.optional&&f.key!=='fea.autonomy')){
  const value=field.choices?.[0]||'확인한 업무 근거입니다.';setField(state,field.key,value);state.agentSession.confirmed[field.key]={value};
 }
 const followup=acceptModelTurn(state,{reply:'실행 방식을 확인하겠습니다.',target:'fea.autonomy',question:'자율성 초안을 알려주세요.',proposals:[]},'예약 자동화');
 assert.ok(followup.reply.includes('사람이 실행 전에 승인'));assert.ok(!followup.reply.includes('자율성 초안을 알려'));
 const collected=acceptModelTurn(state,{reply:'승인 후 예약 실행으로 분류했습니다.',target:'',question:'',proposals:[{key:'fea.autonomy',value:'L2',kind:'suggested',evidence:'사람이 승인한 뒤 예약을 실행합니다.'}]},'사람이 승인한 뒤 예약을 실행합니다.');
 assert.equal(progress(collected.state).collectionComplete,true);assert.equal(progress(collected.state).canComplete,false);
 assert.ok(collected.reply.includes('모든 정보 수집이 완료되었습니다. 우측'));
 const reflected=applyProposals(collected.state,['fea.autonomy'],'7').state;
 assert.equal(progress(reflected).canComplete,true);assert.equal(reflected.feaDraft.autonomy,'L2');
 const stale=structuredClone(collected.state);setField(stale,'fea.autonomy','L0');
 assert.equal(progress(stale).collectionComplete,false);
});
test('Azure configuration fails closed and never accepts key exfiltration destinations',()=>{
  assert.throws(()=>azureConfiguration({}),e=>e.status===503);
  for(const endpoint of ['http://test.openai.azure.com','https://evil.example','https://test.openai.azure.com.evil.example','https://test.openai.azure.com/?key=x','https://user:pass@test.openai.azure.com']) assert.throws(()=>azureConfiguration({...configured,AZURE_OPENAI_ENDPOINT:endpoint}));
  assert.equal(azureConfiguration(configured).url,'https://test.openai.azure.com/openai/v1/chat/completions');
});
test('Azure request stays server-only, structured, bounded and non-streaming JSON',async()=>{
  let request;
  const result=await generateTurn(blank(),'업무 문제를 설명합니다.',{env:configured,fetcher:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'질문',proposals:[],target:'int.0',question:'구체적 문제는 무엇인가요?'})}}]})};}});
  assert.equal(result.reply,'질문');assert.equal(request.redirect,'error');
  const body=JSON.parse(request.body);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.model,'test-deployment');assert.ok(!request.body.includes('test-only'));
});
test('INT interview sends only INT fields and excludes contact metadata',async()=>{
  let request;
  const state={...blank(),journeyStep:0,requester:'테스트 · test@example.com',projectOwnerEmail:'test@example.com',intakeAnswers:['회의실 예약이 번거롭습니다.','','','',''],intakeDetails:{}};
  await generateTurn(state,'부족한 항목을 질문해 주세요.',{env:configured,fetcher:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'확인하겠습니다.',proposals:[],target:'int.performer',question:'누가 이 업무를 수행하나요?'})}}]})};}});
  const context=JSON.parse(JSON.parse(request.body).messages[1].content);
  assert.ok(context.fields.every(field=>field.key.startsWith('int.')));
  assert.ok(Object.keys(context.values).every(key=>key.startsWith('int.')));
  assert.deepEqual(context.intakeReference,{});
  assert.ok(!JSON.stringify(context).includes('test@example.com'));
  assert.deepEqual(context.computed,{});
});
test('FEA interview receives completed INT as read-only summary evidence',async()=>{
  let request;
  const state={...blank(),intakeAnswers:['회의실 예약이 번거롭습니다.','','','',''],intakeDetails:{performer:'팀원',countPerMonth:'20',asIsMinutes:'10',people:'1',failureImpact:'시간 낭비'}};
  await generateTurn(state,'FEA 요약을 작성해 주세요.',{env:configured,fetcher:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'요약했습니다.',proposals:[{key:'fea.summary',value:'회의실 예약 반복 업무를 개선합니다.',evidence:'회의실 예약이 번거롭습니다.',kind:'suggested'}],target:'fea.alternatives.0',question:'규정 개선으로 해결할 수 있나요?'})}}]})};}});
  const context=JSON.parse(JSON.parse(request.body).messages[1].content);
  assert.ok(context.fields.every(field=>field.key.startsWith('fea.')));
  assert.equal(context.intakeReference['int.0'],'회의실 예약이 번거롭습니다.');
  assert.equal(context.intakeReference['int.countPerMonth'],'20');
});
test('Azure failures and incomplete output do not expose provider diagnostics',async()=>{
  for(const response of [{ok:false,status:401},{ok:false,status:429},{ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'secret'}}]})}]) {
    await assert.rejects(generateTurn(blank(),'입력',{env:configured,fetcher:async()=>response}),e=>e instanceof AgentError&&!e.message.includes('secret'));
  }
});
test('only authorized active accounts on new INT/FEA projects can use the agent',()=>{
  const p={requester_id:'1',owner_id:'2',current_stage_code:'FEA'};
  const actor={id:'1',app_role:'general_user',is_active:true};
  assert.doesNotThrow(()=>assertAgentAccess(actor,p,{},false));
  assert.throws(()=>assertAgentAccess({...actor,id:'3'},p,{},false),e=>e.status===403);
  assert.throws(()=>assertAgentAccess(actor,p,{historicalImport:true},false),e=>e.status===403);
  assert.throws(()=>assertAgentAccess(actor,{...p,current_stage_code:'G1'},{},true),e=>e.status===409);
  assert.throws(()=>assertAgentAccess({...actor,is_active:false},p,{},true));
  assert.throws(()=>assertAgentAccess({id:'3',app_role:'team_member',is_active:true},p,{developerIds:['4']},false));
  assert.doesNotThrow(()=>assertAgentAccess({id:'3',app_role:'team_member',is_active:true},p,{},false));
});
test('missing numbers, defaults and vague narratives cannot become complete',()=>{
  for(const value of ['','미확보','약 20','20~30','-1','1e4','NaN','0']) assert.equal(validField(FIELD_MAP.get('fea.countPerMonth'),value),false);
  const state=blank();state.feaDraft={writeExec:false,scope:'TEAM',autonomy:'L0'};
  assert.ok(missingFields(state).some(f=>f.key==='fea.writeExec'));
  assert.equal(progress(state).ready,false);assert.equal(deterministicSummary(state).roi,null);
});
test('INT keeps interviewing for useful optional context after required fields are complete',()=>{
  const state={journeyStep:0,intakeAnswers:['회의실 예약 확인이 반복됩니다.','','','',''],intakeDetails:{performer:'총무 담당자',countPerMonth:'20',asIsMinutes:'15',people:'1',quantityBasis:'최근 한 달 업무 기록 기준',failureImpact:'예약 누락으로 회의가 지연됩니다.'},agentSession:{revision:1,confirmed:{},proposals:[],held:[],attempts:{}}};
  assert.equal(progress(state).ready,true);
  assert.equal(missingFields(state,'int.').length,0);
  assert.ok(interviewMissingFields(state,'int.').some(field=>field.key==='int.currentProcess'));
  const next=acceptModelTurn(state,{reply:'필수 내용은 확인했습니다.',target:'int.currentProcess',question:'현재 예약 확인은 어떻게 처리하나요?',proposals:[]},'계속 질문해 주세요.');
  assert.match(next.reply,/현재 예약 확인은 어떻게 처리하나요/);
});
test('INT applies exact answer extractions immediately and asks the earliest missing field',()=>{
  const state={journeyStep:0,intakeAnswers:['','','','',''],intakeDetails:{},agentSession:{revision:1,confirmed:{},proposals:[{key:'int.0',value:'회의실 예약 확인이 반복됩니다.',baseValue:'',kind:'extracted',evidence:'회의실 예약 확인이 반복됩니다.'}],held:[],attempts:{}}};
  const applied=autoApplyIntakeExtractions(state,'7');
  assert.equal(fieldValue(applied,'int.0'),'회의실 예약 확인이 반복됩니다.');
  assert.equal(applied.agentSession.proposals.length,0);
  assert.equal(applied.agentSession.confirmed['int.0'].actorId,'7');
  const next=acceptModelTurn({...state,agentSession:{...state.agentSession,proposals:[]}},{reply:'확인하겠습니다.',target:'int.performer',question:'누가 담당하나요?',proposals:[]},'계속 질문해 주세요.');
  assert.match(next.reply,/어떤 업무가 힘든가요/);
  assert.doesNotMatch(next.reply,/누가 담당하나요/);
});
test('unsubstantiated quantities and unauthorized output keys are ignored',()=>{
  const message='월 20건입니다.';
  const {state}=acceptModelTurn(blank(),{reply:'확인해 주세요.',target:'int.0',question:'업무 문제는 무엇인가요?',proposals:[
    {key:'fea.countPerMonth',value:'999',evidence:message,kind:'extracted'},
    {key:'fea.people',value:'2',evidence:'임의로 추정',kind:'suggested'},
    {key:'g1Resolution',value:'GO',evidence:message,kind:'extracted'},
    {key:'fea.countPerMonth',value:'20',evidence:message,kind:'extracted'},
  ]},message);
  assert.equal(state.agentSession.proposals.length,1);assert.equal(fieldValue(state,'fea.countPerMonth'),'');
  assert.equal(state.g1Resolution,undefined);
});
test('confirmation applies fields only, records source, and preserves approval state',()=>{
  const initial=blank();initial.g1Resolution={decision:'CONDITIONAL'};
  initial.agentSession.proposals=[{key:'fea.countPerMonth',value:'20',baseValue:'',kind:'extracted',evidence:'월 20건'}];
  const {state}=applyProposals(initial,['fea.countPerMonth'],'7');
  assert.equal(state.feaDraft.countPerMonth,'20');assert.equal(state.feaDraft.alternatives.length,4);
  assert.equal(state.agentSession.confirmed['fea.countPerMonth'].actorId,'7');
  assert.equal(state.g1Resolution.decision,'CONDITIONAL');assert.equal(state.feaCompleted,undefined);
});
test('manual changes during generation and review are never silently overwritten',()=>{
  const snapshot=blank(), current=blank();setField(current,'fea.countPerMonth','30');
  const {state}=acceptModelTurn(current,{reply:'확인',target:'',question:'',proposals:[{key:'fea.countPerMonth',value:'20',kind:'extracted',evidence:'월 20건'}]},'월 20건',snapshot);
  const saved=applyProposals(state,['fea.countPerMonth'],'1');assert.equal(saved.state.feaDraft.countPerMonth,'30');assert.equal(saved.conflicts.length,1);
});
test('INT keeps re-asking while FEA retains bounded holds and later answers can resume',()=>{
  let state={...blank(),journeyStep:0};
  for(let i=0;i<4;i++) state=acceptModelTurn(state,{reply:'조금 더 확인하겠습니다.',target:'int.0',question:'어떤 업무가 힘든가요?',proposals:[]},'설명이 어렵습니다').state;
  assert.ok(!state.agentSession.held.includes('int.0'));
  let fea=blank();
  for(let i=0;i<3;i++) fea=acceptModelTurn(fea,{reply:'보류합니다.',target:'fea.summary',question:'요약 근거를 알려주세요.',proposals:[]},'모릅니다').state;
  assert.ok(fea.agentSession.held.includes('fea.alternatives.0'));
});
test('classification and ROI are deterministic with confirmed inputs, not model verdicts',()=>{
  const state=blank();for(const [key,value] of Object.entries({countPerMonth:'20',asIsMinutes:'45',people:'2',savedMinutes:'30',effectBasis:'실측한 처리 시간 차이',businessIdentity:'false',writeExec:'false',sensitive:'false',damageFinancial:'false',scope:'TEAM',autonomy:'L2',agentType:'혼합형'})) {setField(state,`fea.${key}`,value);state.agentSession.confirmed[`fea.${key}`]={value};}
  assert.equal(deterministicSummary(state).roi.monthlyHours,10);assert.equal(deterministicSummary(state).classification.label,'상');
  assert.equal(state.g1Resolution,undefined);
});
test('sensitive input is blocked before persistence and transmission',()=>{
  assert.equal(safeMessage('주민번호 900101-1234567'),false);assert.equal(safeMessage('계좌번호: 1234 5678 1234'),false);assert.equal(safeMessage('월 20건 · 건당 45분'),true);
});
test('portal wiring guards server state, revisions and completion; original database route remains protected',async()=>{
  const api=await readFile(new URL('../server/database-api.mjs',import.meta.url),'utf8');
  assert.match(api,/changedKeys.includes\("agentSession"\)/);assert.match(api,/body.agentRevision/);assert.match(api,/missingFields\(merged/);
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');assert.match(page,/<IntakeAgentPanel/);assert.match(page,/portal-agent-saved/);
  const panel=await readFile(new URL('../app/intake-agent-panel.tsx',import.meta.url),'utf8');assert.match(panel,/phase==='INT'&&data\.progress\.ready&&!interviewMissing\.length/);assert.match(panel,/현재 INT 필수 항목 중 부족한 정보만/);
  assert.doesNotMatch(panel,/data\.session\.request\?\.status!=='complete'/);
  assert.match(panel,/action==='review_intake'\?\(fastTrack\?'INT 확인을 완료했습니다/);
  assert.match(panel,/INT 자동 작성 중/);
  assert.match(panel,/phase==='INT'\?'int-simple'/);
  assert.equal(AGENT_FIELDS.filter(f=>f.key.startsWith('fea.fitNotes')).length,0);
});
