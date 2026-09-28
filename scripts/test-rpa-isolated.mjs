// Integration checks use connection-local TEMP tables only. No persistent data changes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setRpaVisibility} from '../server/rpa-visibility.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';
import {listRpa,createRpaRequest,linkRpaPic,readRpaFile,updateRpaPics} from '../server/rpa-portal.mjs';
import {updateRpaRequest,createRpaMaster,updateRpaMaster,deleteRpaMaster} from '../server/rpa-management.mjs';
import {runRpaMailCycle} from '../server/rpa-mail.mjs';
const pool=getPool(),client=await pool.connect(),originalQuery=pool.query,originalConnect=pool.connect;
let checks=0;
try{
 await client.query('create temp table users(id bigint primary key,email text,display_name text,app_role text,is_active boolean)');
 for(const t of ['rpa_projects','rpa_pic_links','rpa_pic_history','rpa_requests','rpa_request_files'])await client.query(`create temp table ${t}(like agent_portal.${t} including all)`);
 const roles=['admin','team_leader','team_member','general_user','bts','bp_solution'];
 for(const [i,role]of roles.entries())await client.query('insert into pg_temp.users values($1,$2,$3,$4,true)',[i+1,`${role}@example.invalid`,role,role]);
 await client.query('alter table pg_temp.users add column shared_account_id bigint');
 const p={id:'test:1',code:'QA-001',name:'Isolated fixture',pics:['PIC'],fields:{},sourceRow:2};
 await client.query('insert into pg_temp.rpa_projects(id,project_code,payload,source_hash) values($1,$2,$3,$4)',[p.id,p.code,p,'test']);
 const query=(sql,args)=>client.query(sql.replaceAll('agent_portal.','pg_temp.'),args);
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const identity=role=>({email:`${role}@example.invalid`,appRole:'admin'});
 const nodeEnv=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='development';
  const preview={...identity('admin'),source:'development',canSwitchRole:true,appRole:'general_user'};
  const previewData=await listRpa(preview);assert.equal(previewData.canReadAll,false);assert.equal(previewData.canLink,false);assert.equal(previewData.projects.length,0);checks+=3;
  assert.equal((await listRpa({...preview,source:'entra'})).canReadAll,true);checks++;
  assert.equal((await listRpa({...preview,canSwitchRole:false})).canReadAll,true);checks++;
  process.env.NODE_ENV='production';
  assert.equal((await listRpa(preview)).canReadAll,true);checks++;
 }finally{if(nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=nodeEnv;}
 for(const role of roles){const d=await listRpa(identity(role));assert.equal(d.projects.length,['admin','team_leader','team_member'].includes(role)?1:0);checks++;}
 for(const deniedRole of ['general_user','bts','bp_solution']) await assert.rejects(()=>linkRpaPic(identity(deniedRole),{projectId:p.id,pic:'PIC',email:'general_user@example.invalid',reason:'test'}),e=>e.status===403);checks++;
 await linkRpaPic(identity('team_member'),{projectId:p.id,pic:'PIC',email:'general_user@example.invalid',reason:'test'});
 assert.equal((await listRpa(identity('general_user'))).projects.length,1);checks++;
 const body={projectId:p.id,title:'Isolated request',description:'Fixture only',type:'오류 수정',priority:'normal',occurredDate:'2026-09-23',notifyEmail:'general_user@example.invalid',key:randomUUID(),files:[{name:'test.txt',base64:Buffer.from('fixture').toString('base64')}]};
 const created=await createRpaRequest(identity('general_user'),body);
 const receivedMails=[];
 await runRpaMailCycle({PORTAL_MAIL_MODE:'live',PORTAL_APP_URL:'https://portal.example.com'},async mail=>{receivedMails.push(mail);return {status:'sent',code:'MOCK'};});
 assert.deepEqual(receivedMails.map(m=>m.recipient).sort(),['admin@example.invalid','team_leader@example.invalid','team_member@example.invalid'].sort());
 assert.ok(receivedMails.every(m=>m.htmlBody.includes(`rpaRequest=${created.id}`)&&m.htmlBody.includes('Fixture only')&&m.subject.includes('신규 유지보수 접수')));checks+=2;
 assert.equal((await createRpaRequest(identity('general_user'),body)).id,created.id);checks++;
 const d=await listRpa(identity('general_user'));assert.equal(d.requests.length,1);assert.equal(d.requests[0].requester,'general_user');checks++;
 const file=d.requests[0].files[0].id;assert.equal((await readRpaFile(identity('general_user'),file)).content.toString(),'fixture');checks++;
 const update=async(role,operation,extra={})=>{const current=(await listRpa(identity('admin'))).requests.find(x=>x.id===created.id);return updateRpaRequest(identity(role),{id:created.id,version:current.updatedAt,operation,...extra});};
 const stageSent=[];
 const checkStage=async(recipient,subject)=>{const count=stageSent.length;const send=async mail=>{stageSent.push(mail);return {status:'sent',code:'MOCK'};};await runRpaMailCycle({PORTAL_MAIL_MODE:'live'},send);await runRpaMailCycle({PORTAL_MAIL_MODE:'live'},send);assert.equal(stageSent.length,count+1);assert.equal(stageSent.at(-1).recipient,recipient);assert.ok(stageSent.at(-1).subject.includes(subject));checks+=3;};
 await assert.rejects(()=>update('general_user','assign',{}),e=>e.status===403);checks++;
 await assert.rejects(()=>update('admin','assign',{assigneeEmail:'team_member@example.invalid'}),e=>e.status===400);checks++;
 await update('team_leader','assign',{assigneeEmail:'team_member@example.invalid',expectedAt:'2026-10-01T15:00:00+09:00'});checks++;
 await checkStage('team_member@example.invalid','조치 요청');
 await assert.rejects(()=>update('admin','resolve',{analysis:'Cause',resolution:'Fix'}),e=>e.status===403);checks++;
 await assert.rejects(()=>update('team_member','finalize'),e=>e.status===403);checks++;
 await assert.rejects(()=>update('team_member','resolve',{analysis:'Cause'}),e=>e.status===400);checks++;
 await update('team_member','resolve',{analysis:'Cause',resolution:'Fix'});checks++;
 await checkStage('general_user@example.invalid','검증 요청');
 await assert.rejects(()=>update('team_member','verify',{decision:'approved'}),e=>e.status===403);checks++;
 await assert.rejects(()=>update('general_user','verify',{decision:'rejected'}),e=>e.status===400);checks++;
 await update('general_user','verify',{decision:'rejected',reason:'Needs adjustment',comment:'Please revise'});checks++;
 await checkStage('team_member@example.invalid','재조치 요청');assert.ok(stageSent.at(-1).htmlBody.includes('Needs adjustment'));checks++;
 let current=(await listRpa(identity('admin'))).requests[0];assert.equal(current.status,'working');assert.equal(current.verification.reason,'Needs adjustment');checks+=2;
 await update('team_member','resolve',{analysis:'Cause revised',resolution:'Fix revised'});
 await update('general_user','verify',{decision:'approved',comment:'Confirmed'});checks+=2;
 await checkStage('team_member@example.invalid','최종 확인 요청');
 current=(await listRpa(identity('admin'))).requests[0];assert.equal(current.completedAt,undefined);assert.equal(current.completionMailJobs,undefined);checks+=2;
 await assert.rejects(()=>update('admin','finalize'),e=>e.status===403);checks++;
 await update('team_member','finalize');checks++;
 current=(await listRpa(identity('general_user'))).requests[0];assert.ok(current.completedAt);assert.equal(current.mailStatus,'pending');assert.equal(current.history.at(-1).snapshot.comment,'Confirmed');assert.equal(current.history.find(h=>h.kind==='verify').snapshot.reason,'Needs adjustment');checks+=4;
 await assert.rejects(()=>update('team_member','finalize'),e=>e.status===403);checks++;
 let sent=0;const mockSend=async mail=>{sent++;assert.equal(mail.recipient,'general_user@example.invalid');assert.ok(mail.htmlBody.includes('Fix revised'));return {status:'sent',code:'MOCK'};};
 await runRpaMailCycle({PORTAL_MAIL_MODE:'live'},mockSend);await runRpaMailCycle({PORTAL_MAIL_MODE:'live'},mockSend);assert.equal(sent,1);checks++;
 const master={developerIds:['5','6'],fields:{'과제번호':'QA-NEW','과제명':'Fixture','부서':'QA','PIC':'Test','개발자':'bts / bp_solution','운영 PC':'QA'}};
 await assert.rejects(()=>createRpaMaster(identity('general_user'),master),e=>e.status===403);checks++;
 for(const id of ['1','2','3','4','999']){await assert.rejects(()=>createRpaMaster(identity('admin'),{...master,developerIds:[id]}),e=>e.status===400);checks++;}
 const roster=(await listRpa(identity('admin'))).developerRoster;
 assert.deepEqual(roster.map(u=>u.id).sort(),['5','6']);checks++;
 const newMaster=await createRpaMaster(identity('team_member'),{developerIds:master.developerIds,fields:{...master.fields,'월':'O','토':'O','실행 시간':'10:00','월 실행 시간':'09:00, 15:00','토 실행 시간':'15:30'}});checks++;
 const savedMaster=(await listRpa(identity('admin'))).projects.find(p=>p.id===newMaster.id);
 assert.equal(savedMaster.developer,'bts / bp_solution');assert.deepEqual(savedMaster.developerIds,['5','6']);checks+=2;
 assert.ok((await listRpa(identity('admin'))).people.includes('team_member'));assert.deepEqual((await listRpa(identity('general_user'))).people,[]);checks+=2;
 assert.equal(savedMaster.fields['월 실행 시간'],'09:00, 15:00');assert.equal(savedMaster.fields['토 실행 시간'],'15:30');checks+=2;
 assert.equal(savedMaster.fields['토'],'O');assert.equal(savedMaster.fields['실행 시간'],'10:00');assert.equal(savedMaster.history[0].kind,'master');checks+=3;
 assert.equal((await listRpa(identity('general_user'))).projects.some(p=>p.id===newMaster.id),false);checks++;
 await linkRpaPic(identity('admin'),{projectId:newMaster.id,pic:'Test',email:'general_user@example.invalid',reason:'new master visibility test'});
 assert.equal((await listRpa(identity('general_user'))).projects.some(p=>p.id===newMaster.id),true);checks++;
 const patch={id:newMaster.id,revision:0,fields:{...master.fields,'과제명':'Changed'},reason:'Correction'};
 await assert.rejects(()=>updateRpaMaster(identity('general_user'),patch),e=>e.status===403);checks++;
 for(const [revision,role]of ['team_member','team_leader','admin'].entries()){
  await updateRpaMaster(identity(role),{...patch,revision,fields:{...patch.fields,'과제명':'Changed '+role}});checks++;
 }
 const edited=(await listRpa(identity('general_user'))).projects.find(p=>p.id===newMaster.id);
 assert.equal(edited.id,newMaster.id);assert.equal(edited.name,'Changed admin');assert.equal(edited.fields['토'],'O');assert.equal(edited.history.at(-1).changes['과제명'].after,'Changed admin');checks+=4;
 await assert.rejects(()=>updateRpaMaster(identity('admin'),patch),e=>e.status===409);checks++;
 await assert.rejects(()=>updateRpaMaster(identity('admin'),{...patch,revision:3,fields:{...patch.fields,PIC:'Other'}}),e=>e.status===409);checks++;
 await assert.rejects(()=>updateRpaMaster(identity('admin'),{...patch,revision:3,fields:{...patch.fields,'과제번호':'OTHER'}}),e=>e.status===400);checks++;
 await assert.rejects(()=>createRpaMaster(identity('admin'),master),e=>e.status===409);checks++;
 for(const role of ['bts','bp_solution']){assert.equal((await listRpa(identity(role))).requests.length,0);await assert.rejects(()=>readRpaFile(identity(role),file),e=>e.status===404);await assert.rejects(()=>createRpaRequest(identity(role),{...body,key:randomUUID()}),e=>e.status===404);checks+=3;}
 await assert.rejects(()=>createRpaRequest(identity('general_user'),{...body,key:randomUUID(),files:[{name:'bad.png',base64:'aGVsbG8='}]}),e=>e.status===400);checks++;
 await linkRpaPic(identity('team_member'),{projectId:p.id,pic:'PIC',email:'bts@example.invalid',reason:'reassignment test'});
 assert.equal((await listRpa(identity('general_user'))).requests.length,0);assert.equal((await listRpa(identity('bts'))).requests.length,1);checks+=2;
 assert.equal(Number((await query('select count(*) as n from agent_portal.rpa_pic_history')).rows[0].n),3);checks++;
 const picBody={projectId:newMaster.id,revision:3,previousLinks:[{pic:'Test',email:'general_user@example.invalid'}],pics:[{pic:'Replacement',email:'bp_solution@example.invalid'},{pic:'Unlinked',email:''}],reason:'PIC reassignment'};
 for(const role of ['general_user','bts','bp_solution']){await assert.rejects(()=>updateRpaPics(identity(role),picBody),e=>e.status===403);checks++;}
 await assert.rejects(()=>updateRpaPics(identity('admin'),{...picBody,pics:[{pic:'Duplicate'},{pic:'Duplicate'}]}),e=>e.status===400);checks++;
 await assert.rejects(()=>updateRpaPics(identity('admin'),{...picBody,previousLinks:[]}),e=>e.status===409);checks++;
 await updateRpaPics(identity('team_member'),picBody);checks++;
 assert.equal((await listRpa(identity('general_user'))).projects.some(p=>p.id===newMaster.id),false);checks++;
 const replaced=(await listRpa(identity('bp_solution'))).projects.find(p=>p.id===newMaster.id);
 assert.deepEqual(replaced.pics,['Replacement','Unlinked']);assert.equal(replaced.fields.PIC,'Replacement/Unlinked');assert.equal(replaced.history.at(-1).changes.PIC.before[0].pic,'Test');checks+=3;
 await assert.rejects(()=>updateRpaPics(identity('admin'),picBody),e=>e.status===409);checks++;
 await updateRpaPics(identity('team_leader'),{...picBody,revision:4,previousLinks:[{pic:'Replacement',email:'bp_solution@example.invalid'}],pics:[]});checks++;
 assert.equal((await listRpa(identity('bp_solution'))).projects.length,0);checks++;
 const removed=(await listRpa(identity('admin'))).projects.find(p=>p.id===newMaster.id);assert.deepEqual(removed.pics,[]);assert.equal(removed.revision,5);checks+=2;
 const excluded={...p,id:'hidden:1',code:'HIDDEN-001',status:'7. 제외(미개발)'};
 await query('insert into agent_portal.rpa_projects(id,project_code,payload,source_hash) values($1,$2,$3,$4)',[excluded.id,excluded.code,excluded,'test']);
 await linkRpaPic(identity('admin'),{projectId:excluded.id,pic:'PIC',email:'general_user@example.invalid',reason:'fixture'});
 assert.equal((await listRpa(identity('admin'))).hiddenProjects.length,1);
 assert.equal((await listRpa(identity('general_user'))).hiddenProjects.length,1);
 assert.equal((await listRpa(identity('bts'))).hiddenProjects.length,0);checks++;
 assert.equal((await listRpa(identity('general_user'))).projects.some(x=>x.id===excluded.id),false);checks+=3;
 const visibility={hidden:false,items:[{id:excluded.id,revision:0}]};
 for(const role of ['general_user','bts','bp_solution']){await assert.rejects(()=>setRpaVisibility(identity(role),visibility),e=>e.status===403);checks++;}
 await assert.rejects(()=>createRpaRequest(identity('admin'),{...body,projectId:excluded.id,key:randomUUID(),files:[]}),e=>e.status===409);checks++;
 await setRpaVisibility(identity('team_member'),visibility);
 assert.equal((await listRpa(identity('general_user'))).projects.some(x=>x.id===excluded.id),true);checks++;
 await assert.rejects(()=>setRpaVisibility(identity('admin'),{...visibility,hidden:true}),e=>e.status===409);checks++;
 const hiddenRequest=await createRpaRequest(identity('general_user'),{...body,projectId:excluded.id,key:randomUUID(),files:[]});
 await setRpaVisibility(identity('team_leader'),{hidden:true,items:[{id:excluded.id,revision:1}]});
 const hiddenData=await listRpa(identity('general_user'));
 assert.ok(hiddenData.requests.some(x=>x.id===hiddenRequest.id));assert.ok(hiddenData.requestProjects.some(x=>x.id===excluded.id));checks+=2;
 const savedHidden=(await query('select payload from agent_portal.rpa_projects where id=$1',[excluded.id])).rows[0].payload;
 assert.equal(savedHidden.visibility.hidden,true);assert.equal(savedHidden.status,excluded.status);assert.equal(savedHidden.history.at(-1).kind,'visibility');checks+=3;
 console.log(JSON.stringify({passed:checks,storage:'temporary tables only',persistentChanges:0}));
 const deletion={id:newMaster.id,revision:5,confirmCode:master.fields['과제번호'],reason:'Isolated delete test'};
 const unified=await createRpaMaster(identity('admin'),{developerIds:master.developerIds,fields:{...master.fields,'과제번호':'QA-PAIRS'},pics:[{pic:'One',email:'general_user@example.invalid'},{pic:'Two',email:'bts@example.invalid'}]});
 for(const role of ['general_user','bts']){assert.ok((await listRpa(identity(role))).projects.some(p=>p.id===unified.id));checks++;}
 await updateRpaMaster(identity('team_member'),{id:unified.id,revision:0,fields:{'과제명':'Pairs changed'},pics:[{pic:'One',email:'bp_solution@example.invalid'},{pic:'Two',email:''}],reason:'Reassign PIC'});
 for(const role of ['general_user','bts']){assert.equal((await listRpa(identity(role))).projects.some(p=>p.id===unified.id),false);checks++;}
 const unifiedData=(await listRpa(identity('bp_solution'))).projects.find(p=>p.id===unified.id);assert.equal(unifiedData.fields['현업 이메일'],'bp_solution@example.invalid');assert.equal(unifiedData.history.at(-1).kind,'pic_updated');checks+=2;
 for(const role of ['general_user','bts','bp_solution']){await assert.rejects(()=>deleteRpaMaster(identity(role),deletion),e=>e.status===403);checks++;}
 await assert.rejects(()=>deleteRpaMaster(identity('admin'),{...deletion,revision:0}),e=>e.status===409);checks++;
 await assert.rejects(()=>deleteRpaMaster(identity('admin'),{...deletion,confirmCode:'wrong'}),e=>e.status===400);checks++;
 await assert.rejects(()=>deleteRpaMaster(identity('admin'),{...deletion,reason:''}),e=>e.status===400);checks++;
 const pending=await createRpaRequest(identity('admin'),{...body,projectId:newMaster.id,key:randomUUID(),files:[]});
 await assert.rejects(()=>deleteRpaMaster(identity('admin'),deletion),e=>e.status===409);checks++;
 await query("update agent_portal.rpa_requests set status='completed',payload=payload || jsonb_build_object('completedAt',now()) where id=$1",[pending.id]);
 await deleteRpaMaster(identity('team_member'),deletion);checks++;
 const listed=await listRpa(identity('admin'));assert.equal(listed.projects.some(p=>p.id===newMaster.id),false);assert.equal(listed.requests.some(r=>r.id===pending.id),false);checks+=2;
 const archived=(await query('select payload from agent_portal.rpa_projects where id=$1',[newMaster.id])).rows[0].payload;
 assert.ok(archived.deletedAt);assert.equal(archived.history.at(-1).reason,deletion.reason);checks+=2;
 await assert.rejects(()=>updateRpaMaster(identity('admin'),{...patch,revision:6}),e=>e.status===404);checks++;
 await assert.rejects(()=>createRpaRequest(identity('admin'),{...body,projectId:newMaster.id,key:randomUUID(),files:[]}),e=>e.status===404);checks++;
 await assert.rejects(()=>deleteRpaMaster(identity('admin'),{...deletion,revision:6}),e=>e.status===404);checks++;
 console.log(JSON.stringify({passed:checks,storage:'temporary tables only',persistentChanges:0}));
}finally{pool.query=originalQuery;pool.connect=originalConnect;client.release();await closePool();}
