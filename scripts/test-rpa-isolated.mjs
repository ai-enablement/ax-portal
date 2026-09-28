// Integration checks use connection-local TEMP tables only. No persistent data changes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getPool,closePool} from '../server/db/pool.mjs';
import {listRpa,createRpaRequest,linkRpaPic,readRpaFile,updateRpaPics} from '../server/rpa-portal.mjs';
import {updateRpaRequest,createRpaMaster,updateRpaMaster} from '../server/rpa-management.mjs';
const pool=getPool(),client=await pool.connect(),originalQuery=pool.query,originalConnect=pool.connect;
let checks=0;
try{
 await client.query('create temp table users(id bigint primary key,email text,display_name text,app_role text,is_active boolean)');
 for(const t of ['rpa_projects','rpa_pic_links','rpa_pic_history','rpa_requests','rpa_request_files'])await client.query(`create temp table ${t}(like agent_portal.${t} including all)`);
 const roles=['admin','team_leader','team_member','general_user','bts','bp_solution'];
 for(const [i,role]of roles.entries())await client.query('insert into pg_temp.users values($1,$2,$3,$4,true)',[i+1,`${role}@example.invalid`,role,role]);
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
 assert.equal((await createRpaRequest(identity('general_user'),body)).id,created.id);checks++;
 const d=await listRpa(identity('general_user'));assert.equal(d.requests.length,1);assert.equal(d.requests[0].requester,'general_user');checks++;
 const file=d.requests[0].files[0].id;assert.equal((await readRpaFile(identity('general_user'),file)).content.toString(),'fixture');checks++;
 const edit={id:created.id,version:d.requests[0].updatedAt,status:'working',assignee:'Developer',analysis:'Cause',resolution:'Fix',reason:'test',expectedAt:''};
 await assert.rejects(()=>updateRpaRequest(identity('general_user'),edit),e=>e.status===403);checks++;
 for(const role of ['admin','team_leader','team_member']){
  const current=(await listRpa(identity(role))).requests[0];
  await updateRpaRequest(identity(role),{...edit,version:current.updatedAt,analysis:role});
  checks++;
 }
 await assert.rejects(()=>updateRpaRequest(identity('admin'),{...edit,version:'2000-01-01'}),e=>e.status===409);checks++;
 let current=(await listRpa(identity('admin'))).requests[0];
 await updateRpaRequest(identity('admin'),{...edit,version:current.updatedAt,status:'held'});
 assert.equal((await listRpa(identity('general_user'))).requests[0].status,'held');checks++;
 current=(await listRpa(identity('admin'))).requests[0];
 await updateRpaRequest(identity('admin'),{...edit,version:current.updatedAt,status:'completed'});
 current=(await listRpa(identity('general_user'))).requests[0];
 assert.ok(current.completedAt);assert.ok(current.history.some(h=>h.kind==='completed'));checks++;
 const master={fields:{'과제번호':'QA-NEW','과제명':'Fixture','부서':'QA','PIC':'Test','개발자':'Developer','운영 PC':'QA'}};
 await assert.rejects(()=>createRpaMaster(identity('general_user'),master),e=>e.status===403);checks++;
 const newMaster=await createRpaMaster(identity('team_member'),{fields:{...master.fields,'월':'O','토':'O','실행 시간':'10:00','월 실행 시간':'09:00, 15:00','토 실행 시간':'15:30'}});checks++;
 const savedMaster=(await listRpa(identity('admin'))).projects.find(p=>p.id===newMaster.id);
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
 console.log(JSON.stringify({passed:checks,storage:'temporary tables only',persistentChanges:0}));
}finally{pool.query=originalQuery;pool.connect=originalConnect;client.release();await closePool();}
