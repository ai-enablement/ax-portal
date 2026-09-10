import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,delimiter} from 'node:path';
import {nativeAgentEnvironment} from '../server/native-agent-runtime.mjs';
test('native runtime prepends shipped dependencies and preserves local configuration',()=>{
 const original={PYTHONPATH:'local-deps',PORTAL_AGENT_PYTHON:'custom-python'};
 const env=nativeAgentEnvironment(original);
 assert.equal(env.PYTHONPATH,resolve('server/vendor/intake-agent/python-packages')+delimiter+'local-deps');
 assert.equal(env.PORTAL_AGENT_PYTHON,'custom-python');
 assert.equal(env.PORTAL_AGENT_EMBEDDED,'1');
 assert.equal(env.PYTHONDONTWRITEBYTECODE,'1');
 assert.equal(original.PYTHONPATH,'local-deps');
 assert.equal(nativeAgentEnvironment({}).PYTHONPATH,resolve('server/vendor/intake-agent/python-packages'));
});
