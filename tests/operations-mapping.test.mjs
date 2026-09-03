import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProject, operationsSourceFields} from '../shared/project-classification.mjs';
import {hydrateStandardDocuments, sectionHasContent, standardDocuments} from '../shared/standard-documents.mjs';

test('FEA classification respects scope, risk and autonomy minimum tracks',()=>{
  assert.equal(classifyProject({scope:'TEAM',autonomy:'L1'}).label,'하');
  for(const scope of ['DEPT','MULTI_DEPT']) assert.equal(classifyProject({scope,autonomy:'L0'}).label,'중');
  for(const input of [{scope:'COMPANY'},{writeExec:true},{sensitive:true},{damageFinancial:true},{autonomy:'L2'},{autonomy:'L3'},{autonomy:'L4'}]) assert.equal(classifyProject(input).label,'상');
});
test('OPS maps FEA and all named developers instead of stale manual values',()=>{
  const project={feaDraft:{agentType:'업무지원 Agent (규칙형)',scope:'TEAM',autonomy:'L1'},projectOwner:'실제 오너',developerNames:['개발자 A','개발자 B'],historicalDocuments:{7:{documents:{DEP:{fields:{'readiness.knowledgeOwner':'지식 담당자'}}}}}};
  const record={documents:{OPS:{fields:{'owners.type':'목업','owners.owner':'옛 오너'},completedSections:[],status:'draft',messages:[]}}};
  const ops=hydrateStandardDocuments(9,record,project).documents.OPS;
  assert.equal(ops.fields['owners.owner'],'실제 오너');
  assert.equal(ops.fields['owners.operator'],'개발자 A · 개발자 B');
  assert.equal(ops.fields['owners.knowledgeOwner'],'지식 담당자');
  assert.equal(ops.fields['owners.type'],'업무지원 Agent (규칙형)');
  assert.equal(ops.fields['owners.track'],'하');
  assert.equal(record.documents.OPS.fields['owners.owner'],'옛 오너');
});
test('ARD confirmed autonomy wins but cannot silently lower a high FEA track',()=>{
  const project={feaDraft:{autonomy:'L2',scope:'TEAM'},historicalDocuments:{3:{documents:{ARD:{status:'complete',fields:{'autonomy.level':'L0 정보 제공'}}}}}};
  assert.equal(operationsSourceFields(project)['owners.autonomy'],'L0');
  assert.equal(operationsSourceFields(project)['owners.track'],'상');
  project.feaDraft.autonomy='L0'; project.historicalDocuments[3].documents.ARD.fields['autonomy.level']='L3 자동 실행';
  assert.equal(operationsSourceFields(project)['owners.track'],'상');
  assert.equal(operationsSourceFields({})['owners.type'],'');
  assert.equal(operationsSourceFields({})['owners.operator'],'');
});
test('sunset is optional until 폐기 and preserved when toggled back',()=>{
  const sunset=standardDocuments.OPS.sections.find(s=>s.id==='sunset');
  assert.equal(sectionHasContent(sunset,{'owners.status':'운영'}),true);
  assert.equal(sectionHasContent(sunset,{'owners.status':'폐기'}),false);
  const fields={'owners.status':'폐기','sunset.criteria':'사용 종료','sunset.procedure':'공지 후 접근 차단'};
  assert.equal(sectionHasContent(sunset,fields),true);
  fields['owners.status']='운영'; assert.equal(fields['sunset.criteria'],'사용 종료');
});
