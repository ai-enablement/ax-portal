import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { getPool, withTransaction } from './db/pool.mjs';
import { documentAccess } from './document-files.mjs';
import { INT_FIELDS, FEA_FIELDS, standardValue } from '../shared/intake-standard.mjs';
import { standardDocuments } from '../shared/standard-documents.mjs';
import {parseArdLiteMarkdown,ardLiteGaps} from '../shared/fast-track.mjs';
import {canManageAssessment,restrictedDocument} from '../shared/document-role-policy.mjs';

export const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
export const MARKDOWN_DOCUMENTS = Object.freeze({
  ARD_LITE: {phase:'fast_track_requirements',label:'최소 요구정의서[ARD-Lite]'},
  DES: { phase: 'design', label: '에이전트 설계서[DES]' },
  EVD: { phases: ['development_evaluation', 'deployment_rollout'], label: '개발·평가 문서[EVD]' },
  UG: { phase: 'deployment_rollout', label: '사용자 가이드[UG]' },
});

export function validateMarkdownUpload(name, bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_MARKDOWN_BYTES) throw new Error('Markdown 파일은 5MB 이하로 첨부해 주세요.');
  if (!String(name).toLowerCase().endsWith('.md')) throw new Error('.md 파일만 첨부할 수 있습니다.');
  if (bytes.includes(0)) throw new Error('텍스트 Markdown 파일만 첨부할 수 있습니다.');
  let markdown;
  try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('UTF-8로 저장된 .md 파일만 첨부할 수 있습니다.'); }
  if (!markdown.trim()) throw new Error('내용이 있는 .md 파일을 첨부해 주세요.');
  return markdown;
}

function safeName(name) { return String(name).replace(/[\r\n\\/]/g, '_').slice(0, 200); }
function gateHasRework(state, gate) {
  return Object.values(state.workflowApprovals?.[gate] || {}).some(vote => ['REWORK','REJECTED'].includes(vote?.decision));
}
export function markdownReworkGate(state, documentType, phase) {
  const step=Number(state.journeyStep??0);
  if(step===6&&gateHasRework(state,'G3')&&((documentType==='DES'&&phase==='design')||(documentType==='EVD'&&phase==='development_evaluation')))return 'G3';
  if(step===8&&gateHasRework(state,'G4')&&((documentType==='EVD'||documentType==='UG')&&phase==='deployment_rollout'))return 'G4';
  return null;
}
export function allowedPhase(state, documentType, requestedPhase) {
  if(documentType==='ARD_LITE')return state.fastTrack?.requested&&state.fastTrack.status==='QUALIFIED'&&state.intakeReview?.at&&Number(state.journeyStep)===0&&requestedPhase==='fast_track_requirements'?'fast_track_requirements':null;
  const step = Number(state.journeyStep ?? 0);
  const importing = state.historicalImport && !state.historicalImportFinalizedAt;
  const phase = documentType === 'DES' ? 'design' : documentType === 'UG' ? 'deployment_rollout' : requestedPhase;
  if (!MARKDOWN_DOCUMENTS[documentType]) return null;
  if (documentType === 'EVD' && !MARKDOWN_DOCUMENTS.EVD.phases.includes(phase)) return null;
  if(markdownReworkGate(state,documentType,phase))return phase;
  if (importing) {
    if (phase === 'design' && step >= 5) return phase;
    if (phase === 'development_evaluation' && step >= 5) return phase;
    if (phase === 'deployment_rollout' && step >= 7) return phase;
    return null;
  }
  if (documentType === 'DES' && step === 5) return phase;
  if (documentType === 'EVD' && phase === 'development_evaluation' && step === 5 && state.deliveryPhase === 'development') return phase;
  if (documentType === 'EVD' && phase === 'deployment_rollout' && step === 7) return phase;
  if (documentType === 'UG' && step === 7) return phase;
  return null;
}

