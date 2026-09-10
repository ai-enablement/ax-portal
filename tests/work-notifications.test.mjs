import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkNotifications, filterProjectList } from "../shared/work-notifications.mjs";

test('historical supplementation notifies only assigned developers, including assigned admins', () => {
 const project={...base,historicalImport:true,journeyStep:5,deliveryPhase:'design',developerIds:['21',2]};
 for(const actor of [{id:'21',appRole:'team_member'},{id:'2',appRole:'admin'}]) {
  const alerts=buildWorkNotifications([project],actor);
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].title,'과거 과제 이관 보완');
  assert.equal(alerts[0].deliveryPhase,'design');
 }
 for(const actor of [{id:'3',appRole:'admin'},{id:'11',appRole:'general_user'},{id:'12',appRole:'general_user'},{id:'1',appRole:'team_leader'}])assert.equal(buildWorkNotifications([project],actor).length,0);
 assert.equal(buildWorkNotifications([{...project,developerIds:[]}],{id:'2',appRole:'admin'}).length,0);
 assert.ok(buildWorkNotifications([{...project,historicalImportFinalizedAt:'2026-09-08'}],{id:'21',appRole:'team_member'}).every(n=>n.title!=='과거 과제 이관 보완'));
});

test('my work filters solely by developer assignment, not owner, admin or status',()=>{
 const projects=[{...base,no:'1',developerIds:['21'],status:'진행 중'},{...base,no:'2',developerIds:['22'],status:'내 작성 필요',requesterId:'21'}, {...base,no:'3',developerIds:[21,'22'],status:'완료'},{...base,no:'4',developerIds:[],ownerId:'21'}];
 assert.deepEqual(filterProjectList(projects,'내 할 일','21').map(p=>p.no),['1','3']);
 assert.deepEqual(filterProjectList(projects,'내 할 일','99'),[]);
 assert.deepEqual(filterProjectList(projects,'내 할 일',undefined),[]);
 assert.deepEqual(filterProjectList(projects,'내 할 일',''),[]);
 assert.equal(filterProjectList(projects,'전체','21').length,4);
});

test('open historical imports suppress every external role at every stage, even assigned developers',()=>{
 for(let journeyStep=0;journeyStep<=9;journeyStep++){
  const project={...base,historicalImport:true,journeyStep,developerIds:['11','12','21','31','41'],securityReviewerId:'41',fastTrack:{status:'REQUESTED'}};
  for(const actor of [{id:'11',appRole:'general_user'},{id:'12',appRole:'general_user'},{id:'21',appRole:'bts'},{id:'31',appRole:'bp_solution'},{id:'41',appRole:'general_user'}]){
   assert.deepEqual(buildWorkNotifications([project],actor),[],`${journeyStep}/${actor.appRole}`);
  }
  for(const appRole of ['team_member','team_leader','admin']){
   assert.equal(buildWorkNotifications([project],{id:'21',appRole})[0].title,'과거 과제 이관 보완');
  }
 }
});

test('finalized historical imports resume actual external document and approval assignments',()=>{
 const imported={...base,historicalImport:true,historicalImportFinalizedAt:'2026-09-09'};
 for(const appRole of ['bts','bp_solution'])assert.deepEqual(buildWorkNotifications([imported],{id:'21',appRole}),[]);
 for(const appRole of ['admin','team_leader'])assert.equal(buildWorkNotifications([imported],{id:'31',appRole})[0].title,'ARD 요구 정의 작성');
 const g2={...imported,journeyStep:4};
 for(const actor of [{id:'11',appRole:'general_user'},{id:'12',appRole:'general_user'},{id:'31',appRole:'team_leader'}])assert.equal(buildWorkNotifications([g2],actor)[0].title,'G2 승인 요청');
 assert.deepEqual(buildWorkNotifications([g2],{id:'99',appRole:'general_user'}),[]);
});

const base = {
  no: "2026-101",
  name: "회의 지원 Agent",
  source: "database",
  requesterId: "11",
  ownerId: "12",
  requesterEmail: "requester@changshininc.com",
  projectOwnerEmail: "owner@changshininc.com",
  developerIds: ["21"],
  journeyStep: 3,
};
test('INT belongs to requester for new projects and finalized historical imports',()=>{
 for(const historicalImport of [false,true]){
  const p={...base,journeyStep:0,historicalImport,historicalImportFinalizedAt:'2026-09-08'};
  const actors=[{id:'11',appRole:'general_user'},{id:'21',appRole:'team_member'},{id:'1',appRole:'admin'}];
  assert.deepEqual(actors.filter(a=>buildWorkNotifications([p],a).length).map(a=>a.id),['11']);
 }
});

