import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {homeProjectList,isOngoingProject,projectNumberBadge,PROJECT_LIST_FILTERS,projectListFilters} from '../shared/project-list.mjs';
const actor={id:'7',appRole:'admin'};
test('non-AI users have only ongoing and all tabs with ongoing as default',()=>{
 assert.deepEqual(projectListFilters(false),['진행 중','전체']);
 assert.deepEqual(projectListFilters(true),PROJECT_LIST_FILTERS);
 assert.equal(projectListFilters(true)[0],'내 진행 중 과제');
});
const items=[
 {no:'2026-033',name:'나',journeyStep:1,requesterId:'7',progress:11,requestedDate:'2026-10-01'},
 {no:'2026-044',name:'가',journeyStep:5,ownerId:'7',progress:50,committedDate:'2026-09-15'},
 {no:'2026-002',name:'다',journeyStep:3,developerIds:['7'],progress:30},
 {no:'2026-001',name:'라',journeyStep:9,requesterId:'7',progress:100},
 {no:'2026-045',name:'마',journeyStep:4,developerIds:['8'],progress:40},
 {no:'2026-003',name:'바',journeyStep:6,securityReviewerId:'7',progress:60}
];
test('default is my ongoing projects; all is last; admin is not automatically assigned',()=>{
 assert.equal(PROJECT_LIST_FILTERS[0],'내 진행 중 과제');assert.equal(PROJECT_LIST_FILTERS.at(-1),'전체');
 assert.deepEqual(homeProjectList(items,'내 진행 중 과제',actor).map(p=>p.no),['2026-002']);
 assert.equal(PROJECT_LIST_FILTERS[1],'내 과제(전체)');
 const withCompleted=[...items,{no:'2026-006',journeyStep:9,developerIds:[7],status:'완료'}];
 assert.deepEqual(homeProjectList(withCompleted,'내 과제(전체)',actor).map(p=>p.no),['2026-006','2026-002']);
 assert.deepEqual(homeProjectList(withCompleted,'내 진행 중 과제',actor).map(p=>p.no),['2026-002']);
 assert.deepEqual(homeProjectList(withCompleted,'내 과제(전체)',{id:'99',appRole:'admin'}),[]);
 assert.deepEqual(homeProjectList(items,'내 할 일',actor).map(p=>p.no),['2026-002']);
 assert.equal(homeProjectList(items,'내 진행 중 과제',{id:'99',appRole:'admin'}).length,0);
 assert.equal(homeProjectList(items,'전체',actor).length,6);
 assert.equal(homeProjectList(items,'진행 중',actor).length,5);
 assert.equal(isOngoingProject({journeyStep:9,lowRoute:{enabled:true,phase:'registered'}}),true);
 assert.equal(isOngoingProject({journeyStep:9,lowRoute:{enabled:true,phase:'operating'}}),false);
 assert.equal(isOngoingProject({journeyStep:9,historicalImport:true}),true);
});
test('all sort modes are deterministic, leave source untouched, put unknown deadlines last',()=>{
 const original=structuredClone(items);
 assert.equal(homeProjectList(items,'전체',actor,'최신 과제순')[0].no,'2026-045');
 assert.equal(homeProjectList(items,'전체',actor,'과제번호순')[0].no,'2026-001');
 assert.equal(homeProjectList(items,'전체',actor,'이름순')[0].name,'가');
 assert.equal(homeProjectList(items,'전체',actor,'진행률순')[0].progress,11);
 assert.deepEqual(homeProjectList(items,'전체',actor,'마감 임박순').slice(0,2).map(p=>p.no),['2026-044','2026-033']);
 assert.deepEqual(items,original);
 assert.equal(projectNumberBadge('2026-033'),'033');assert.equal(projectNumberBadge('LEGACY'),'LEGACY');
});
test('drawer uses default personal filter, sort control and project number rather than row index',async()=>{
 const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(source,/\[filter, setFilter\] = useState\(\(\)=>projectListFilters\(isAiTeam\)\[0\]\)/);
 const list=source.slice(source.indexOf('<ProjectListDrawer'),source.indexOf('</ProjectListDrawer>'));
 assert.match(list,/availableProjectFilters.map/);assert.match(list,/과제 목록 정렬/);
 assert.match(list,/projectNumberBadge\(project.no\)/);assert.doesNotMatch(list,/index \+ 1/);
});
