import {resolvePortalIdentity} from '../../../../server/auth.mjs';
import {isSameOriginRequest} from '../../../../server/request-origin.mjs';
import {historicalAdminUpdate} from '../../../../server/historical-admin.mjs';
export const runtime='nodejs';
export async function POST(request,context){
 try{
  const identity=resolvePortalIdentity(request.headers);
  if(!identity)return Response.json({error:'로그인이 필요합니다.'},{status:401});
  if(!isSameOriginRequest(request))return Response.json({error:'Invalid origin'},{status:403});
  const text=await request.text();if(Buffer.byteLength(text)>2*1024*1024)return Response.json({error:'파일이 너무 큽니다.'},{status:413});
  return Response.json(await historicalAdminUpdate(identity,(await context.params).code,JSON.parse(text)));
 }catch(error){return Response.json({error:error.status?error.message:'이관 변경을 저장하지 못했습니다.'},{status:error.status||500});}
}
