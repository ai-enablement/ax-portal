import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { getPool, withTransaction } from './db/pool.mjs';
import { documentAccess } from './document-files.mjs';
import { INT_FIELDS, FEA_FIELDS, standardValue } from '../shared/intake-standard.mjs';
import { standardDocuments } from '../shared/standard-documents.mjs';

export const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
export const MARKDOWN_DOCUMENTS = Object.freeze({
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
function allowedPhase(state, documentType, requestedPhase) {
  const step = Number(state.journeyStep ?? 0);
  const importing = state.historicalImport && !state.historicalImportFinalizedAt;
  const phase = documentType === 'DES' ? 'design' : documentType === 'UG' ? 'deployment_rollout' : requestedPhase;
  if (!MARKDOWN_DOCUMENTS[documentType]) return null;
  if (documentType === 'EVD' && !MARKDOWN_DOCUMENTS.EVD.phases.includes(phase)) return null;
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
  const phases = { ...(previous?.phases || {}), [row.lifecycle_phase]: { id: row.id, version: row.version_number, name: row.original_name, authorName: row.author_name, at: row.created_at } };
  return { ...(previous || {}), latestId: row.id, latestVersion: row.version_number, latestPhase: row.lifecycle_phase, phases };
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

export function buildCumulativeMarkdown(project, state, phase, versions=[]) {
  const phaseTitle={design:'설계',development_evaluation:'개발·평가',deployment_rollout:'배포·확산'}[phase];
  if(!phaseTitle)throw new Error('유효한 누적 문서 단계가 아닙니다.');
  const lines=[`# ${project.project_name} · ${phaseTitle} 단계 누적 이력`,'',`- 과제 번호: ${project.project_code}`,`- 생성 시각: ${new Date().toISOString()}`,`- 현재 단계: ${project.current_stage_code||'미확인'}`,'','## 요구 접수서[INT]',''];
  for(const field of INT_FIELDS)lines.push(`### ${field.label}`,'',markdownValue(standardValue(state,field.key),field),'');
  lines.push('## 타당성 평가서[FEA]','');
  for(const field of FEA_FIELDS)lines.push(`### ${field.label}`,'',markdownValue(standardValue(state,field.key),field),'');
  appendStandardDocument(lines,state,'ARD',3);
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
  const markdown=buildCumulativeMarkdown(row,row.state||{},phase,versions);
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
  return { status: 200, body: { documents: rows } };
}

export async function uploadMarkdownDocument(identity, projectCode, documentType, requestedPhase, name, bytes) {
  const markdown = validateMarkdownUpload(name, bytes);
  return withTransaction(async client => {
    const access = await documentAccess(client, identity, projectCode, true, documentType);
    if (!access) return { status: 403, body: { error: '이 문서를 작성할 권한이 없습니다.' } };
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
    const state = intake.state || {};
    state.markdownDocuments = { ...(state.markdownDocuments || {}), [documentType]: completionEntry(state.markdownDocuments?.[documentType], row) };
    await client.query(`update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'::jsonb),'{portalState}',$2::jsonb),updated_at=now() where id=$1`, [intake.id, JSON.stringify(state)]);
    await client.query(`insert into agent_portal.audit_logs
      (actor_user_id,project_id,action_code,entity_type,entity_id,after_data)
      values($1,$2,'MARKDOWN_DOCUMENT_UPLOAD','markdown_document',$3,$4::jsonb)`,
      [access.actor.id, access.project.id, row.id, JSON.stringify({ documentType, phase, version, name: row.original_name, size: bytes.length, checksum })]);
    return { status: 201, body: { document: { id: row.id, documentType, phase, version, name: row.original_name, size: bytes.length, checksum, authorName: row.author_name, createdAt: row.created_at } } };
  });
}

export async function readMarkdownDocument(identity, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 404, body: { error: '문서를 찾지 못했습니다.' } };
  const pool = getPool();
  const metadata = (await pool.query(`select p.project_code from agent_portal.markdown_document_versions v join agent_portal.projects p on p.id=v.project_id where v.id=$1 and p.deleted_at is null`, [id])).rows[0];
  if (!metadata || !await documentAccess(pool, identity, metadata.project_code)) return { status: 404, body: { error: '문서를 찾지 못했습니다.' } };
  const row = (await pool.query(`select v.id::text, v.document_type as "documentType", v.lifecycle_phase as phase,
      v.version_number as version, v.original_name as name, v.content_markdown as markdown,
      v.byte_size as size, v.checksum_sha256 as checksum, v.created_at as "createdAt", u.display_name as "authorName"
    from agent_portal.markdown_document_versions v join agent_portal.users u on u.id=v.created_by where v.id=$1`, [id])).rows[0];
  return { status: 200, body: { document: row } };
}
