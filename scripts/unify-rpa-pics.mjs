import {getPool,withTransaction,closePool} from '../server/db/pool.mjs';
import {initialPics} from '../shared/rpa-pics.mjs';
import {syncRpaPics} from '../server/rpa-pics.mjs';
const apply=process.argv.includes('--apply'),actorEmail=process.argv.find(x=>x.startsWith('--actor='))?.slice(8);
try{
 const actor=(await getPool().query("select id,email,display_name from agent_portal.users where lower(email)=lower($1) and app_role='admin' and is_active=true",[actorEmail])).rows[0];
 if(!actor)throw Error('An active admin --actor email is required');
 const result=await withTransaction(async c=>{
  const rows=(await c.query("select p.id,p.payload from agent_portal.rpa_projects p where p.payload->>'deletedAt' is null and coalesce(p.payload->'fields'->>'현업 이메일','')<>'' and not exists(select 1 from agent_portal.rpa_pic_links l where l.project_id=p.id) for update")).rows;
  const linked=[],review=[];
  for(const row of rows){const pairs=initialPics(row.payload);if(pairs.length!==1||!pairs[0].email){review.push(row.payload.code);continue;}
   if(apply){const updated=await syncRpaPics(c,row.payload,pairs,actor,'관리자 요청: 현업 이메일과 PIC 계정 통합 · 명확한 단일 PIC 자동 연결');updated.revision=(row.payload.revision??0)+1;await c.query('update agent_portal.rpa_projects set payload=$2 where id=$1',[row.id,updated]);}
   linked.push(row.payload.code);
  }return {applied:apply,linked,review};
 });console.log(JSON.stringify(result));
}finally{await closePool();}
