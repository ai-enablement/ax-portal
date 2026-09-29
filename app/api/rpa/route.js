import {resolvePortalIdentity} from '../../../server/auth.mjs';
import {setRpaVisibility} from '../../../server/rpa-visibility.mjs';
import {rpaNotifications} from '../../../shared/rpa-notifications.mjs';
import {updateRpaRequest,deleteRpaRequest,createRpaMaster,updateRpaMaster,deleteRpaMaster} from '../../../server/rpa-management.mjs';
import {isSameOriginRequest} from '../../../server/request-origin.mjs';
import {listRpa,createRpaRequest,linkRpaPic,readRpaFile,updateRpaPics} from '../../../server/rpa-portal.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const errorResponse=e=>Response.json({error:e.status?e.message:e.code==='42P01'?'RPA 데이터 초기 등록이 필요합니다.':'RPA 데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:e.status||503,headers:{'Cache-Control':'no-store'}});
export async function GET(request){try{
 const identity=resolvePortalIdentity(request.headers);if(!identity)return Response.json({error:'로그인이 필요합니다.'},{status:401});
 const fileId=new URL(request.url).searchParams.get('file');
 if(fileId){const f=await readRpaFile(identity,fileId);return new Response(f.content,{headers:{'Content-Type':f.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 const data=await listRpa(identity);
 return Response.json(new URL(request.url).searchParams.has('notifications')?{notifications:rpaNotifications(data)}:data,{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
export async function POST(request){try{
 if(!isSameOriginRequest(request))return Response.json({error:'Invalid origin'},{status:403});
 const identity=resolvePortalIdentity(request.headers);if(!identity)return Response.json({error:'로그인이 필요합니다.'},{status:401});
 const reader=request.body?.getReader();let size=0;const chunks=[];if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>15*1024*1024){await reader.cancel();return Response.json({error:'요청 용량을 초과했습니다.'},{status:413});}chunks.push(Buffer.from(value));}}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return Response.json({error:'잘못된 요청입니다.'},{status:400});}
 if(body.action==='link')return Response.json(await linkRpaPic(identity,body));
 if(body.action==='pics')return Response.json(await updateRpaPics(identity,body));
 if(body.action==='request-delete')return Response.json(await deleteRpaRequest(identity,body));
 if(body.action==='update')return Response.json(await updateRpaRequest(identity,body));
 if(body.action==='master')return Response.json(await createRpaMaster(identity,body),{status:201});
 if(body.action==='master-update')return Response.json(await updateRpaMaster(identity,body));
 if(body.action==='master-delete')return Response.json(await deleteRpaMaster(identity,body));
 if(body.action==='master-visibility')return Response.json(await setRpaVisibility(identity,body));
 if(body.action!=='create')return Response.json({error:'지원하지 않는 작업입니다.'},{status:400});
 return Response.json(await createRpaRequest(identity,body),{status:201});
}catch(e){return errorResponse(e);}}
