import test from 'node:test';
import assert from 'node:assert/strict';
import {mailAppOrigin} from '../server/mail-config.mjs';
test('mail URL reads runtime configuration with server-only override',()=>{
  const env={NEXT_PUBLIC_APP_URL:'https://first.example/'};
  assert.equal(mailAppOrigin(env),'https://first.example');
  env.NEXT_PUBLIC_APP_URL='https://second.example/';
  assert.equal(mailAppOrigin(env),'https://second.example');
  env.PORTAL_APP_URL='https://server.example/';
  assert.equal(mailAppOrigin(env),'https://server.example');
});
test('mail URL rejects missing, malformed, insecure and credential-bearing URLs',()=>{
  for(const value of [undefined,'portal.example','http://portal.example','https://user:pass@portal.example']) {
    assert.throws(()=>mailAppOrigin({NEXT_PUBLIC_APP_URL:value}));
  }
});
