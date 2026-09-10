import fs from 'node:fs/promises';
import path from 'node:path';
import {resolvePortalIdentity} from '../../../../../server/auth.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,context){
 if(!resolvePortalIdentity(request.headers))return new Response('MS 로그인이 필요합니다.',{status:401});
 const {code}=await context.params,doc=new URL(request.url).searchParams.get('document')||'INT';
 const requestedRole=new URL(request.url).searchParams.get('devRole');
 const role=resolvePortalIdentity(request.headers)?.canSwitchRole&&['admin','team_leader','team_member','general_user','bts','bp_solution'].includes(requestedRole)?requestedRole:'';
 if(!/^\d{4}-\d{3}$/.test(code)||!['INT','FEA','ARD'].includes(doc))return new Response('Invalid project',{status:400});
 let html=await fs.readFile(path.join(process.cwd(),'server/vendor/intake-agent/templates/index.html'),'utf8');
 const init=`<script>
 var PORTAL_CODE=${JSON.stringify(code)}, PORTAL_DOC=${JSON.stringify(doc)}, PORTAL_REVISION=0, PORTAL_ROLE=${JSON.stringify(role)};
 var portalFetch=window.fetch.bind(window), portalQueue=Promise.resolve();
 var portalReadOnly=false;
 function enforceReadOnly(){if(!portalReadOnly)return;document.querySelectorAll('input,textarea,select,button').forEach(function(el){if(!el.matches('[data-export],#noticeOk,#noticeX,#docX,#docDlMd,#docDlDoc'))el.disabled=true;});}
 new MutationObserver(enforceReadOnly).observe(document.documentElement,{childList:true,subtree:true});
 window.fetch=function(url,options){
  if(url==='/ping')return Promise.resolve(new Response('{}',{status:200}));
  var run=function(){var opts=options||{},method=opts.method||'GET',endpoint='/api/native-agent/'+PORTAL_CODE;
   if(method==='GET')endpoint+='?document='+PORTAL_DOC+'&path='+encodeURIComponent(url);
   var headers=PORTAL_ROLE?{'x-portal-dev-role':PORTAL_ROLE}:{};
   return portalFetch(endpoint,method==='GET'?{headers:headers}:{method:'POST',headers:Object.assign(headers,{'Content-Type':'application/json'}),body:JSON.stringify({document:PORTAL_DOC,path:url,method:method,data:JSON.parse(opts.body||'{}'),revision:PORTAL_REVISION})}).then(function(r){
    if(r.headers.has('x-agent-revision'))PORTAL_REVISION=Number(r.headers.get('x-agent-revision'));
    if(r.ok){portalReadOnly=r.headers.get('x-agent-can-edit')==='false';enforceReadOnly();window.parent.postMessage({type:'native-agent-saved',project:PORTAL_CODE,revision:PORTAL_REVISION},location.origin);}
    return r;
   });};
  var pending=portalQueue.then(run);portalQueue=pending.then(function(){},function(){});return pending;
 };
 window.__exportStandalone=function(no,code,fmt){var a=document.createElement('a');a.href='/api/native-agent/'+PORTAL_CODE+'?document='+PORTAL_DOC+'&path='+encodeURIComponent('/api/export/'+PORTAL_CODE+'/'+code+'?fmt='+fmt);a.click();};
 </script><style>
 .hero,.tabs,#btnNew,#btnNew2,#btnSettings,#feaPick,#ardPick,#btnGoFea {display:none!important;}
 body{background:#fff!important;} .app{max-width:none!important;padding:10px!important;}
 input,textarea,select,button{font-size:14px!important;}
 </style>`;
 html=html.replace('<script>',init+'<script>');
 html=html.replace("var no = $('#feaPick').value;","var no = PORTAL_CODE;");
 html=html.replace("var no = $('#ardPick').value;","var no = PORTAL_CODE;");
 html=html.replace("goTab(p.fea_form && Object.keys(p.fea_form).length ? 'fea' : 'intake');","goTab({INT:'intake',FEA:'fea',ARD:'ard'}[PORTAL_DOC]);");
 html=html.replace('boot().then(function(){ loadDocs(); });','boot().then(function(){ openProject(PORTAL_CODE); });');
 // The explicit verify button awaits validation, generation, persistence and
 // completion as one request. No second confirmation or detached promise.
 for(const stage of ['intake','fea','ard'])html=html.replaceAll("post('/api/"+stage+"/verify',", "post('/portal/verify-complete',");
 html=html.replaceAll('toast(r.done ?', 'offerPortalCompletion(r); toast(r.done ?');
 for(const id of ['btnVerify','btnFeaVerify','btnArdVerify'])html=html.replaceAll("$('#"+id+"').disabled = false;", "$('#"+id+"').disabled = portalReadOnly;");
 html=html.replace('  /* ═══════════════ 검증 (좌 → 우) ═══════════════ */', `
  function offerPortalCompletion(result){
    if(!result.portalCompleted)return;
    portalReadOnly=true;enforceReadOnly();
    window.parent.postMessage({type:'native-agent-completed',project:PORTAL_CODE},location.origin);
  }
  /* ═══════════════ 검증 (좌 → 우) ═══════════════ */`);
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'"}});
}