function completionEntry(previous, row) {
  const phases = { ...(previous?.phases || {}), [row.lifecycle_phase]: { id: row.id, version: row.version_number, name: row.original_name, authorName: row.author_name, at: row.created_at, status: 'draft' } };
  return { ...(previous || {}), latestId: row.id, latestVersion: row.version_number, latestPhase: row.lifecycle_phase, phases };
}
export function applyMarkdownUpload(state, documentType, row) {
  const next=structuredClone(state||{}),gate=markdownReworkGate(next,documentType,row.lifecycle_phase);
  if(documentType==='EVD'&&row.lifecycle_phase==='development_evaluation'&&next.uatRecord){
    next.uatHistory=[...(next.uatHistory||[]),{...next.uatRecord,reason:'개발·평가 EVD 새 버전 첨부로 재확인 필요',invalidatedAt:row.created_at,replacedByVersion:row.version_number}];
    delete next.uatRecord;
  }
  if(gate){
    next.workflowApprovalHistory=[...(next.workflowApprovalHistory||[]),{gate,approvals:structuredClone(next.workflowApprovals?.[gate]||{}),reason:'보완 문서 새 버전 첨부',at:row.created_at}];
    next.workflowApprovals={...(next.workflowApprovals||{}),[gate]:{}};
  }
  next.markdownDocuments={...(next.markdownDocuments||{}),[documentType]:completionEntry(next.markdownDocuments?.[documentType],row)};
  return {state:next,resetGate:gate};
}

function markdownValue(value, field) {
  if (value === undefined || value === null || value === '') return '미입력';
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (value?.kind === 'blocks') return value.blocks.map(block => block.type === 'text' ? block.text : block.type === 'table' ? block.rows.map((row, index) => `| ${row.join(' | ')} |\n${index === 0 ? `| ${row.map(()=>'---').join(' | ')} |` : ''}`).join('\n') : `첨부: ${block.file?.name || '파일'}`).filter(Boolean).join('\n\n') || '미입력';
  if (Array.isArray(value) && field?.kind === 'checklist') return field.options.map((option,index)=>`- [${value[index]===true?'x':' '}] ${option}`).join('\n');
  if (Array.isArray(value) && value.every(item=>item&&typeof item==='object')) {
    const columns=[...new Set(value.flatMap(item=>Object.keys(item)))];
    return `| ${columns.join(' | ')} |\n| ${columns.map(()=>'---').join(' | ')} |\n${value.map(item=>`| ${columns.map(column=>String(item[column]??'')).join(' | ')} |`).join('\n')}`;
  }
  if (Array.isArray(value)) return value.length ? value.map(item=>`- ${String(item)}`).join('\n') : '미입력';
  return String(value);
}

function appendStandardDocument(lines, state, code, stage) {
  const definition=standardDocuments[code], record=state.historicalDocuments?.[stage]?.documents?.[code];
  lines.push(`## ${definition.title}[${code}]`, '', `작성 상태: ${record?.status==='complete'?'작성 완료':record?.status||'미작성'}`, '');
  for (const section of definition.sections) {
    lines.push(`### ${section.title}`, '');
    for (const field of section.fields) {
      if(field.id==='__attachments')continue;
      lines.push(`#### ${field.label}`, '', markdownValue(record?.fields?.[`${section.id}.${field.id}`],field), '');
    }
  }
}

function appendApprovals(lines,state,allowedGates){
  lines.push('## 승인 이력','');
  for(const gate of allowedGates){
    const current=state.workflowApprovals?.[gate]||{};
    lines.push(`### ${gate}`,'');
    if(!Object.keys(current).length&&gate==='G1'&&state.g1Resolution)lines.push(`- 판정: ${state.g1Resolution.decision} · ${state.g1Resolution.reason||'사유 없음'}`);
    else if(!Object.keys(current).length)lines.push('- 승인 이력 없음');
    else for(const [role,vote] of Object.entries(current))lines.push(`- ${role}: ${vote.decision} · ${vote.actorName||'담당자 미확인'} · ${vote.at||'일자 미확인'}${vote.reason?` · ${vote.reason}`:''}`);
    lines.push('');
  }
  for(const round of state.workflowApprovalHistory||[]){if(allowedGates.includes(round.gate))lines.push(`- 이전 ${round.gate} 라운드: ${round.reason||'근거 변경'} · ${round.at||'일자 미확인'}`);}
  lines.push('');
}

