import { resolvePortalIdentity } from '../../../../server/auth.mjs';
import { exportCumulativeMarkdown } from '../../../../server/markdown-documents.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  const identity=resolvePortalIdentity(request.headers);
  if(!identity)return Response.json({error:'로그인이 필요합니다.'},{status:401});
  try{
    const url=new URL(request.url);const result=await exportCumulativeMarkdown(identity,url.searchParams.get('project')||'',url.searchParams.get('phase')||'');
    if(result.status!==200)return Response.json(result.body,{status:result.status});
    return new Response(result.body.markdown,{status:200,headers:{'content-type':'text/markdown; charset=utf-8','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.body.name)}`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }catch(error){console.error('Cumulative Markdown export failed:',error.message);return Response.json({error:'누적 문서를 생성하지 못했습니다.'},{status:500});}
}
