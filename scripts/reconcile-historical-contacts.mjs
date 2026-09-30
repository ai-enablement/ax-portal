// Default is read-only. --apply requires an explicit active Admin email argument.
import {getPool,withTransaction,closePool} from '../server/db/pool.mjs';
import {linkHistoricalContacts} from '../server/project-contacts.mjs';
import {emailFromPartyLabel,isContactEmail,normalizeContactEmail} from '../shared/project-contacts.mjs';
const apply=process.argv.includes('--apply'),adminEmail=process.argv.find(v=>v.startsWith('--admin='))?.slice(8);
try{
 const pool=getPool();
 const admin=apply?(await pool.query("select id from agent_portal.users where lower(email)=lower($1) and app_role='admin' and is_active=true",[adminEmail])).rows[0]:null;
 if(apply&&!admin)throw Error('An explicit active Admin account is required.');
 const projects=(await pool.query("select p.id from agent_portal.projects p join agent_portal.intake_requests ir on ir.project_id=p.id where p.deleted_at is null and ir.raw_answers->'portalState'->>'historicalImport'='true' order by p.id")).rows;
 const reports=[];
 for(const {id} of projects)await withTransaction(async c=>{
  const row=(await c.query(`select p.id,p.organization_id,p.project_code,p.requester_id,p.owner_id,ir.raw_answers->'portalState' as state from agent_portal.projects p join agent_portal.intake_requests ir on ir.project_id=p.id where p.id=$1 ${apply?'for update of p,ir':''}`,[id])).rows[0];
  const state=row.state,contacts={},changes=[];
  for(const [key,relation,column] of [['requesterEmail','requester','requester_id'],['projectOwnerEmail','owner','owner_id']]){
   const email=normalizeContactEmail(state[key])||emailFromPartyLabel(relation==='requester'?state.requester:state.projectOwner||state.owner);
   if(!isContactEmail(email)){reports.push({project:row.project_code,role:relation,status:'email_missing_or_invalid'});continue;}
   const users=(await c.query('select id from agent_portal.users where lower(email)=$1 and organization_id=$2 and is_active=true',[email,row.organization_id])).rows;
   if(users.length!==1){reports.push({project:row.project_code,role:relation,email,status:'active_account_unresolved'});continue;}
   if(String(users[0].id)===String(row[column]))continue;
   contacts[key]=email;changes.push({role:relation,before:String(row[column]),after:String(users[0].id),email});
  }
  if(!changes.length)return;
  reports.push({project:row.project_code,status:apply?'corrected':'mismatch',changes,uatRecorded:!!state.uatRecord?.completed});
  if(!apply)return;
  await linkHistoricalContacts(c,row,state,contacts,admin.id);
  state.contactReconciliationHistory=[...(state.contactReconciliationHistory||[]),{at:new Date().toISOString(),actorId:String(admin.id),changes}];
  await c.query("update agent_portal.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState}',$2::jsonb),updated_at=now() where project_id=$1",[row.id,JSON.stringify(state)]);
  await c.query("insert into agent_portal.audit_logs(actor_user_id,project_id,action_code,entity_type,entity_id,after_data) values($1,$2,'HISTORICAL_CONTACT_REPAIR','project',$3,$4::jsonb)",[admin.id,row.id,row.project_code,JSON.stringify(changes)]);
  // Pending messages are rebuilt from corrected identities by the regular worker.
 });
 console.log(JSON.stringify({mode:apply?'apply':'read-only',projects:projects.length,reports},null,2));
}finally{await closePool();}