export function completedNativeReferences(state) {
  return ['INT','FEA','ARD'].flatMap(code=>{
    const record=state.nativeAgentArtifacts?.[code];
    // Rework preserves the last completed id/version/at, not the newly saved draft.
    return record && (record.status==='complete'||(record.status==='draft'&&record.at)) && /^\d+$/.test(String(record.id)) && Number(record.version)>0
      ? [{document_type:code,id:String(record.id),version_number:Number(record.version)}] : [];
  });
}

export async function loadCompletedNativeDocuments(client,projectId,state) {
  const refs=completedNativeReferences(state);
  if(!refs.length)return [];
  const rows=(await client.query(`select d.id::text,d.document_type,d.version_number,d.original_name,
      d.markdown,d.content_sha256,d.created_at,u.display_name as author_name
    from agent_portal.native_agent_documents d
    join jsonb_to_recordset($2::jsonb) as r(id text,document_type text,version_number integer)
      on d.id=r.id::bigint and d.document_type=r.document_type and d.version_number=r.version_number
    left join agent_portal.users u on u.id=d.created_by
    where d.project_id=$1`,[projectId,JSON.stringify(refs)])).rows;
  if(rows.length!==refs.length)throw new Error('작성 완료된 원본 문서를 찾지 못했습니다. 문서 참조를 확인해 주세요.');
  return rows;
}

export function buildCumulativeMarkdown(project, state, phase, versions=[], nativeDocuments=[], includeAssessments=true) {
  const phaseTitle={design:'설계',development_evaluation:'개발·평가',deployment_rollout:'배포·확산'}[phase];
  if(!phaseTitle)throw new Error('유효한 누적 문서 단계가 아닙니다.');
  const lines=[`# ${project.project_name} · ${phaseTitle} 단계 누적 이력`,'',`- 과제 번호: ${project.project_code}`,`- 생성 시각: ${new Date().toISOString()}`,`- 현재 단계: ${project.current_stage_code||'미확인'}`,''];
  const refs=completedNativeReferences(state);
  for(const code of ['INT','FEA','ARD']){
    if(!includeAssessments&&restrictedDocument(code)){lines.push(`## ${code}`,'','접근 제한: 팀장·Admin만 문서 원문을 조회할 수 있습니다.','');continue;}
    const ref=refs.find(r=>r.document_type===code);
    if(ref){
      const doc=nativeDocuments.find(d=>d.document_type===code&&String(d.id)===ref.id&&Number(d.version_number)===ref.version_number);
      if(!doc)throw new Error(`${code} 작성 완료 원본이 없습니다.`);
      lines.push(`## ${code} 작성 완료 원문 · v${doc.version_number}`,'',`- 파일명: ${doc.original_name}`,`- 작성자: ${doc.author_name||'미확인'}`,`- 완료 시각: ${state.nativeAgentArtifacts[code].at||'미확인'}`,`- SHA-256: ${doc.content_sha256}`,'',doc.markdown,'');
    }else if(state.nativeAgentArtifacts?.[code]){
      lines.push(`## ${code}`,'','작성 완료된 원본이 없습니다. 작성 중인 초안은 포함하지 않습니다.','');
    }else if(code==='ARD')appendStandardDocument(lines,state,'ARD',3);
    else{
      lines.push(`## ${code==='INT'?'요구 접수서':'타당성 평가서'}[${code}]`,'','기존 양식 데이터 기준','');
      for(const field of code==='INT'?INT_FIELDS:FEA_FIELDS)lines.push(`### ${field.label}`,'',markdownValue(standardValue(state,field.key),field),'');
    }
  }
  appendApprovals(lines,state,phase==='deployment_rollout'?['G1','G2','G3']:['G1','G2']);
  if(versions.length){lines.push('## 첨부 Markdown 문서 원본 이력','');for(const version of versions){lines.push(`### ${version.document_type} v${version.version_number} · ${version.lifecycle_phase}`,'',`- 파일명: ${version.original_name}`,`- 작성자: ${version.author_name}`,`- 첨부일: ${new Date(version.created_at).toISOString()}`,`- SHA-256: ${version.checksum_sha256}`,'',version.content_markdown,'');}}
  return `${lines.join('\n').trim()}\n`;
}

