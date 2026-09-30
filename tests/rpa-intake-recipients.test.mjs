import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RPA_INTAKE_RECIPIENTS} from '../server/rpa-intake-recipients.mjs';
test('new RPA intake emails go only to the two designated recipients',async()=>{
 assert.deepEqual([...RPA_INTAKE_RECIPIENTS].sort(),['miki.kim@thebytesize.ai','siyoung.heo@changshininc.com']);
 assert.ok(Object.isFrozen(RPA_INTAKE_RECIPIENTS));
 const source=await readFile(new URL('../server/rpa-portal.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('const recipients=RPA_INTAKE_RECIPIENTS.map(email=>({email}))'));
 assert.ok(!source.includes('select distinct lower(email) as email from agent_portal.users'));
 const management=await readFile(new URL('../server/rpa-management.mjs',import.meta.url),'utf8');
 assert.ok(!management.includes('RPA_INTAKE_RECIPIENTS'));
 assert.ok(management.includes("action==='resolve'?requester?.email:payload.assigneeEmail"));
});
