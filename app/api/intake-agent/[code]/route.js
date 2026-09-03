import {resolvePortalIdentity} from '../../../../server/auth.mjs';
import {AgentError,handleAgentRequest} from '../../../../server/intake-agent.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(request,context) {
  try {
    const identity=resolvePortalIdentity(request.headers);
    if(!identity) throw new AgentError(401,'MS 로그인이 필요합니다.');
    if(request.method==='POST' && request.headers.get('sec-fetch-site')==='cross-site') throw new AgentError(403,'포털에서 다시 요청해 주세요.');
    let body={};
    if(request.method==='POST') {
      const text=await request.text();
      if(Buffer.byteLength(text)>20000) throw new AgentError(413,'요청이 너무 큽니다.');
      try {body=JSON.parse(text);} catch {throw new AgentError(400,'잘못된 요청 형식입니다.');}
      if(!body || typeof body!=='object' || Array.isArray(body)) throw new AgentError(400,'잘못된 요청 형식입니다.');
    }
    const {code}=await context.params;
    return Response.json(await handleAgentRequest({method:request.method,identity,code,body}),{headers:{'cache-control':'no-store'}});
  } catch(error) {
    // Never log Azure response bodies, message contents, endpoint or credentials.
    return Response.json({error:error instanceof AgentError?error.message:'저장 연결을 확인해 주세요. 처리 결과는 새로고침하여 확인할 수 있습니다.'},{status:error instanceof AgentError?error.status:500,headers:{'cache-control':'no-store'}});
  }
}
export const GET=route;
export const POST=route;
