import test from 'node:test';
import assert from 'node:assert/strict';
import {dayTimes,validTimes,scheduleSummary} from '../shared/rpa-schedule.mjs';
test('legacy range and adjacent clauses resolve to weekday times',()=>{
 const f={월:'O',화:'O',수:'O',목:'O',금:'O','실행 시간':'월~목 :15:00금 :15:30'};
 assert.deepEqual(dayTimes(f),{월:'15:00',화:'15:00',수:'15:00',목:'15:00',금:'15:30',토:'',일:''});
});
test('explicit day times override legacy; disabled days never execute',()=>{
 const f={월:'O',금:'O','실행 시간':'10:00','월 실행 시간':'09:00, 15:00','금 실행 시간':'','토 실행 시간':'11:00'};
 assert.equal(dayTimes(f).월,'09:00, 15:00');assert.equal(dayTimes(f).금,'');assert.equal(dayTimes(f).토,'');
 assert.match(scheduleSummary(f),/금: 시간 미등록/);
});
test('ambiguous legacy prose is not guessed and invalid times rejected',()=>{
 assert.equal(dayTimes({월:'O','실행 시간':'APPS'}).월,'');
 for(const t of ['24:00','12:60','tomorrow','09:00, 25:00'])assert.equal(validTimes(t),false);
 assert.equal(validTimes('09:00, 15:30'),true);
});
