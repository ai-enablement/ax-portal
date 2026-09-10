import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('importing projects use common gates, retain recorded data and cannot cast votes',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const gate=await readFile(new URL('../app/workflow-v31.jsx',import.meta.url),'utf8');
 assert.match(page,/current.source === "database" && \[2,4,6,8\].includes\(selectedJourney\) \? \(/);
 assert.doesNotMatch(page,/project\.committedDate\.includes/);
 assert.match(gate,/active=!importing&&project.journeyStep===expected/);
 assert.match(gate,/등록된 승인 이력/);
 assert.match(gate,/historicalRecord\.values/);
 assert.match(gate,/project\.committedDate\|\|'미등록'/);
});
