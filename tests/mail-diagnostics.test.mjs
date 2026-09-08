import test from 'node:test';
import assert from 'node:assert/strict';
import {MailDiagnosticError,safeMailDiagnostic} from '../server/mail-diagnostics.mjs';
import {managedIdentityToken,deliverMail} from '../server/work-mail.mjs';
const env={IDENTITY_ENDPOINT:'http://localhost/token',IDENTITY_HEADER:'secret-header',POWER_AUTOMATE_MAIL_URL:'https://test.environment.api.powerplatform.com/flow'};
test('diagnostics expose only approved codes and numeric HTTP status',()=>{
  assert.deepEqual(safeMailDiagnostic(new Error('secret-token https://private')), {stage:'mail_server',code:'MAIL_INTERNAL_ERROR'});
  assert.deepEqual(safeMailDiagnostic(new MailDiagnosticError('MANAGED_IDENTITY_TOKEN_FAILED',403)), {stage:'identity_token',code:'MANAGED_IDENTITY_TOKEN_FAILED',httpStatus:403});
  assert.deepEqual(safeMailDiagnostic(new MailDiagnosticError('secret-token')), {stage:'mail_server',code:'MAIL_INTERNAL_ERROR'});
});
test('pre-send failures identify URL, settings, network, status and response safely',async()=>{
  const cases=[
    [()=>deliverMail({}, {...env,POWER_AUTOMATE_MAIL_URL:'invalid'}),'MAIL_FLOW_URL_INVALID'],
    [()=>managedIdentityToken({}),'MANAGED_IDENTITY_UNAVAILABLE'],
    [()=>managedIdentityToken({...env,IDENTITY_ENDPOINT:'invalid'}),'MANAGED_IDENTITY_URL_INVALID'],
    [()=>managedIdentityToken(env,async()=>{throw new Error('secret');}),'MANAGED_IDENTITY_REQUEST_FAILED'],
    [()=>managedIdentityToken(env,async()=>({ok:false,status:401})),'MANAGED_IDENTITY_TOKEN_FAILED'],
    [()=>managedIdentityToken(env,async()=>({ok:true,status:200,json:async()=>{throw new Error('secret');}})),'MANAGED_IDENTITY_RESPONSE_INVALID'],
    [()=>managedIdentityToken(env,async()=>({ok:true,status:200,json:async()=>null})),'MANAGED_IDENTITY_TOKEN_MISSING'],
  ];
  for(const [operation,code] of cases) await assert.rejects(operation,error=>safeMailDiagnostic(error).code===code);
});
test('Flow failure is distinct from token failure and network outcome remains uncertain',async()=>{
  for(const status of [401,403,429,500]) {
    const result=await deliverMail({},env,async(url)=>url.hostname==='localhost'?{ok:true,json:async()=>({access_token:'secret'})}:{status});
    assert.equal(result.stage,'flow_request');assert.equal(result.httpStatus,status);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
  const result=await deliverMail({},env,async(url)=>{
    if(url.hostname==='localhost')return {ok:true,json:async()=>({access_token:'secret'})};
    throw new Error('secret');
  });
  assert.equal(result.status,'uncertain');assert.equal(result.stage,'flow_request');
});
