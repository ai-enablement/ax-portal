import test from 'node:test';
import assert from 'node:assert/strict';
import {dayTimes,validTimes,scheduleSummary,applySchedulePreset,RPA_DAYS} from '../shared/rpa-schedule.mjs';
test('presets synchronize cycle and day category while preserving times and execution method',()=>{
 const original={주기:'월',실행일:'첫째 월요일','월 실행 시간':'15:00','실행 방법':'수동'};
 const weekdays=applySchedulePreset(original,RPA_DAYS.slice(0,5));
 assert.equal(weekdays.주기,'일');assert.equal(weekdays.실행일,'주중');assert.equal(weekdays.금,'O');assert.equal(weekdays.토,'');
 const daily=applySchedulePreset(weekdays,RPA_DAYS);
 assert.equal(daily.주기,'일');assert.equal(daily.실행일,'매일');assert.equal(daily.일,'O');
 const cleared=applySchedulePreset(daily,[]);
 assert.equal(cleared.주기,'');assert.equal(cleared.실행일,'');assert.ok(RPA_DAYS.every(d=>cleared[d]===''));
 for(const fields of [weekdays,daily,cleared]){assert.equal(fields['월 실행 시간'],'15:00');assert.equal(fields['실행 방법'],'수동');}
 assert.equal(original.주기,'월');
});
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
