import { resolvePortalIdentity } from '../../../server/auth.mjs';
import { uploadDocumentFile } from '../../../server/document-files.mjs';
export const runtime='nodejs';
export async function POST(request) {
  const identity=resolvePortalIdentity(request.headers);
  if(!identity) return Response.json({error:'로그인이 필요합니다.'},{status:401});
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return Response.json({error:'Invalid origin.'},{status:403});
  try {
    // Bound the stream before parsing multipart; Content-Length alone is untrusted.
    const reader=request.body?.getReader(); const chunks=[]; let size=0;
    if(!reader) return Response.json({error:'파일을 선택해 주세요.'},{status:400});
    while(true){const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>6*1024*1024){await reader.cancel();return Response.json({error:'파일은 5MB 이하로 첨부해 주세요.'},{status:413});} chunks.push(value);}
    const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':request.headers.get('content-type')||''}}).formData();
    const file=form.get('file');
    if(!file || typeof file==='string') return Response.json({error:'파일을 선택해 주세요.'},{status:400});
    const result=await uploadDocumentFile(identity,String(form.get('project')),String(form.get('document')),String(form.get('field')),file.name,Buffer.from(await file.arrayBuffer()));
    return Response.json(result.body,{status:result.status,headers:{'cache-control':'no-store'}});
  } catch(error) {
    if(error.code==='42P01') return Response.json({error:'첨부파일 저장 테이블이 준비되지 않았습니다. 관리자에게 DB 업데이트를 요청해 주세요.'},{status:503});
    console.error('Document upload failed:',error.message);
    return Response.json({error: /파일|Invalid document/.test(error.message) ? error.message : '파일을 저장하지 못했습니다.'},{status:400});
  }
}
