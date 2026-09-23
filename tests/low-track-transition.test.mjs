import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendingLowTrackDevelopment} from '../shared/low-track-transition.mjs';
test('pending legacy low track is migrated once preserving documents and G1, never operating projects',()=>{
 const before={journeyStep:9,lowRoute:{enabled:true,phase:'registration'},g1Resolution:{decision:'CONDITIONAL'},developerIds:['5'],nativeAgentArtifacts:{INT:{version:3}},workflowApprovals:{G1:{team_leader:{decision:'APPROVED'}}}};
 const after=pendingLowTrackDevelopment(before,'2026-09-23T00:00:00Z');
 assert.equal(after.journeyStep,5);assert.equal(after.deliveryPhase,'development');assert.equal(after.lowRoute.phase,'development');
 assert.deepEqual(after.workflowApprovals,before.workflowApprovals);assert.deepEqual(after.nativeAgentArtifacts,before.nativeAgentArtifacts);
 assert.equal(before.journeyStep,9);assert.equal(pendingLowTrackDevelopment(after),null);
 assert.equal(pendingLowTrackDevelopment({...before,lowRoute:{enabled:true,phase:'operating'}}),null);
 assert.equal(pendingLowTrackDevelopment({...before,lowRoute:{enabled:true,phase:'ready',deployedAt:'2026-09-22'}}),null);
 assert.throws(()=>pendingLowTrackDevelopment({...before,developerIds:[]}),/담당자/);
 assert.throws(()=>pendingLowTrackDevelopment({...before,workflowApprovals:{G3:{team_leader:{decision:'APPROVED'}}}}),/후속 승인/);
});
test('low-track presentation skips only ARD, G2 and design and no longer offers direct deployment',()=>{
 const ui=readFileSync(new URL('../app/workflow-v31.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes("low&&([3,4].includes(n.step)||(n.step===5&&n.phase==='design'))"));
 assert.ok(ui.includes('G3 배포 승인 → 배포·확산 → G4 확산 승인'));
 assert.ok(!ui.includes("lowRouteAction:'deploy'"));
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.ok(page.includes("[3,4].includes(selectedJourney)||(selectedJourney===5&&selectedDeliveryPhase==='design')"));
});
