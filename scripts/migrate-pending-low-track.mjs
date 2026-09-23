import {withTransaction,closePool} from '../server/db/pool.mjs';
import {pendingLowTrackDevelopment} from '../shared/low-track-transition.mjs';
const code=process.argv[2],apply=process.argv.includes('--apply');
if(!/^\d{4}-\d{3,}$/.test(code||''))throw Error('Explicit project code required');
try{
 const result=await withTransaction(async client=>{
  const row=(await client.query('select p.id,p.current_stage_code,i.raw_answers from agent_portal.projects p join agent_portal.intake_requests i on i.project_id=p.id where p.project_code=$1 and p.deleted_at is null for update of p,i',[code])).rows[0];
  if(!row)throw Error('Project not found');
  const before=row.raw_answers?.portalState||{},after=pendingLowTrackDevelopment(before);
  if(apply&&after){
   await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[row.id,JSON.stringify(after)]);
   await client.query("update agent_portal.projects set current_stage_code='DES',project_status='in_progress',progress_percent=$2,next_action=$3,updated_at=now() where id=$1",[row.id,after.progress,after.nextAction]);
   await client.query("insert into agent_portal.audit_logs(project_id,action_code,entity_type,entity_id,after_data) values($1,'LOW_TRACK_DEVELOPMENT_MIGRATED','project',$2,$3::jsonb)",[row.id,code,JSON.stringify({previousStage:row.current_stage_code,before,after,reason:'User-requested low track development flow; preserve G1 and all documents'})]);
  }
  return {project:code,eligible:Boolean(after),applied:apply&&Boolean(after),previousStep:before.journeyStep,nextStep:after?.journeyStep,phase:before.lowRoute?.phase};
 });console.log(JSON.stringify(result));
}finally{await closePool();}
