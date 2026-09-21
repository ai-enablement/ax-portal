import {createHash} from 'node:crypto';
import {getPool,closePool,withTransaction} from '../server/db/pool.mjs';
import {repairIntDocumentNumber} from '../server/project-numbering.mjs';
const code=process.argv[2],apply=process.argv.includes('--apply');
if(!/^\d{4}-\d{3,}$/.test(code||''))throw Error('An explicit project code is required');
try{
 const result=await withTransaction(async client=>{
  const project=(await client.query('select id from agent_portal.projects where project_code=$1 and deleted_at is null for update',[code])).rows[0];
  if(!project)throw Error('Project not found');
  const docs=(await client.query("select id,markdown from agent_portal.native_agent_documents where project_id=$1 and document_type='INT' for update",[project.id])).rows;
  const changes=docs.map(doc=>({...doc,next:repairIntDocumentNumber(doc.markdown,code)})).filter(doc=>doc.next!==doc.markdown);
  const session=(await client.query('select payload from agent_portal.native_agent_sessions where project_id=$1 for update',[project.id])).rows[0];
  const old=session?.payload?.int_md;
  const next=old?repairIntDocumentNumber(old,code):old;
  if(apply&&(changes.length||old!==next)){
   for(const doc of changes)await client.query('update agent_portal.native_agent_documents set markdown=$2,content_sha256=$3 where id=$1',[doc.id,doc.next,createHash('sha256').update(doc.next).digest('hex')]);
   if(old!==next)await client.query("update agent_portal.native_agent_sessions set payload=jsonb_set(payload,'{int_md}',$2::jsonb),revision=revision+1,updated_at=now() where project_id=$1",[project.id,JSON.stringify(next)]);
   await client.query("insert into agent_portal.audit_logs(project_id,action_code,entity_type,entity_id,after_data) values($1,'INT_DOCUMENT_NUMBER_CORRECTED','project',$2,$3::jsonb)",[project.id,code,JSON.stringify({reason:'Replace legacy 000 INT title with assigned project number; no content or completion changes',documents:changes.map(doc=>({id:doc.id,before:doc.markdown,after:doc.next})),sessionBefore:old,sessionAfter:next})]);
  }
  return {project:code,applied:apply,documents:changes.length,sessionChanged:old!==next};
 });
 console.log(JSON.stringify(result));
}finally{await closePool();}
