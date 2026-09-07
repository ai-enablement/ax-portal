import { resolvePortalIdentity } from '../../../server/auth.mjs';
import { listMarkdownDocuments, uploadMarkdownDocument } from '../../../server/markdown-documents.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const identity = resolvePortalIdentity(request.headers);
  if (!identity) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const result = await listMarkdownDocuments(identity, new URL(request.url).searchParams.get('project') || '');
    return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error.code === '42P01') return Response.json({ error: 'Markdown 문서 저장 테이블이 준비되지 않았습니다.' }, { status: 503 });
    console.error('Markdown history failed:', error.message);
    return Response.json({ error: '문서 이력을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request) {
  const identity = resolvePortalIdentity(request.headers);
  if (!identity) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const reader = request.body?.getReader(); const chunks = []; let size = 0;
    if (!reader) return Response.json({ error: '파일을 선택해 주세요.' }, { status: 400 });
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 6 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: 'Markdown 파일은 5MB 이하로 첨부해 주세요.' }, { status: 413 }); } chunks.push(value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return Response.json({ error: '파일을 선택해 주세요.' }, { status: 400 });
    const result = await uploadMarkdownDocument(identity, String(form.get('project') || ''), String(form.get('document') || ''), String(form.get('phase') || ''), file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error.code === '42P01') return Response.json({ error: 'Markdown 문서 저장 테이블이 준비되지 않았습니다.' }, { status: 503 });
    console.error('Markdown upload failed:', error.message);
    return Response.json({ error: /Markdown|\.md|UTF-8|내용이/.test(error.message) ? error.message : '문서를 저장하지 못했습니다.' }, { status: 400 });
  }
}