test('G1 through G4 notify pending configured approval roles, never an unrelated admin',()=>{
 const actors=[{id:'11',appRole:'general_user'},{id:'12',appRole:'general_user'},{id:'21',appRole:'team_member'},{id:'31',appRole:'team_leader'},{id:'41',appRole:'team_member'},{id:'1',appRole:'admin'}];
 for(const [gate,journeyStep,expected] of [['G1',2,['31']],['G2',4,['11','12','31']],['G3',6,['31','41']],['G4',8,['12','31']]]){
  const p={...base,journeyStep,workflowTrack:'HIGH',securityReviewerId:'41',uatRecord:{completed:true}};
  assert.deepEqual(actors.filter(a=>buildWorkNotifications([p],a).length).map(a=>a.id),expected);
  p.g1Resolution={decision:'GO'};
  p.workflowApprovals={[gate]:Object.fromEntries(['requester','owner','team_leader','security_reviewer'].map(r=>[r,{decision:'APPROVED'}]))};
  assert.deepEqual(actors.filter(a=>buildWorkNotifications([p],a).length),[]);
 }
});
test('new FEA notifies privileged authors and never the requester',()=>{
 const project={...base,journeyStep:1};
 assert.equal(buildWorkNotifications([project],{id:'11',appRole:'general_user'}).length,0);
 assert.equal(buildWorkNotifications([project],{id:'31',appRole:'team_leader'})[0].journeyStep,1);
 assert.equal(buildWorkNotifications([project],{id:'12',appRole:'general_user'}).length,0);
 assert.equal(buildWorkNotifications([project],{id:'99',appRole:'general_user'}).length,0);
 assert.equal(buildWorkNotifications([{...project,feaCompleted:true}],{id:'11',appRole:'general_user'}).length,0);
});

test('new FEA targets recorded author; finalized historical FEA targets requester instead of importing admin',()=>{
 const actors=[{id:'11',appRole:'general_user'},{id:'12',appRole:'general_user'},{id:'21',appRole:'team_member'},{id:'22',appRole:'team_member'},{id:'1',appRole:'admin'},{id:'2',appRole:'team_leader'}];
 const recipients=p=>actors.filter(a=>buildWorkNotifications([p],a).length).map(a=>a.id);
 const p={...base,journeyStep:1,feaAuthor:{id:'22'}};
 assert.deepEqual(recipients(p),['1','2']);
 assert.deepEqual(recipients({...p,historicalImport:true,historicalImportFinalizedAt:'2026-09-08',feaAuthor:{id:'1'}}),['1','2']);
 assert.deepEqual(recipients({...p,feaAuthor:{id:'1'}}),['1','2']);
 assert.deepEqual(recipients({...p,historicalImport:true,historicalImportFinalizedAt:'2026-09-08',developerIds:[]}),['1','2']);
});

test('document work in new and historical projects targets assigned developers, including explicitly assigned admins',()=>{
 for(const historicalImport of [false,true])for(const [journeyStep,deliveryPhase] of [[3,undefined],[5,'design'],[5,'development'],[7,undefined]]){
  const p={...base,historicalImport,historicalImportFinalizedAt:'2026-09-08',journeyStep,deliveryPhase};
  assert.equal(buildWorkNotifications([p],{id:'1',appRole:'admin'}).length,journeyStep===3?1:0);
  assert.equal(buildWorkNotifications([p],{id:'22',appRole:'team_member'}).length,0);
  assert.equal(buildWorkNotifications([p],{id:'21',appRole:'team_member'}).length,journeyStep===3?0:1);
  assert.equal(buildWorkNotifications([p],{id:'21',appRole:'admin'}).length,1);
 }
});

