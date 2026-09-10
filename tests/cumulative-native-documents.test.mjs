import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCumulativeMarkdown,completedNativeReferences,loadCompletedNativeDocuments} from '../server/markdown-documents.mjs';
const project={project_code:'2026-033',project_name:'원문 누적 검증',current_stage_code:'DES'};
const documents=['INT','FEA','ARD'].map((document_type,i)=>({id:String(i+1),document_type,version_number:2,original_name:`${document_type}.md`,author_name:'작성자',content_sha256:'hash',markdown:`# ${document_type}\r\n\r\n| 항목 | 값 |\r\n| --- | --- |\r\n| 한글 | **원문** |\r\n\r\n\`\`\`js\r\n  const value = 1;\r\n\`\`\`\r\n`}));
const state={nativeAgentArtifacts:Object.fromEntries(documents.map(d=>[d.document_type,{id:d.id,version:2,status:'complete',at:'2026-09-10'}])),intakeAnswers:['옛 INT 본문'],feaDraft:{summary:'옛 FEA 본문'}};
test('all later phases include completed INT FEA ARD verbatim, not latest drafts or reconstructed forms',()=>{
 for(const phase of ['design','development_evaluation','deployment_rollout']){
  const draft={...documents[0],id:'99',version_number:3,markdown:'UNFINISHED DRAFT'};
  const markdown=buildCumulativeMarkdown(project,state,phase,[],[draft,...documents]);
  for(const doc of documents)assert.ok(markdown.includes(doc.markdown));
  assert.doesNotMatch(markdown,/UNFINISHED DRAFT|옛 INT 본문|옛 FEA 본문/);
  assert.ok(markdown.indexOf('## INT')<markdown.indexOf('## FEA'));
  assert.ok(markdown.indexOf('## FEA')<markdown.indexOf('## ARD'));
 }
});
test('rework retains last completed document; incomplete and missing references never silently substitute a draft',()=>{
 const editing=structuredClone(state);editing.nativeAgentArtifacts.INT.status='draft';
 assert.equal(completedNativeReferences(editing)[0].id,'1');
 assert.ok(buildCumulativeMarkdown(project,editing,'design',[],documents).includes(documents[0].markdown));
 assert.throws(()=>buildCumulativeMarkdown(project,state,'design',[],documents.slice(1)),/완료 원본/);
 const incomplete={nativeAgentArtifacts:{INT:{status:'draft'}}};
 assert.deepEqual(completedNativeReferences(incomplete),[]);
 assert.match(buildCumulativeMarkdown(project,incomplete,'design'),/작성 중인 초안은 포함하지 않습니다/);
});
test('native loader uses project plus exact completed IDs/types/versions; legacy does not query native tables',async()=>{
 let calls=0;
 const client={query:async(sql,args)=>{calls++;assert.match(sql,/d.project_id=\$1/);assert.match(sql,/d.version_number=r.version_number/);assert.equal(args[0],'33');assert.deepEqual(JSON.parse(args[1]),completedNativeReferences(state));return {rows:documents};}};
 assert.deepEqual(await loadCompletedNativeDocuments(client,'33',{}),[]);assert.equal(calls,0);
 assert.deepEqual(await loadCompletedNativeDocuments(client,'33',state),documents);
 await assert.rejects(loadCompletedNativeDocuments({query:async()=>({rows:[]})},'34',state),/완료된 원본/);
});
