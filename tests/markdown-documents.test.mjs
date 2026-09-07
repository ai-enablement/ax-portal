import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMarkdownUpload, buildCumulativeMarkdown, allowedPhase, applyMarkdownCompletion } from '../server/markdown-documents.mjs';
import { developmentEvdComplete, releaseEvdComplete, gateGaps } from '../shared/workflow-v31.mjs';

test('Markdown uploads require a non-empty UTF-8 .md file within the size limit',()=>{
  assert.equal(validateMarkdownUpload('design.md',Buffer.from('# 설계\n\n|항목|값|\n|-|-|\n|A|B|')) .startsWith('# 설계'),true);
  assert.throws(()=>validateMarkdownUpload('design.txt',Buffer.from('text')),/\.md/);
  assert.throws(()=>validateMarkdownUpload('empty.md',Buffer.from('   ')),/내용/);
  assert.throws(()=>validateMarkdownUpload('binary.md',Buffer.from([0xff,0xfe,0x00])),/텍스트|UTF-8/);
});

test('EVD completion is phase-specific and each gate remains independent',()=>{
  const base={markdownDocuments:{EVD:{phases:{development_evaluation:{version:1}}}},gateChecks:{G3:{criteriaPassed:true,zeroViolations:true,evidence:'v1'},G4:{criteriaPassed:true,evidence:'v2'}},uatRecord:{completed:true}};
  assert.equal(developmentEvdComplete(base),true);assert.equal(releaseEvdComplete(base),false);
  assert.ok(gateGaps('G4',base).some(v=>v.includes('EVD')));
  base.markdownDocuments.EVD.phases.deployment_rollout={version:2};
  assert.equal(releaseEvdComplete(base),true);assert.deepEqual(gateGaps('G4',base),[]);
});

test('G3 and G4 rework allow a new Markdown version and reopen approvals with history',()=>{
  const g3={journeyStep:6,workflowApprovals:{G3:{team_leader:{decision:'REWORK',reason:'평가 근거 보완'}}},markdownDocuments:{}};
  assert.equal(allowedPhase(g3,'EVD','development_evaluation'),'development_evaluation');
  assert.equal(allowedPhase(g3,'DES','design'),'design');
  const g3Completion=applyMarkdownCompletion(g3,'EVD',{id:'v2',lifecycle_phase:'development_evaluation',version_number:2,original_name:'evd-v2.md',author_name:'개발자',created_at:'2026-09-08T00:00:00Z'});
  assert.equal(g3Completion.resetGate,'G3');
  assert.deepEqual(g3Completion.state.workflowApprovals.G3,{});
  assert.equal(g3Completion.state.workflowApprovalHistory[0].approvals.team_leader.reason,'평가 근거 보완');
  const g4={journeyStep:8,workflowApprovals:{G4:{team_leader:{decision:'REWORK',reason:'파일럿 결과 보완'}}},markdownDocuments:{}};
  assert.equal(allowedPhase(g4,'EVD','deployment_rollout'),'deployment_rollout');
  assert.equal(allowedPhase(g4,'UG','deployment_rollout'),'deployment_rollout');
  assert.equal(applyMarkdownCompletion(g4,'UG',{id:'u2',lifecycle_phase:'deployment_rollout',version_number:2,original_name:'ug-v2.md',author_name:'개발자',created_at:'2026-09-08T00:00:00Z'}).resetGate,'G4');
});

test('UI exposes version history and database DELETE accepts an empty body',async()=>{
  const workspace=await readFile(new URL('../app/markdown-document-workspace.tsx',import.meta.url),'utf8');
  const route=await readFile(new URL('../app/api/database/[...path]/route.js',import.meta.url),'utf8');
  assert.match(workspace,/전체 버전 이력/);assert.match(workspace,/MarkdownView/);assert.match(workspace,/portal-agent-saved/);
  assert.match(workspace,/x-portal-dev-role/);
  assert.match(route,/\['GET', 'HEAD', 'DELETE'\]/);
});

test('cumulative export contains required records and only prior-phase uploaded history',()=>{
  const project={project_code:'2026-001',project_name:'누적 테스트',current_stage_code:'PILOT'};
  const state={intakeAnswers:['업무 문제','','시스템','','2026-10-01'],intakeDetails:{performer:'담당자',countPerMonth:'10',asIsMinutes:'20',people:'2',failureImpact:'일정 지연'},feaDraft:{summary:'요구 요약',alternatives:['A','B','C','D'],conclusion:'Agent 필요',writeExec:false,sensitive:false,businessIdentity:false,scope:'TEAM',damageFinancial:false,maximumDamage:'재작업',agentType:'업무지원 Agent (규칙형)',autonomy:'L1'},historicalDocuments:{3:{documents:{ARD:{status:'complete',fields:{'overview.name':'테스트 Agent'}}}}}};
  const versions=[{document_type:'DES',lifecycle_phase:'design',version_number:1,original_name:'design.md',author_name:'개발자',created_at:'2026-09-07T00:00:00Z',checksum_sha256:'a'.repeat(64),content_markdown:'# DES 원문'},{document_type:'EVD',lifecycle_phase:'development_evaluation',version_number:2,original_name:'evd.md',author_name:'개발자',created_at:'2026-09-08T00:00:00Z',checksum_sha256:'b'.repeat(64),content_markdown:'# EVD 원문'}];
  const design=buildCumulativeMarkdown(project,state,'design',[]);assert.match(design,/요구 접수서\[INT\]/);assert.match(design,/타당성 평가서\[FEA\]/);assert.match(design,/에이전트 요구사항 정의서\[ARD\]/);assert.doesNotMatch(design,/DES 원문/);
  const development=buildCumulativeMarkdown(project,state,'development_evaluation',versions.slice(0,1));assert.match(development,/DES 원문/);assert.doesNotMatch(development,/EVD 원문/);
  const rollout=buildCumulativeMarkdown(project,state,'deployment_rollout',versions);assert.match(rollout,/DES 원문/);assert.match(rollout,/EVD 원문/);assert.match(rollout,/G3/);
});
