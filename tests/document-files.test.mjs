import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, documentAccess } from '../server/document-files.mjs';
import { asBlocks, validateContent, contentText } from '../shared/document-content.mjs';
import { standardDocuments, sectionHasContent, hydrateStandardDocuments } from '../shared/standard-documents.mjs';
import { persistStandardDocuments } from '../server/standard-documents.mjs';

test('documents support ordered text/table/file blocks and retain old hidden fields',()=>{
  const old=hydrateStandardDocuments(5);old.documents.DES.fields['architecture.reviewNote']='보존';old.documents.DES.fields['architecture.evidence']='기존 근거';
  assert.equal(hydrateStandardDocuments(5,old).documents.DES.fields['architecture.reviewNote'],'보존');
  for(const code of ['DES','EVP','EVR']){
    assert.ok(standardDocuments[code].sections.every(s=>!s.fields.some(f=>f.id==='reviewNote')));
    assert.ok(standardDocuments[code].sections.every(s=>s.fields.find(f=>f.id==='evidence').kind==='files'));
  }
  const value={kind:'blocks',blocks:[{id:'a',type:'text',text:'본문'},{id:'b',type:'table',rows:[['제목','내용'],['A','B']]}]};
  validateContent(value);assert.equal(asBlocks('기존 텍스트')[0].text,'기존 텍스트');assert.match(contentText(value),/본문/);
  assert.equal(sectionHasContent(standardDocuments.DES.sections[0],{'architecture.body':value}),true);
  assert.throws(()=>validateContent({kind:'blocks',blocks:[{type:'html',html:'<script/>'}]}));
  assert.equal(sectionHasContent({id:'s',fields:[{id:'v',kind:'select',options:['승인']}]},{'s.v':value}),false);
});
test('upload rejects oversized, unsupported and mismatched file contents',()=>{
  assert.equal(validateUpload('readme.txt',Buffer.from('hello')),'text/plain');
  assert.equal(validateUpload('test.png',Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
  assert.throws(()=>validateUpload('x.svg',Buffer.from('<svg/>')));
  assert.throws(()=>validateUpload('x.png',Buffer.from('<script/>')));
  assert.throws(()=>validateUpload('x.pdf',Buffer.alloc(5*1024*1024+1)));
});
test('file access separates readers, assigned developers and unassigned team writers',async()=>{
  const client=(role,members=[],stage='OPS')=>({query:async sql=>({rows:sql.includes('from agent_portal.users')?[{id:1,app_role:role}]:sql.includes('from agent_portal.projects')?[{id:2,owner_id:1,requester_id:3,current_stage_code:stage}]:members})});
  assert.ok(await documentAccess(client('general_user'),{email:'a'},'P'));
  assert.equal(await documentAccess(client('general_user'),{email:'a'},'P',true,'DES'),null);
  assert.ok(await documentAccess(client('team_member'),{email:'a'},'P',true,'DES'));
  assert.equal(await documentAccess(client('team_member',[{user_id:9,relationship:'developer'}]),{email:'a'},'P',true,'DES'),null);
  assert.ok(await documentAccess(client('bts',[{user_id:1,relationship:'developer'}]),{email:'a'},'P',true,'DES'));
  assert.equal(await documentAccess(client('admin',[],'ARD'),{email:'a'},'P',true,'OPS'),null);
  assert.equal(await documentAccess(client('admin'),null,'P'),null);
});
test('document saving rejects attachments from another project',async()=>{
  const record=hydrateStandardDocuments(5);
  record.documents.DES.fields['architecture.body']={kind:'blocks',blocks:[{id:'b',type:'file',caption:'',file:{id:'12345678-1234-1234-1234-123456789012',name:'a.pdf'}}]};
  await assert.rejects(()=>persistStandardDocuments({query:async()=>({rows:[]})},{id:1},5,record,1),/attachment ownership/);
});
test('new fields do not invalidate unchanged completed documents',async()=>{
  const previous=hydrateStandardDocuments(7);previous.documents.DEP.status='complete';
  const current=structuredClone(previous);current.documents.UG.fields['overview.intro']='새 안내';
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('returning id')?[{id:1}]:[]};}};
  await persistStandardDocuments(client,{id:1,project_code:'QA'},7,current,1,previous);
  assert.ok(calls.length>0);assert.ok(calls.filter(c=>c.sql.includes('insert into agent_portal.documents')).every(c=>c.params[1]==='UG'));
});
test('pilot includes the requested decision and approval fields; UG and operations support attachments',()=>{
  const results=standardDocuments.DEP.sections.find(s=>s.id==='results');
  assert.deepEqual(results.fields.find(f=>f.id==='pilotDecision').options,['확산 승인','파일럿 연장','회수 후 개선']);
  assert.ok(results.fields.some(f=>f.id==='approver'));assert.ok(results.fields.some(f=>f.id==='approvalDate'));
  for(const code of ['UG','OPS','CHG'])assert.ok(standardDocuments[code].sections.every(s=>s.fields.some(f=>f.kind==='files')));
});
