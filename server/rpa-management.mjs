import {randomUUID} from 'node:crypto';
import {withTransaction} from './db/pool.mjs';
import {rpaActor} from './rpa-portal.mjs';
import {canReadAllRpa} from '../shared/rpa-policy.mjs';
import {STATUS_LABELS} from '../shared/rpa-display.mjs';
import {RPA_DAYS,timeKey,validTimes} from '../shared/rpa-schedule.mjs';
function checkTimes(f){for(const d of RPA_DAYS)if(Object.hasOwn(f,timeKey(d))&&!validTimes(f[timeKey(d)]))fail(400,'요일별 실행 시간은 HH:MM 형식으로 입력해 주세요.');}
const fail=(s,m)=>{throw Object.assign(new Error(m),{status:s});};
function manager(actor){if(!canReadAllRpa(actor.app_role))fail(403,'AI 활성화팀 팀원·팀장 또는 Admin만 변경할 수 있습니다.');}
export async function updateRpaRequest(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const row=(await c.query('select * from agent_portal.rpa_requests where id=$1 for update',[body.id])).rows[0];
  if(!row)fail(404,'요청을 찾을 수 없습니다.');
  if(!body.version||new Date(row.updated_at).toISOString()!==new Date(body.version).toISOString())fail(409,'다른 사용자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
  if(!Object.hasOwn(STATUS_LABELS,body.status))fail(400,'진행 상태를 확인해 주세요.');
  for(const k of ['assignee','analysis','resolution','reason'])if(typeof body[k]!=='string'||body[k].length>15000)fail(400,'입력 내용을 확인해 주세요.');
  if(body.expectedAt&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(body.expectedAt))fail(400,'예정 일시를 확인해 주세요.');
  if(body.expectedAt&&!Number.isFinite(Date.parse(body.expectedAt)))fail(400,'예정 일시를 확인해 주세요.');
  if(body.status==='completed'&&!body.resolution.trim())fail(400,'완료 전에 조치 내용을 입력해 주세요.');
  if(body.status==='held'&&!body.reason.trim())fail(400,'반려/보류 사유를 입력해 주세요.');
  const now=new Date().toISOString(),old=row.payload,prev=old.onHold?'held':row.status;
  const changes={};for(const k of ['assignee','analysis','resolution','expectedAt'])if((old[k]||'')!==(body[k]||''))changes[k]={before:old[k]||'',after:body[k]||''};
  if(prev!==body.status)changes.status={before:prev,after:body.status};
  if(!Object.keys(changes).length)return {saved:true};
  const events=[];const event=(kind,label,delta)=>events.push({kind,label,changes:delta,at:now,actor:actor.display_name,actorEmail:actor.email,reason:body.reason});
  if(changes.status)event(body.status==='completed'?'completed':'status',`단계 변경: ${STATUS_LABELS[prev]} → ${STATUS_LABELS[body.status]}`,{status:changes.status});
  if(changes.assignee)event('assigned','담당 개발자 변경',{assignee:changes.assignee});
  const content=Object.fromEntries(Object.entries(changes).filter(([k])=>!['status','assignee'].includes(k)));if(Object.keys(content).length)event('updated','조치 내용 갱신',content);
  const payload={...old,assignee:body.assignee.trim(),analysis:body.analysis,resolution:body.resolution,expectedAt:body.expectedAt||null,onHold:body.status==='held',history:[...(old.history||[]),...events],completedAt:body.status==='completed'?(old.completedAt||now):null};
  const status=body.status==='held'?row.status:body.status;
  await c.query('update agent_portal.rpa_requests set payload=$2,status=$3,updated_at=now() where id=$1',[body.id,payload,status]);
  return {saved:true};
 });
}
export async function createRpaMaster(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const f=body.fields;if(!f||typeof f!=='object'||Array.isArray(f))fail(400,'과제 정보를 확인해 주세요.');
  for(const k of ['과제번호','과제명','부서','PIC','개발자','운영 PC'])if(!String(f[k]||'').trim())fail(400,`${k} 항목을 입력해 주세요.`);
  for(const v of Object.values(f))if(typeof v!=='string'||v.length>10000)fail(400,'입력 길이를 확인해 주세요.');
  checkTimes(f);
  const code=f['과제번호'].trim();if(!/^[A-Za-z0-9-]{2,40}$/.test(code))fail(400,'과제번호 형식을 확인해 주세요.');
  await c.query('select pg_advisory_xact_lock(hashtext($1))',['rpa-master:'+code]);
  if((await c.query('select id from agent_portal.rpa_projects where project_code=$1',[code])).rowCount)fail(409,'이미 등록된 과제번호입니다.');
  const id='portal:'+randomUUID(),now=new Date().toISOString();
  const p={id,code,name:f['과제명'].trim(),company:f['법인']||'',department:f['부서'],pics:f.PIC.split(/[/,;\n]/).map(s=>s.trim()).filter(Boolean),developer:f['개발자'],status:f['진행 상태']||'',fields:f,sourceSheet:'포털 직접 등록',sourceRow:'—',history:[{kind:'master',at:now,label:'RPA 과제 마스터 등록',actor:actor.display_name,actorEmail:actor.email}]};
  await c.query('insert into agent_portal.rpa_projects(id,project_code,payload,source_hash) values($1,$2,$3,$4)',[id,code,p,'portal']);
  return {id};
 });
}
export async function updateRpaMaster(identity,body){
 return withTransaction(async c=>{
  const actor=await rpaActor(identity,c);manager(actor);
  const row=(await c.query('select * from agent_portal.rpa_projects where id=$1 for update',[body.id])).rows[0];
  if(!row)fail(404,'과제를 찾을 수 없습니다.');
  const old=row.payload;
  if((body.revision??0)!==(old.revision??0))fail(409,'다른 사용자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
  const input=body.fields;
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'과제 정보를 확인해 주세요.');
  const allowed=['과제번호','과제명','법인','본부','부서','접수타입','PIC','현업 이메일','개발자','운영 PC','진행 상태','현업배포일자','사용 화면','주기','실행 방법','실행일','실행 시간','개발공수(DAY)','월 작업 MH (25일)','비고','월','화','수','목','금','토','일',...RPA_DAYS.map(timeKey)];
  for(const [k,v] of Object.entries(input))if(!allowed.includes(k)||typeof v!=='string'||v.length>10000)fail(400,'입력 내용을 확인해 주세요.');
  const f={...old.fields,...input};
  checkTimes(f);
  if(f['과제번호']!==old.code)fail(400,'과제번호는 변경할 수 없습니다.');
  for(const k of ['과제명','부서','PIC','개발자','운영 PC'])if(!String(f[k]||'').trim())fail(400,`${k} 항목을 입력해 주세요.`);
  if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail(400,'변경 사유를 입력해 주세요.');
  const pics=f.PIC.split(/[/,;\n]/).map(s=>s.trim()).filter(Boolean);
  const links=(await c.query('select pic from agent_portal.rpa_pic_links where project_id=$1',[body.id])).rows;
  if(links.some(l=>!pics.includes(l.pic)))fail(409,'계정 연결된 PIC는 여기서 제거하거나 이름을 변경할 수 없습니다. PIC 계정 연결을 먼저 확인해 주세요.');
  const changes=Object.fromEntries(Object.entries(input).filter(([k,v])=>String(old.fields?.[k]??'')!==v).map(([k,v])=>[k,{before:old.fields?.[k]??'',after:v}]));
  if(!Object.keys(changes).length)return {saved:true,id:old.id};
  const p={...old,name:f['과제명'].trim(),company:f['법인']||'',department:f['부서'],pics,developer:f['개발자'],status:f['진행 상태']||'',fields:f,revision:(old.revision??0)+1,history:[...(old.history||[]),{kind:'master_updated',label:'RPA 과제 정보 수정',at:new Date().toISOString(),actor:actor.display_name,actorEmail:actor.email,reason:body.reason.trim(),changes}]};
  await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[body.id,p]);
  return {saved:true,id:old.id};
 });
}
