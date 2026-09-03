import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {AGENT_FIELDS,FIELD_MAP,validField,fieldValue,missingFields,progress,safeMessage,applyProposals,acceptModelTurn,deterministicSummary,setField} from '../shared/intake-agent.mjs';
import {azureConfiguration,generateTurn,assertAgentAccess,AgentError} from '../server/intake-agent.mjs';
const configured={AZURE_OPENAI_ENDPOINT:'https://test.openai.azure.com/',AZURE_OPENAI_API_KEY:'test-only',AZURE_OPENAI_DEPLOYMENT:'test-deployment'};
const blank=()=>({name:'테스트 과제',intakeAnswers:['','','','',''],agentSession:{revision:1,confirmed:{},proposals:[],held:[],attempts:{}}});
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
test('re-asking has bounded counts and held slots accept later answers',()=>{
  let state=blank();
  for(let i=0;i<2;i++) state=acceptModelTurn(state,{reply:'수치 확인 필요',target:'fea.countPerMonth',question:'월 몇 건인가요?',proposals:[]},'모릅니다').state;
  assert.ok(state.agentSession.held.includes('fea.countPerMonth'));
  state=acceptModelTurn(state,{reply:'확인',target:'',question:'',proposals:[{key:'fea.countPerMonth',value:'20',kind:'extracted',evidence:'월 20건'}]},'월 20건').state;
  state=applyProposals(state,['fea.countPerMonth'],'1').state;
  assert.ok(!state.agentSession.held.includes('fea.countPerMonth'));
});
test('classification and ROI are deterministic with confirmed inputs, not model verdicts',()=>{
  const state=blank();for(const [key,value] of Object.entries({countPerMonth:'20',asIsMinutes:'45',people:'2',toBeMinutes:'15',writeExec:'false',sensitive:'false',damageFinancial:'false',scope:'TEAM',autonomy:'L2',agentType:'혼합형'})) {setField(state,`fea.${key}`,value);state.agentSession.confirmed[`fea.${key}`]={value};}
  assert.equal(deterministicSummary(state).roi.monthlyHours,20);assert.equal(deterministicSummary(state).classification.label,'상');
  assert.equal(state.g1Resolution,undefined);
});
test('sensitive input is blocked before persistence and transmission',()=>{
  assert.equal(safeMessage('주민번호 900101-1234567'),false);assert.equal(safeMessage('계좌번호: 1234 5678 1234'),false);assert.equal(safeMessage('월 20건 · 건당 45분'),true);
});
test('portal wiring guards server state, revisions and completion; original database route remains protected',async()=>{
  const api=await readFile(new URL('../server/database-api.mjs',import.meta.url),'utf8');
  assert.match(api,/changedKeys.includes\("agentSession"\)/);assert.match(api,/body.agentRevision/);assert.match(api,/missingFields\(merged/);
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');assert.match(page,/<IntakeAgentPanel/);assert.match(page,/portal-agent-saved/);
  assert.equal(AGENT_FIELDS.filter(f=>f.key.startsWith('fea.fitNotes')).length,5);
});
