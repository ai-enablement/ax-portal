import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoryChange,PROJECT_CATEGORY_OPTIONS} from '../shared/project-category.mjs';
const actor={id:4,display_name:'Leader',app_role:'team_leader'};
const change={previousCategory:'미정',category:'개별 접수'};
test('only leader and admin classify projects from G1 onwards',()=>{
 for(const app_role of ['general_user','team_member','bts','bp_solution',undefined])assert.throws(()=>categoryChange('미정',change,{...actor,app_role},'G1'),{status:403});
 for(const stage of ['INT','FEA','unknown'])assert.throws(()=>categoryChange('미정',change,actor,stage),{status:409});
 for(const app_role of ['admin','team_leader'])for(const stage of ['G1','ARD','G2','DES','G3','PILOT','G4','OPS'])assert.equal(categoryChange('미정',change,{...actor,app_role},stage).after,'개별 접수');
});
test('category changes validate options, stale state and retain audit identity',()=>{
 for(const category of PROJECT_CATEGORY_OPTIONS)assert.equal(categoryChange('미정',{...change,category},actor,'G1').after,category);
 assert.throws(()=>categoryChange('D2B',change,actor,'G1'),{status:409});
 assert.throws(()=>categoryChange('미정',{...change,category:'미정'},actor,'G1'),{status:400});
 assert.throws(()=>categoryChange('개별 접수',{...change,previousCategory:'개별 접수'},actor,'G1'),{status:400});
 assert.deepEqual(categoryChange('미정',change,actor,'G1','2026-09-16'),{before:'미정',after:'개별 접수',actorId:'4',actorName:'Leader',at:'2026-09-16'});
});
test('pending intake, G2-only panels and party summary are wired',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const api=read('../server/database-api.mjs'),page=read('../app/page.tsx');
 assert.match(api,/const category = actor.app_role === "general_user"\s*\? "미정"/);
 assert.ok(!api.includes('merged.category = "개별 접수"'));
 assert.match(page,/selectedJourney===4&&<ProjectDeadline/);
 assert.match(page,/selectedJourney===4&&<DeveloperAssignment/);
 const strip=page.slice(page.indexOf('aria-label="프로젝트 일정 추적"'),page.indexOf('<HistoricalAdmin'));
 for(const label of ['요구자','Project Owner','개발 담당자'])assert.ok(strip.includes(label));
 assert.ok(!strip.includes('current.scheduleState'));
 assert.ok(read('../database/postgresql/20260916_project_category_pending.sql').includes("'미정'"));
});
