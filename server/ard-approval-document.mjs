import {createHash} from 'node:crypto';
import {withArdApprovals,finalDocument,legacyArdMarkdown} from '../shared/final-document.mjs';
// The caller holds the project lock. Persist the signed snapshot in the same transaction as the vote.
export async function persistArdApprovalDocument(client,project,state,actor){
 const artifact=state.nativeAgentArtifacts?.ARD||{};
 const source=artifact.id?(await client.query("select markdown from agent_portal.native_agent_documents where id=$1 and project_id=$2 and document_type='ARD'",[artifact.id,project.id])).rows[0]:{markdown:legacyArdMarkdown(state)};
 if(!source)throw new Error('승인할 ARD 최종본을 찾을 수 없습니다.');
 const markdown=withArdApprovals(finalDocument(source.markdown,'ARD',artifact.authorName||'작성 담당자',artifact.at),state);
 const latest=(await client.query("select version_number from agent_portal.native_agent_documents where project_id=$1 and document_type='ARD' order by version_number desc limit 1",[project.id])).rows[0];
 const doc=(await client.query("insert into agent_portal.native_agent_documents(project_id,document_type,version_number,original_name,markdown,content_sha256,created_by) values($1,'ARD',$2,$3,$4,$5,$6) returning id,version_number",[project.id,(latest?.version_number||0)+1,`${project.project_code}-ARD-final.md`,markdown,createHash('sha256').update(markdown).digest('hex'),actor.id])).rows[0];
 state.nativeAgentArtifacts||={};
 state.nativeAgentArtifacts.ARD={...artifact,status:'complete',contentVersion:artifact.contentVersion||artifact.version||doc.version_number,id:String(doc.id),version:doc.version_number,approvalUpdatedAt:new Date().toISOString()};
 await client.query("update agent_portal.native_agent_sessions set payload=jsonb_set(payload,'{ard_md}',to_jsonb($2::text)),revision=revision+1,updated_by=$3,updated_at=now() where project_id=$1",[project.id,markdown,actor.id]);
}