test('all gate rework targets the document author and suspends pending approval notices',()=>{
 for(const [gate,journeyStep] of [['G1',2],['G2',4],['G3',6],['G4',8]]){
  const p={...base,journeyStep,feaAuthor:{id:'11'},uatRecord:{completed:true},workflowApprovals:{[gate]:{owner:{decision:'REWORK',reason:'보완 사유'}}}};
  const restricted=['G1','G2'].includes(gate);
  assert.equal(buildWorkNotifications([p],{id:restricted?'2':'21',appRole:restricted?'team_leader':'team_member'})[0].title,`${gate} 보완 요청 반영`);
  assert.equal(buildWorkNotifications([p],{id:'1',appRole:'admin'}).length,restricted?1:0);
  assert.equal(buildWorkNotifications([p],{id:'2',appRole:'team_leader'}).length,restricted?1:0);
 }
});
test('G3 still notifies requester until UAT is recorded',()=>{
 const project={...base,journeyStep:6,workflowTrack:'MEDIUM'};
 const actor={id:'11',appRole:'general_user'};
 assert.equal(buildWorkNotifications([project],actor)[0].title,'요구자 UAT 확인');
 assert.equal(buildWorkNotifications([project],actor)[0].journeyStep,6);
 assert.equal(buildWorkNotifications([{...project,uatRecord:{completed:true}}],actor).length,0);
});
test('one account with multiple G2 roles keeps an alert until every role has voted',()=>{
 const project={...base,journeyStep:4,ownerId:'11',projectOwnerEmail:base.requesterEmail,workflowApprovals:{G2:{requester:{decision:'APPROVED'}}}};
 const actor={id:'11',appRole:'general_user'};
 assert.equal(buildWorkNotifications([project],actor)[0].title,'G2 승인 요청');
 project.workflowApprovals.G2.owner={decision:'APPROVED'};
 assert.equal(buildWorkNotifications([project],actor).length,0);
});

test("leader receives the current ARD action and developers do not", () => {
  const assigned = buildWorkNotifications([base], { id: "21", appRole: "team_leader", email: "leader@changshininc.com" });
  const other = buildWorkNotifications([base], { id: "22", appRole: "team_member", email: "other@changshininc.com" });
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].title, "ARD 요구 정의 작성");
  assert.equal(assigned[0].journeyStep, 3);
  assert.equal(other.length, 0);
});

test("only the pending G2 approver sees an approval action", () => {
  const project = {
    ...base,
    journeyStep: 4,
    workflowApprovals: { G2: { requester: { decision: "APPROVED" } } },
  };
  assert.equal(buildWorkNotifications([project], { id: "11", appRole: "general_user", email: "requester@changshininc.com" }).length, 0);
  const owner = buildWorkNotifications([project], { id: "12", appRole: "general_user", email: "owner@changshininc.com" });
  assert.equal(owner.length, 1);
  assert.equal(owner[0].title, "G2 승인 요청");
});

test("a rework decision routes the assigned author directly to the preceding document", () => {
  const project = {
    ...base,
    journeyStep: 4,
    workflowApprovals: { G2: { owner: { decision: "REWORK", reason: "범위를 더 구체화해 주세요." } } },
  };
  const notifications = buildWorkNotifications([project], { id: "21", appRole: "team_leader", email: "leader@changshininc.com" });
  assert.equal(notifications[0].title, "G2 보완 요청 반영");
  assert.equal(notifications[0].journeyStep, 3);
  assert.match(notifications[0].body, /범위를 더 구체화/);
});

test("admin is notified to assign a developer after G1 approval", () => {
  const project = {
    ...base,
    journeyStep: 2,
    developerIds: [],
    g1Resolution: { decision: "GO", reason: "", assignee: "미배정" },
  };
  const notifications = buildWorkNotifications([project], { id: "1", appRole: "admin", email: "admin@changshininc.com" });
  assert.equal(notifications[0].title, "개발 담당자 배정");
  assert.equal(notifications[0].journeyStep, 2);
});

test("local or completed projects do not create work alerts", () => {
  const local = { ...base, source: undefined };
  const complete = { ...base, journeyStep: 9, lowRoute: { enabled: false, phase: "operating" } };
  assert.deepEqual(buildWorkNotifications([local, complete], { id: "21", appRole: "team_member", email: "dev@changshininc.com" }), []);
});

test("Fast Track owner notice remains an action until it is recorded", () => {
  const project = {
    ...base,
    journeyStep: 5,
    deliveryPhase: "development",
    fastTrack: { requested: true, status: "GF_APPROVED" },
  };
  const actor = { id: "1", appRole: "team_leader", email: "leader@changshininc.com" };
  assert.equal(buildWorkNotifications([project], actor)[0].title, "Project Owner 통보 기록");
  project.fastTrack = { ...project.fastTrack, ownerNotifiedAt: "2026-09-07T00:00:00.000Z" };
  assert.equal(buildWorkNotifications([project], actor).length, 0);
});
