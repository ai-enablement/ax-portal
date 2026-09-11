import test from 'node:test';
import assert from 'node:assert/strict';
import {draftProjectCode,assignCompletedIntNumber,replaceProjectCode} from '../server/project-numbering.mjs';
import {isProjectCode,projectCodeLabel} from '../shared/project-code.mjs';
import {allowedNativePath} from '../server/native-agent.mjs';
test('draft IDs are unique, non-sequential and accepted by the native INT workspace',()=>{
 const code=draftProjectCode();assert.match(code,/^DRAFT-[a-f0-9]{32}$/);assert.notEqual(code,draftProjectCode());
 assert.equal(isProjectCode(code),true);assert.equal(isProjectCode('../bad'),false);
 assert.equal(allowedNativePath(`/api/projects/${code}`,'GET',code,'INT'),true);
 assert.equal(projectCodeLabel(code),'INT 작성 중 · 번호 미부여');
});
test('existing and historical numbers are never reassigned',async()=>{
 const result=await assignCompletedIntNumber({query:()=>{throw Error('must not allocate');}},1,'2026-033',{}, {},1);
 assert.equal(result.code,'2026-033');
});
test('completion allocates once and renames document and session references',async()=>{
 const code=draftProjectCode(),calls=[];
 const client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:sql.includes('next_project_code')?[{code:'2026-045'}]:sql.startsWith('select id,markdown')?[{id:2,markdown:`# ${code}-INT`,original_name:`${code}-INT.md`}]:[]};}};
 const result=await assignCompletedIntNumber(client,1,code,{no:code},{project_no:code,int_data:{project_no:code},int_md:`# ${code}-INT`},7);
 assert.equal(result.state.no,'2026-045');assert.equal(result.payload.int_data.project_no,'2026-045');
 assert.equal(result.payload.int_md,'# 2026-045-INT');assert.equal(result.state.provisionalProjectCode,code);
 assert.equal(calls.filter(([s])=>s.includes('next_project_code')).length,1);
 assert.ok(calls.some(([s,a])=>s.startsWith('update agent_portal.native_agent_documents')&&a[2]==='2026-045-INT.md'));
 assert.deepEqual(replaceProjectCode([null,42,code],code,'2026-045'),[null,42,'2026-045']);
});
