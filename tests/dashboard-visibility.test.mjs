import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardInternalRoles,dashboardScopeFor,dashboardView,dashboardProjects} from '../shared/dashboard-visibility.mjs';
import {listLeaderDashboardProjects} from '../server/database-api.mjs';
const projects=[{no:'mine',isPersonalProject:true,category:'일반'},{no:'own-d2b',isPersonalProject:true,category:'D2B'},{no:'other-d2b',isPersonalProject:false,category:'D2B'},{no:'other',isPersonalProject:false,category:'일반'}];
test('internal roles retain their existing tabs, filters and scope even if D2B registered',()=>{
 for(const role of dashboardInternalRoles)for(const assignment of ['all','D2B']){
  const scope=dashboardScopeFor(role,assignment);assert.equal(scope,'all');
  assert.equal(dashboardView(scope).developerFilter,true);assert.equal(dashboardView(scope).ending,true);
  assert.equal(dashboardProjects(projects,scope,'전체').length,4);
 }
});
test('personal All and D2B tabs have independent scopes and controls',()=>{
 for(const scope of ['personal','D2B']){
  assert.deepEqual(dashboardProjects(projects,scope,'전체').map(p=>p.no),['mine','own-d2b']);
  assert.equal(dashboardView(scope).developerFilter,false);assert.equal(dashboardView(scope).ending,false);
 }
 assert.deepEqual(dashboardView('personal','D2B').tabs,['전체']);assert.equal(dashboardView('personal','D2B').category,'전체');
 assert.deepEqual(dashboardView('D2B').tabs,['전체','D2B']);
 assert.deepEqual(dashboardProjects(projects,'D2B','D2B').map(p=>p.no),['own-d2b','other-d2b']);
 assert.equal(dashboardView('D2B','D2B').ending,true);assert.equal(dashboardView('D2B','D2B').developerFilter,false);
});
test('dashboard API uses authenticated ID and DB assignment, not client scope; returns summaries only',async()=>{
 for(const assigned of [false,true]){
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});return sql.includes('d2b_dashboard_access')?{rows:assigned?[{id:1}]:[]}:{rows:[{no:'mine',name:'Project',category:'D2B',personal:true,created:'2026-09-01',stage:'ARD',state:{receivedDate:'2026-09-01',requesterEmail:'secret',markdownDocuments:{private:true}},developers:['Dev']}]};}};
  const result=await listLeaderDashboardProjects({dashboardScope:'all'},{pool,findUser:async()=>({id:42,email:'user@example.com',app_role:'general_user',is_active:true})});
  assert.equal(result.body.dashboardScope,assigned?'D2B':'personal');
  assert.deepEqual(calls[1].params,[42,assigned]);
  assert.match(calls[1].sql,/p.requester_id=\$1 or p.owner_id=\$1 or exists\(select 1 from agent_portal.project_members party where party.project_id=p.id and party.user_id=\$1 and party.relationship='owner' and party.ended_at is null\) or \(\$2::boolean and p.project_category='D2B'\)/);
  assert.equal(result.body.projects[0].isPersonalProject,true);
  assert.doesNotMatch(JSON.stringify(result.body),/secret|markdownDocuments|private/);
 }
});
test('inactive accounts are denied and internal users reuse existing project API',async()=>{
 const pool={query:async()=>({rows:[]})};
 assert.equal((await listLeaderDashboardProjects({}, {pool,findUser:async()=>({is_active:false})})).status,403);
 for(const app_role of dashboardInternalRoles){
  const result=await listLeaderDashboardProjects({}, {pool,findUser:async()=>({id:1,is_active:true,app_role}),listOperationalProjects:async()=>({status:200,body:{projects:[{no:'existing'}]}})});
  assert.equal(result.body.dashboardScope,'all');assert.equal(result.body.projects[0].no,'existing');
 }
});
