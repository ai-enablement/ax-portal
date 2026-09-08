import {intakeDocument,intakeRequired,feaRequired} from '../shared/intake-standard.mjs';
import {canBackfillDocument,isHistoricalDocumentComplete} from '../shared/historical-import-policy.mjs';
export function completionGaps(previous,changes,merged) {
  const intDone=changes.intakeDraftCompleted===true || (Number(previous.journeyStep)===0 && Number(merged.journeyStep)>0);
  const feaDone=changes.feaCompleted===true || (Number(previous.journeyStep)<=1 && Number(merged.journeyStep)>1);
  if(feaDone&&!canBackfillDocument(previous,1)&&!isHistoricalDocumentComplete(merged,1))return [...(isHistoricalDocumentComplete(merged,0)?[]:intakeRequired(merged)),...feaRequired(merged)];
  if(intDone&&!canBackfillDocument(previous,0)&&!isHistoricalDocumentComplete(merged,0))return intakeRequired(merged);
  return [];
}
// Preserve the earlier document version on first v3 write.
export async function persistIntakeFeaV3(client,project,state,actorId,previous={}) {
  const drafts=[];
  if(state.intakeStandardVersion==='3.0' && (JSON.stringify([state.intakeAnswers,state.intakeDetails,state.intakeDraftCompleted])!==JSON.stringify([previous.intakeAnswers,previous.intakeDetails,previous.intakeDraftCompleted]) || previous.intakeStandardVersion!=='3.0'))drafts.push(['INT',intakeDocument(state),!!state.intakeDraftCompleted]);
  if(state.feaDraft?.standardVersion==='3.0' && (JSON.stringify(state.feaDraft)!==JSON.stringify(previous.feaDraft)||state.feaCompleted!==previous.feaCompleted))drafts.push(['FEA',state.feaDraft,!!state.feaCompleted]);
  for(const [code,content,complete] of drafts) {
    if(code==='INT')await client.query('update agent_portal.intake_requests set current_process=$2,failure_impact=$3,updated_at=now() where project_id=$1',[project.id,state.intakeDetails?.currentProcess||null,state.intakeDetails?.failureImpact||null]);
    await client.query(`insert into agent_portal.documents(project_id,document_type,document_code,document_title,document_status,current_version,author_id) values($1,$2,$3,$4,'draft',1,$5) on conflict(project_id,document_type) do nothing`,[project.id,code,`${project.project_code}-${code}`,`${project.project_name} ${code}`,actorId]);
    const doc=(await client.query('select id,current_version from agent_portal.documents where project_id=$1 and document_type=$2 for update',[project.id,code])).rows[0];
    const old=(await client.query('select structured_content from agent_portal.document_versions where document_id=$1 and version_number=$2',[doc.id,doc.current_version])).rows[0];
    const version=Number(doc.current_version)+(old&&old.structured_content?.standardVersion!=='3.0'?1:0);
    await client.query(`insert into agent_portal.document_versions(document_id,version_number,structured_content,change_summary,created_by) values($1,$2,$3::jsonb,$4,$5) on conflict(document_id,version_number) do update set structured_content=excluded.structured_content,change_summary=excluded.change_summary,created_by=excluded.created_by,created_at=now()`,[doc.id,version,JSON.stringify(content),`표준체계 v3.0 ${complete?'작성 완료':'초안 저장'} · G1 승인 아님`,actorId]);
    await client.query('update agent_portal.documents set current_version=$2,document_status=$3,author_id=$4,updated_at=now() where id=$1',[doc.id,version,complete?'completed':'draft',actorId]);
  }
}
