import { resolvePortalIdentity } from '../../../../server/auth.mjs';
import { readDocumentFile } from '../../../../server/document-files.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,context) {
  const identity=resolvePortalIdentity(request.headers);
  if(!identity)return new Response(null,{status:401});
  try {
    const {id}=await context.params; const file=await readDocumentFile(identity,id);
    if(!file)return new Response(null,{status:404});
    const inline=['image/png','image/jpeg','image/webp'].includes(file.mime_type) && new URL(request.url).searchParams.get('inline')==='1';
    return new Response(file.content,{headers:{'content-type':file.mime_type,'content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
  }catch(error){console.error('Document download failed:',error.message);return new Response(null,{status:500});}
}
