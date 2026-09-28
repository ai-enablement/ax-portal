import test from 'node:test';
import assert from 'node:assert/strict';
import {developerOptions,splitDevelopers} from '../shared/rpa-developers.mjs';
test('governance roster and existing developers merge without repeated names',()=>{
 assert.deepEqual(developerOptions([{developer:'임동수 (수석) / 김철수'},{developer:'김철수'}],['임동수','박영희',' 임동수 ']),['김철수','박영희','임동수']);
});
test('multiple developers preserve English comma names and roundtrip',()=>{
 assert.deepEqual(splitDevelopers('Lee, Jaeseung / 임동수'),['Lee, Jaeseung','임동수']);
 assert.equal(developerOptions([{developer:'Lee, Jaeseung'}],['lee, jaeseung']).length,1);
 assert.deepEqual(splitDevelopers('박한성, 김주형 / VJIT, 김혜민'),['박한성','김주형','VJIT','김혜민']);
});
