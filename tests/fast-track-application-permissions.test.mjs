import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canRequestFastTrack,assertFastTrackApplicant} from '../shared/fast-track.mjs';

test('only Admin and team leader can request Fast Track; normal registration stays available',()=>{
 for(const role of ['admin','team_leader','team_member','general_user','bts','bp_solution',undefined]){
  const allowed=['admin','team_leader'].includes(role);
  assert.equal(canRequestFastTrack(role),allowed);
  assert.doesNotThrow(()=>assertFastTrackApplicant({},role));
  assert.doesNotThrow(()=>assertFastTrackApplicant({fastTrack:{requested:false}},role));
  if(allowed)assert.doesNotThrow(()=>assertFastTrackApplicant({fastTrack:{requested:true}},role));
  else assert.throws(()=>assertFastTrackApplicant({fastTrack:{requested:true}},role),error=>error.status===403);
 }
});

test('request UI and persisted creation enforce the same Fast Track policy',()=>{
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const api=fs.readFileSync(new URL('../server/database-api.mjs',import.meta.url),'utf8');
 assert.ok(page.includes('!isHistorical && canApplyFastTrack && ('));
 assert.ok(page.includes('fastTrackRequest: !isHistorical && canApplyFastTrack && fastTrackRequested'));
 assert.ok(api.includes('assertFastTrackApplicant(submittedState, actor.app_role)'));
});
