import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeAgent} from '../server/native-agent-runtime.mjs';
import {azureConfiguration} from '../server/intake-agent.mjs';

test('original Python interview calls configured Azure AI using synthetic data only',{
 skip:process.env.PORTAL_NATIVE_LIVE_TEST!=='1',timeout:125000,
},async()=>{
 azureConfiguration();
 const result=await runNativeAgent({project:{project_no:'2099-999',agent_name:'Synthetic QA',history:[],int_data:{}},path:'/api/intake/message',method:'POST',body:{message:'테스트용 가상 업무입니다. 품질팀이 부품 변경 문서를 수동으로 대조합니다. 월 20건 정도이고 건당 30분씩 두 명이 확인합니다. 문서를 잘못 대조하면 재작업이 필요합니다.'},actor:'Synthetic QA'});
 assert.equal(result.status,200);
 assert.ok(result.audit.some(e=>e.event==='native_llm_success'),'A real model response must succeed; fallback is not a passing result');
 assert.ok(result.project.history.length>0);
});
