import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTurn} from '../server/intake-agent.mjs';
import {FIELD_MAP,acceptModelTurn,applyProposals,fieldValue} from '../shared/intake-agent.mjs';

// Opt-in only. Sends synthetic business data to the configured Azure deployment.
// Never logs credentials, request headers or raw model output.
test('live Azure INT/FEA v3 structured interview and human-confirmed extraction', {
  skip:process.env.PORTAL_TEST_AZURE_AI!=='1', timeout:75000,
}, async()=>{
  const state={intakeStandardVersion:'3.0',journeyStep:0,intakeAnswers:['','','','',''],intakeDetails:{},
    agentSession:{revision:0,proposals:[],confirmed:{},held:[],attempts:{}}};
  const message='테스트용 가상 업무입니다. 품질팀 담당자가 부품 변경 문서를 수동으로 대조합니다. 월평균 약 20건입니다. 건당 약 30분입니다. 수행 인원은 2명입니다. 누락되면 문서를 재작성해야 합니다. 숫자는 담당자의 대략적인 추정입니다.';
  const started=Date.now();
  const result=await generateTurn(state,message);
  assert.equal(typeof result.reply,'string');
  assert.ok(result.reply.trim());
  assert.equal(typeof result.question,'string');
  assert.ok(result.target===''||FIELD_MAP.has(result.target));
  assert.ok(Array.isArray(result.proposals)&&result.proposals.length>0);
  for(const p of result.proposals) {
    assert.ok(FIELD_MAP.has(p.key));
    assert.equal(typeof p.value,'string');
    assert.equal(typeof p.evidence,'string');
    assert.ok(['extracted','suggested'].includes(p.kind));
  }
  const proposed=acceptModelTurn(state,result,message).state;
  const quantity=proposed.agentSession.proposals.find(p=>['int.countPerMonth','int.asIsMinutes','int.people'].includes(p.key));
  assert.ok(quantity,'At least one source-backed v3 INT quantity must survive validation');
  assert.equal(quantity.value,{'int.countPerMonth':'20','int.asIsMinutes':'30','int.people':'2'}[quantity.key]);
  assert.equal(fieldValue(proposed,quantity.key),'','AI must not apply unconfirmed data');
  const confirmed=applyProposals(proposed,proposed.agentSession.proposals.map(p=>p.key),'synthetic-test-user').state;
  assert.equal(fieldValue(confirmed,quantity.key),quantity.value);
  assert.equal(confirmed.journeyStep,0);
  assert.equal(confirmed.feaCompleted,undefined);
  assert.equal(confirmed.g1Resolution,undefined);
  console.log('Live Azure interview passed; durationMs='+String(Date.now()-started));
});

test('live Azure FEA generates summary without requesting writer Go or Drop',{skip:process.env.PORTAL_TEST_AZURE_AI!=='1',timeout:75000},async()=>{
  const state={journeyStep:1,intakeStandardVersion:'3.0',intakeAnswers:['문서를 수동 대조하며 누락 여부를 확인합니다.','','','',''],intakeDetails:{performer:'가상 품질 담당자',countPerMonth:'20',asIsMinutes:'30',people:'2',failureImpact:'문서 재작업'},agentSession:{confirmed:{},proposals:[],held:[],attempts:{}}};
  const message='확인한 접수서를 바탕으로 요구 요약을 작성하고 FEA 보완 질문을 해 주세요.';
  const result=await generateTurn(state,message);
  const next=acceptModelTurn(state,result,message).state;
  assert.ok(next.feaDraft?.summary?.trim(),'AI summary must be populated');
  assert.ok(next.agentSession.generatedSummary);
  assert.ok(!result.proposals.some(p=>/recommendation|decisionReason|dropAlternative/.test(p.key)));
  assert.equal(next.g1Resolution,undefined);
});
