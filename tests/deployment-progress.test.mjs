import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentCompleted,effectiveProgress,completeDeploymentProgress} from '../shared/deployment-progress.mjs';
import {saveProjectProgress} from '../server/project-progress.mjs';
import {leaderDashboardScope} from '../server/leader-dashboard-access.mjs';
import {readFileSync} from 'node:fs';
test('deployment completion, not G3 approval or upload, drives automatic 100%',()=>{
 for(const journeyStep of [5,6,7])assert.equal(deploymentCompleted({journeyStep}),false);
 for(const journeyStep of [8,9])assert.equal(effectiveProgress({journeyStep,manualProgress:40}),100);
 assert.equal(deploymentCompleted({journeyStep:8,historicalImport:true}),false);
 assert.equal(deploymentCompleted({journeyStep:8,historicalImport:true,historicalImportFinalizedAt:'2026-09-29'}),true);
 for(const status of ['draft',undefined])assert.equal(deploymentCompleted({journeyStep:7,markdownDocuments:{EVD:{phases:{deployment_rollout:{version:2,status}}}}}),false);
 assert.equal(deploymentCompleted({journeyStep:7,markdownDocuments:{EVD:{phases:{deployment_rollout:{version:2,status:'complete'}}}}}),true);
});
test('automatic progress persists a single history entry and preserves approvals',()=>{
 const state={journeyStep:8,manualProgress:45,progressRevision:2,workflowApprovals:{G3:{approved:true}}};
 const actor={id:7,display_name:'Developer'};
 const entry=completeDeploymentProgress(state,actor,'2026-09-29T00:00:00Z');
 assert.equal(state.manualProgress,100);assert.equal(state.progressRevision,3);assert.equal(entry.previousPercent,45);
 assert.equal(entry.source,'deployment_completion');assert.equal(state.workflowApprovals.G3.approved,true);
 assert.equal(completeDeploymentProgress(state,actor),null);assert.equal(state.progressHistory.length,1);
});
test('manual API rejects lowering completed progress without any write',async()=>{
 const queries=[];
 const client={query:async sql=>{queries.push(sql);return {rows:[{ok:1}]};}};
 const result=await saveProjectProgress(client,{id:1,runtime_state:{journeyStep:8,manualProgress:100}},{id:7,app_role:'team_member'},{percent:20,note:'',expectedRevision:0});
 assert.equal(result.status,409);assert.equal(queries.length,1);
});
test('D2B access requires an active exact email assignment from the database',async()=>{
 const client={query:async(sql,[email])=>{assert.match(sql,/is_active=true/);return {rows:['owner1@example.com','owner2@example.com'].includes(email)?[{id:1}]:[]};}};
 assert.equal(await leaderDashboardScope({email:'owner1@EXAMPLE.COM'},client),'D2B');
 assert.equal(await leaderDashboardScope({email:'owner2@example.com'},client),'D2B');
 for(const email of ['other@example.com','owner1@example.com.attacker','',undefined])assert.equal(await leaderDashboardScope({email},client),'all');
 assert.equal(await leaderDashboardScope({email:'owner1@example.com'},{query:async()=>({rows:[]})}),'all');
});
test('dashboard endpoint scopes D2B in SQL and UI hides developer filters',()=>{
 const server=readFileSync(new URL('../server/database-api.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/leader-dashboard.jsx',import.meta.url),'utf8');
 assert.match(server,/p\.deleted_at is null and \(p\.requester_id=\$1 or p\.owner_id=\$1 or exists\(select 1 from agent_portal.project_members party where party.project_id=p.id and party.user_id=\$1 and party.relationship='owner' and party.ended_at is null\) or \(\$2::boolean and p\.project_category='D2B'\)\)/);
 assert.match(server,/const automaticProgress=completeDeploymentProgress\(merged,actor\)/);
 assert.match(ui,/fetch\('\/api\/database\/leader-dashboard'/);
 assert.match(ui,/options.tabs.map/);
 assert.match(ui,/options.developerFilter&&<div className="ld-filter-row"><b>개발자/);
 assert.match(ui,/className="ld-today-key"/);
});
test('approved Shari and Naomi accounts are seeded once, not hardcoded in access checks',async()=>{
 const migration=readFileSync(new URL('../database/postgresql/20260929_d2b_dashboard_access.sql',import.meta.url),'utf8');
 assert.match(migration,/if initialize then/);
 const client={query:async(sql,[email])=>({rows:['shari.kim@changshininc.com','naomi.kim@changshininc.com'].includes(email)?[{id:1}]:[]})};
 for(const email of ['shari.kim@changshininc.com','NAOMI.KIM@CHANGSHININC.COM']){
  const actor={email,app_role:'general_user'};
  assert.match(migration,new RegExp(email.toLowerCase().replaceAll('.','\\.')));
  assert.equal(await leaderDashboardScope(actor,client),'D2B');
  assert.equal(actor.app_role,'general_user');
 }
 for(const email of ['shari.kim@changshininc.com.attacker','someone@changshininc.com','naomi.kim@other.com'])assert.equal(await leaderDashboardScope({email},client),'all');
 assert.equal(await leaderDashboardScope({display_name:'Kim, Shari'},client),'all');
});
