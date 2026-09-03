import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './db/pool.mjs';
import { standardDocuments } from '../shared/standard-documents.mjs';
import { MAX_FILE_BYTES } from '../shared/document-content.mjs';

export function validateUpload(name, bytes) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('파일은 5MB 이하로 첨부해 주세요.');
  const ext = name.split('.').pop().toLowerCase();
  const types = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt:'text/plain', csv:'text/csv' };
  if (!types[ext]) throw new Error('PNG, JPG, WebP, PDF, DOCX, XLSX, PPTX, TXT, CSV 파일만 첨부할 수 있습니다.');
  const magic = bytes.subarray(0,12);
  const valid = ext === 'png' ? magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : ['jpg','jpeg'].includes(ext) ? magic[0] === 255 && magic[1] === 216 && magic[2] === 255
    : ext === 'webp' ? magic.toString('ascii',0,4) === 'RIFF' && magic.toString('ascii',8,12) === 'WEBP'
    : ext === 'pdf' ? magic.toString('ascii',0,5) === '%PDF-'
    : ['docx','xlsx','pptx'].includes(ext) ? magic[0] === 80 && magic[1] === 75 && magic[2] === 3 && magic[3] === 4
    : !bytes.includes(0);
  if (!valid) throw new Error('파일 확장자와 내용이 일치하지 않습니다.');
  return types[ext];
}
export async function documentAccess(client, identity, code, write = false, documentType) {
  if (!identity?.email) return null;
  const actor = (await client.query(`select id,app_role from agent_portal.users where lower(email)=lower($1) and is_active=true limit 1`,[identity.email])).rows[0];
  if (!actor) return null;
  const project = (await client.query(`select id,requester_id,owner_id,current_stage_code from agent_portal.projects where project_code=$1 and deleted_at is null`,[code])).rows[0];
  if (!project) return null;
  const members = (await client.query(`select user_id,relationship from agent_portal.project_members where project_id=$1 and ended_at is null`,[project.id])).rows;
  const same = id => String(id) === String(actor.id);
  const assigned = members.filter(m => m.relationship === 'developer');
  const canRead = ['admin','team_leader','team_member'].includes(actor.app_role) || same(project.requester_id) || same(project.owner_id) || members.some(m=>same(m.user_id));
  const canWrite = actor.app_role === 'admin' || (actor.app_role !== 'general_user' && (assigned.length ? assigned.some(m=>same(m.user_id)) : ['team_member','team_leader'].includes(actor.app_role)));
  const order = ['INT','FEA','G1','ARD','G2','DES','G3','PILOT','G4','OPS'];
  const target = { ARD:3, DES:5, EVP:5, EVR:5, DEP:7, UG:7, OPS:9, CHG:9 }[documentType];
  if (!canRead || (write && (!canWrite || target === undefined || order.indexOf(project.current_stage_code) < target))) return null;
  return {actor,project};
}
export async function uploadDocumentFile(identity, projectCode, documentType, fieldKey, name, bytes) {
  const type = validateUpload(name, bytes);
  const definition = standardDocuments[documentType];
  if (!definition || !definition.sections.some(s => s.fields.some(f=>`${s.id}.${f.id}`===fieldKey) || `${s.id}.__attachments`===fieldKey)) throw new Error('Invalid document field.');
  return withTransaction(async client => {
    const access = await documentAccess(client,identity,projectCode,true,documentType);
    if (!access) return {status:403,body:{error:'이 문서에 파일을 첨부할 권한이 없습니다.'}};
    await client.query('select id from agent_portal.projects where id=$1 for update',[access.project.id]);
    const total = (await client.query('select coalesce(sum(byte_size),0) as total from agent_portal.document_files where project_id=$1',[access.project.id])).rows[0];
    if (Number(total.total)+bytes.length>100*1024*1024) return {status:413,body:{error:'과제별 첨부 용량 100MB를 초과했습니다.'}};
    const id=randomUUID(); const safeName=name.replace(/[\r\n\\/]/g,'_').slice(0,200);
    await client.query(`insert into agent_portal.document_files (id,project_id,document_type,field_key,original_name,mime_type,byte_size,content,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,access.project.id,documentType,fieldKey,safeName,type,bytes.length,bytes,access.actor.id]);
    return {status:201,body:{file:{id,name:safeName,type,size:bytes.length}}};
  });
}
export async function readDocumentFile(identity,id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const pool=getPool();
  const metadata=(await pool.query(`select f.id,p.project_code from agent_portal.document_files f join agent_portal.projects p on p.id=f.project_id where f.id=$1 and p.deleted_at is null`,[id])).rows[0];
  if (!metadata || !await documentAccess(pool,identity,metadata.project_code)) return null;
  return (await pool.query('select original_name,mime_type,content from agent_portal.document_files where id=$1',[id])).rows[0];
}