export async function exportCumulativeMarkdown(identity, projectCode, phase) {
  const pool=getPool();const access=await documentAccess(pool,identity,projectCode);
  if(!access)return {status:403,body:{error:'누적 문서를 내려받을 권한이 없습니다.'}};
  const row=(await pool.query(`select p.project_code,p.project_name,p.current_stage_code,coalesce(i.raw_answers->'portalState','{}'::jsonb) as state from agent_portal.projects p join agent_portal.intake_requests i on i.project_id=p.id where p.id=$1 and p.deleted_at is null`,[access.project.id])).rows[0];
  if(!row)return {status:404,body:{error:'과제를 찾지 못했습니다.'}};
  if(!['design','development_evaluation','deployment_rollout'].includes(phase))return {status:400,body:{error:'유효한 누적 문서 단계가 아닙니다.'}};
  const versions=(await pool.query(`select v.document_type,v.lifecycle_phase,v.version_number,v.original_name,v.content_markdown,v.checksum_sha256,v.created_at,u.display_name as author_name
    from agent_portal.markdown_document_versions v join agent_portal.users u on u.id=v.created_by
    where v.project_id=$1 and (($2='development_evaluation' and v.document_type='DES') or ($2='deployment_rollout' and (v.document_type='DES' or (v.document_type='EVD' and v.lifecycle_phase='development_evaluation'))))
    order by case v.document_type when 'DES' then 1 else 2 end,v.version_number`,[access.project.id,phase])).rows;
  const nativeDocuments=await loadCompletedNativeDocuments(pool,access.project.id,row.state||{});
  const markdown=buildCumulativeMarkdown(row,row.state||{},phase,versions,nativeDocuments,canManageAssessment(access.actor.app_role));
  return {status:200,body:{markdown,name:`${row.project_code}-${phase}-history.md`}};
}

export async function listMarkdownDocuments(identity, projectCode) {
  const pool = getPool();
  const access = await documentAccess(pool, identity, projectCode);
  if (!access) return { status: 403, body: { error: '문서를 열람할 권한이 없습니다.' } };
  const rows = (await pool.query(`select v.id::text, v.document_type as "documentType", v.lifecycle_phase as phase,
      v.version_number as version, v.original_name as name, v.byte_size as size,
      v.checksum_sha256 as checksum, v.created_at as "createdAt", u.display_name as "authorName"
    from agent_portal.markdown_document_versions v
    join agent_portal.users u on u.id=v.created_by
    where v.project_id=$1 order by v.created_at desc, v.version_number desc`, [access.project.id])).rows;
  return { status: 200, body: { documents: rows.filter(row=>!restrictedDocument(row.documentType)||canManageAssessment(access.actor.app_role)) } };
}

