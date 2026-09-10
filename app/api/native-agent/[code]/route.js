import {resolvePortalIdentity} from '../../../../server/auth.mjs';
import {isSameOriginRequest} from '../../../../server/request-origin.mjs';
import {nativeAgentRequest} from '../../../../server/native-agent.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(request,context){
 try{
  const identity=resolvePortalIdentity(request.headers);
  if(!identity)return Response.json({error:'MS 로그인이 필요합니다.'},{status:401});
  const url=new URL(request.url),{code}=await context.params;
  let input={path:url.searchParams.get('path')||'/api/bootstrap',document:url.searchParams.get('document')||'INT',method:'GET'};
  if(request.method==='POST'){
   if(!isSameOriginRequest(request))return Response.json({error:'Invalid origin'},{status:403});
   const text=await request.text();if(Buffer.byteLength(text)>1024*1024)return Response.json({error:'입력이 너무 큽니다.'},{status:413});
   input=JSON.parse(text);
  }
  const result=await nativeAgentRequest(identity,code,input.document,input.path,input.method,input.data||{},input.revision);
  const headers={'cache-control':'private, no-store','x-agent-revision':String(result.revision??0),'x-agent-can-edit':String(Boolean(result.canEdit))};
  if(result.text!=null){headers['content-type']=result.contentType;headers['content-disposition']=`attachment; filename="${code}-${input.document}.${input.path.includes('fmt=doc')?'doc':'md'}"`;return new Response(result.text,{status:result.status,headers});}
  return Response.json(result.body,{status:result.status,headers});
 }catch(error){return Response.json({error:error.status?error.message:error.code==='42P01'?'Agent 문서 저장 테이블을 먼저 적용해 주세요.':'Agent 실행 환경 또는 저장 연결을 확인해 주세요.'},{status:error.status||503});}
}
export const GET=route;
export const POST=route;
