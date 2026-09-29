import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkNotifications} from '../shared/work-notifications.mjs';
import {pilotEvidenceLocked} from '../shared/pilot-review.mjs';
import {mailKey,currentJobPayload} from '../server/work-mail.mjs';
const base={no:'2026-101',name:'Test',source:'database',journeyStep:8,ownerId:'2',developerIds:['3'],markdownDocuments:{EVD:{phases:{deployment_rollout:{version:2,status:'complete'}}}}};
const owner={id:'2',appRole:'general_user'},leader={id:'4',appRole:'team_leader'},developer={id:'3',appRole:'team_member'};
test('G4 alerts wait for pilot submission; a resubmission has a distinct mail key',()=>{
 for(const actor of [owner,leader])assert.deepEqual(buildWorkNotifications([base],actor),[]);
 assert.equal(buildWorkNotifications([base],developer)[0].title,'G4 파일럿 근거 작성');
 const ready={...base,gateChecks:{G4:{criteriaPassed:true,evidence:'검증 완료',submittedAt:'2026-09-29T01:00:00Z'}}};
 assert.equal(pilotEvidenceLocked(ready),true);
 for(const actor of [owner,leader])assert.equal(buildWorkNotifications([ready],actor)[0].title,'G4 승인 요청');
 const first=buildWorkNotifications([ready],owner)[0];
 const rejected={...ready,workflowApprovals:{G4:{owner:{decision:'REWORK',reason:'보완'}}}};
 assert.equal(pilotEvidenceLocked(rejected),false);
 assert.deepEqual(buildWorkNotifications([rejected],leader),[]);
 assert.match(buildWorkNotifications([rejected],developer)[0].title,/보완/);
 const next={...ready,gateChecks:{G4:{...ready.gateChecks.G4,submittedAt:'2026-09-29T02:00:00Z'}}};
 assert.notEqual(mailKey(first),mailKey(buildWorkNotifications([next],owner)[0]));
 assert.deepEqual(buildWorkNotifications([{...ready,markdownDocuments:{}}],owner),[]);
});
test('queued premature G4 approval mail is cancelled after rechecking current prerequisites',async()=>{
 const client={query:async()=>({rows:[{id:2,email:'owner@example.com',app_role:'general_user',is_active:true}]})};
 assert.equal(await currentJobPayload(client,{actor_id:2,notification_key:'old-key'},{},async()=>({status:200,body:{projects:[base]}})),null);
});
