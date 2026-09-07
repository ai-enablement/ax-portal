import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../server/request-origin.mjs';

const request=(url,headers={})=>new Request(url,{headers});
test('origin check accepts direct and Azure reverse-proxy same-origin requests',()=>{
  assert.equal(isSameOriginRequest(request('https://portal.example/api',{origin:'https://portal.example'}),{}),true);
  assert.equal(isSameOriginRequest(request('http://10.0.0.4:8080/api',{origin:'https://portal.example',host:'portal.example','x-forwarded-proto':'https'}),{}),true);
  assert.equal(isSameOriginRequest(request('http://internal:8080/api',{origin:'https://portal.example','x-forwarded-host':'portal.example','x-forwarded-proto':'https'}),{}),true);
});
test('origin check rejects a genuinely different browser origin',()=>{
  assert.equal(isSameOriginRequest(request('http://internal:8080/api',{origin:'https://evil.example',host:'portal.example','x-forwarded-proto':'https'}),{}),false);
  assert.equal(isSameOriginRequest(request('https://portal.example/api',{origin:'not a url'}),{}),false);
});
