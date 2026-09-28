import test from 'node:test';
import assert from 'node:assert/strict';
import {MASTER_COLUMNS,masterCells,filterRpaRequests,projectHistory,isRpaRunDay} from '../shared/rpa-display.mjs';
test('weekday badges distinguish explicit run flags from blanks and negative strings',()=>{
 for(const value of ['O','o','○',true,'Y','1'])assert.equal(isRpaRunDay(value),true);
 for(const value of [null,undefined,'','X','N','false',false,'0'])assert.equal(isRpaRunDay(value),false);
});
test('master columns preserve source schema including schedule and deployment',()=>{
 const p={code:'HQ-1',name:'A',pics:['PIC'],fields:{'주기':'일','현업배포일자':'2026-09-01','실행 방법':'스케줄','실행 시간':'10:00','실행일':'주중','월':'O'}};
 assert.equal(MASTER_COLUMNS.length,13);assert.equal(masterCells(p)[7],'일');assert.equal(masterCells(p)[9],'2026-09-01');assert.match(masterCells(p)[12],/10:00\n주중\n월/);
});
test('project filtering uses unique ID even with duplicate source codes',()=>{
 const rows=[{id:'1',projectId:'a',priority:'urgent',status:'held'},{id:'2',projectId:'b',priority:'normal',status:'working'}];
 assert.deepEqual(filterRpaRequests(rows,{projectId:'a',priority:'urgent',status:'held'}).map(r=>r.id),['1']);
 assert.equal(filterRpaRequests(rows,{projectId:'a',priority:'normal'}).length,0);
});
test('history aggregates only the selected project without fictional import events',()=>{
 const p={id:'a'},rows=[{id:'1',projectId:'a',history:[{kind:'created',at:'2026-09-01',label:'접수'}]},{id:'2',projectId:'b',history:[{at:'2026-09-02'}]}];
 assert.equal(projectHistory(p,rows).length,1);assert.equal(projectHistory(p,[]).length,0);
});
