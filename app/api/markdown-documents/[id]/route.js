import { resolvePortalIdentity } from '../../../../server/auth.mjs';
import { readMarkdownDocument } from '../../../../server/markdown-documents.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const identity = resolvePortalIdentity(request.headers);
  if (!identity) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await readMarkdownDocument(identity, id);
    return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch (error) {
    console.error('Markdown read failed:', error.message);
    return Response.json({ error: '문서를 열지 못했습니다.' }, { status: 500 });
  }
}
