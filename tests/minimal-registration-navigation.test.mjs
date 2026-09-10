import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('registration handler opens the exact server-assigned project in INT, not the prior project',async()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const start=page.indexOf('  const submitAgentRequest = async ('),end=page.indexOf('\n  return (',start);
 const javascript=ts.transpileModule(page.slice(start,end)+'\nglobalThis.submit = submitAgentRequest;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const role of ['general_user','admin','team_leader']){
  let target='2026-033',view='home',stored=[],payload;
  const ctx=vm.createContext({role,ACCOUNT_ROLES:{user:'general_user'},teamAccounts:[],userJourney:Array.from({length:10},()=>({kind:'stage',title:'요구 접수'})),crypto,
   fetch:async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({project:{...payload.project,no:'2026-999',source:'database'}})};},
   setSubmittedProjects:fn=>{stored=fn([]);},setWorkflowTarget:value=>{target=value;},setView:value=>{view=value;},setDeletedProjectNos(){},setProjectOverrides(){},notify(){},window:{localStorage:{removeItem(){}}}});
  vm.runInContext(javascript,ctx);
  assert.equal(await ctx.submit([], '최소 등록 검증', '', '검증 사용자',{historical:false,registrationEntry:'INT_AGENT',category:'개별 접수',requesterEmail:'test@example.invalid',projectOwnerEmail:'',ownerMode:'OTHER'}),true);
  assert.equal(target,'2026-999');assert.equal(view,'intake');assert.equal(stored[0].no,target);
  assert.equal(payload.project.intakeDraftCompleted,false);assert.equal(payload.project.registrationEntry,'INT_AGENT');
 }
});