export async function uploadMarkdownDocument(identity, projectCode, documentType, requestedPhase, name, bytes) {
  const markdown = validateMarkdownUpload(name, bytes);
  const ardLite=documentType==='ARD_LITE'?parseArdLiteMarkdown(markdown):null;
  if(ardLite&&ardLiteGaps(ardLite).length)throw new Error(`ARD-Lite .md 양식의 항목을 채워 주세요: ${ardLiteGaps(ardLite).join(', ')}`);
  return withTransaction(async client => {
    const access = await documentAccess(client, identity, projectCode, documentType!=='ARD_LITE', documentType);
    if (!access) return { status: 403, body: { error: '이 문서를 작성할 권한이 없습니다.' } };
    if(documentType==='ARD_LITE'&&!access.canWrite&&!access.related&&access.actor.app_role!=='team_leader')return {status:403,body:{error:'요구자·Owner·개발 담당자·팀장 또는 Admin만 요구정의를 첨부할 수 있습니다.'}};
    await client.query('select id from agent_portal.projects where id=$1 for update', [access.project.id]);
    const intake = (await client.query(`select id, coalesce(raw_answers->'portalState','{}'::jsonb) as state
      from agent_portal.intake_requests where project_id=$1 for update`, [access.project.id])).rows[0];
    if (!intake) return { status: 409, body: { error: '과제 접수 정보를 찾지 못했습니다.' } };
    const phase = allowedPhase(intake.state || {}, documentType, requestedPhase);
    if (!phase) return { status: 409, body: { error: '현재 단계에서 작성할 수 있는 문서가 아닙니다.' } };
    const version = Number((await client.query(`select coalesce(max(version_number),0)+1 as version
      from agent_portal.markdown_document_versions where project_id=$1 and document_type=$2`, [access.project.id, documentType])).rows[0].version);
    const row = {
      id: randomUUID(), document_type: documentType, lifecycle_phase: phase, version_number: version,
      original_name: safeName(name), author_name: access.actor.display_name || identity.displayName || identity.email,
      created_at: new Date().toISOString(),
    };
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await client.query(`insert into agent_portal.markdown_document_versions
      (id,project_id,document_type,lifecycle_phase,version_number,original_name,mime_type,byte_size,original_content,content_markdown,checksum_sha256,created_by)
      values($1,$2,$3,$4,$5,$6,'text/markdown',$7,$8,$9,$10,$11)`,
      [row.id, access.project.id, documentType, phase, version, row.original_name, bytes.length, bytes, markdown, checksum, access.actor.id]);
    const completion=applyMarkdownUpload(intake.state||{},documentType,row),state=completion.state;
    if(ardLite)state.ardLite=ardLite;
    await client.query(`update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where id=$1`, [intake.id, JSON.stringify(state)]);
    if(completion.resetGate){
      await client.query(`delete from agent_portal.gate_approvals where gate_id in (select id from agent_portal.gates where project_id=$1 and gate_code=$2)`,[access.project.id,completion.resetGate]);
      await client.query(`update agent_portal.gates set gate_status='pending',final_decision=null,decided_at=null,decided_by=null,updated_at=now() where project_id=$1 and gate_code=$2`,[access.project.id,completion.resetGate]);
    }
    await client.query(`insert into agent_portal.audit_logs
      (actor_user_id,project_id,action_code,entity_type,entity_id,after_data)
      values($1,$2,'MARKDOWN_DOCUMENT_UPLOAD','markdown_document',$3,$4::jsonb)`,
      [access.actor.id, access.project.id, row.id, JSON.stringify({ documentType, phase, version, name: row.original_name, size: bytes.length, checksum, status: 'draft' })]);
    return { status: 201, body: { document: { id: row.id, documentType, phase, version, name: row.original_name, size: bytes.length, checksum, authorName: row.author_name, createdAt: row.created_at } } };
  });
}

export async function readMarkdownDocument(identity, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 404, body: { error: '문서를 찾지 못했습니다.' } };
  const pool = getPool();
  const metadata = (await pool.query(`select p.project_code,v.document_type from agent_portal.markdown_document_versions v join agent_portal.projects p on p.id=v.project_id where v.id=$1 and p.deleted_at is null`, [id])).rows[0];
  if (!metadata || !await documentAccess(pool, identity, metadata.project_code,false,metadata.document_type)) return { status: 404, body: { error: '문서를 찾지 못했습니다.' } };
  const row = (await pool.query(`select v.id::text, v.document_type as "documentType", v.lifecycle_phase as phase,
      v.version_number as version, v.original_name as name, v.content_markdown as markdown,
      v.byte_size as size, v.checksum_sha256 as checksum, v.created_at as "createdAt", u.display_name as "authorName"
    from agent_portal.markdown_document_versions v join agent_portal.users u on u.id=v.created_by where v.id=$1`, [id])).rows[0];
  return { status: 200, body: { document: row } };
}
