import fs from 'node:fs/promises';
import path from 'node:path';
import {resolvePortalIdentity} from '../../../../../server/auth.mjs';
import {isProjectCode} from '../../../../../shared/project-code.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,context){
 if(!resolvePortalIdentity(request.headers))return new Response('MS 로그인이 필요합니다.',{status:401});
 const {code}=await context.params,doc=new URL(request.url).searchParams.get('document')||'INT';
 const requestedRole=new URL(request.url).searchParams.get('devRole');
 const role=resolvePortalIdentity(request.headers)?.canSwitchRole&&['admin','team_leader','team_member','general_user','bts','bp_solution'].includes(requestedRole)?requestedRole:'';
 if(!isProjectCode(code)||!['INT','FEA','ARD'].includes(doc))return new Response('Invalid project',{status:400});
 let html=await fs.readFile(path.join(process.cwd(),'server/vendor/intake-agent/templates/index.html'),'utf8');
 const init=`<script>
 var PORTAL_CODE=${JSON.stringify(code)}, PORTAL_DOC=${JSON.stringify(doc)}, PORTAL_REVISION=0, PORTAL_ROLE=${JSON.stringify(role)};
 var portalFetch=window.fetch.bind(window), portalQueue=Promise.resolve();
 var portalReadOnly=false;
 function portalKst(value){var date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':value;}
 function offerPortalCompletion(result){
  if(!result.portalCompleted)return;
  portalReadOnly=true;enforceReadOnly();
  window.parent.postMessage({type:'native-agent-completed',project:PORTAL_CODE,projectCode:result.projectCode||PORTAL_CODE},location.origin);
 }
 window.addEventListener('DOMContentLoaded',function(){
  var root=document.querySelector('.app'),queued=false,lastHeight=0;
  function addFolds(){
   root.querySelectorAll('.card > .card-head,.fsec > h4').forEach(function(head){
    if(head.querySelector('[data-portal-fold]'))return;
    var section=head.parentElement,button=document.createElement('button');
    button.type='button';button.className='portal-fold';button.setAttribute('data-portal-fold','');
    var label=(head.querySelector('h2')||head).textContent.trim();
    button.setAttribute('aria-expanded','true');button.setAttribute('aria-label',label+' 접기');button.textContent='접기 ▴';
    button.addEventListener('click',function(){
     var folded=section.classList.toggle('portal-folded');
     button.setAttribute('aria-expanded',String(!folded));button.setAttribute('aria-label',label+(folded?' 펼치기':' 접기'));button.textContent=folded?'펼치기 ▾':'접기 ▴';schedule();
    });
    head.appendChild(button);
   });
  }
  function resize(){
   queued=false;
   addFolds();
   document.querySelectorAll('.app textarea').forEach(function(el){if(!el.getClientRects().length)return;el.style.height='auto';el.style.height=el.scrollHeight+'px';});
   var height=Math.ceil(root.getBoundingClientRect().height)+24;
   if(height!==lastHeight){lastHeight=height;window.parent.postMessage({type:'native-agent-height',project:PORTAL_CODE,height:height},location.origin);}
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(resize);}}
  if(root){new ResizeObserver(schedule).observe(root);new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true});document.addEventListener('input',schedule);schedule();}
 });
 function enforceReadOnly(){if(!portalReadOnly)return;document.querySelectorAll('input,textarea,select,button').forEach(function(el){if(!el.matches('[data-portal-fold],[data-export],#noticeOk,#noticeX,#docX,#docDlMd,#docDlDoc'))el.disabled=true;});}
 new MutationObserver(enforceReadOnly).observe(document.documentElement,{childList:true,subtree:true});
 window.fetch=function(url,options){
  if(url==='/ping')return Promise.resolve(new Response('{}',{status:200}));
  var run=function(){var opts=options||{},method=opts.method||'GET',endpoint='/api/native-agent/'+PORTAL_CODE;
   if(method==='GET')endpoint+='?document='+PORTAL_DOC+'&path='+encodeURIComponent(url);
   var headers=PORTAL_ROLE?{'x-portal-dev-role':PORTAL_ROLE}:{};
   return portalFetch(endpoint,method==='GET'?{headers:headers}:{method:'POST',headers:Object.assign(headers,{'Content-Type':'application/json'}),body:JSON.stringify({document:PORTAL_DOC,path:url,method:method,data:JSON.parse(opts.body||'{}'),revision:PORTAL_REVISION})}).then(function(r){
    if(r.headers.has('x-agent-revision'))PORTAL_REVISION=Number(r.headers.get('x-agent-revision'));
    if(r.ok){portalReadOnly=r.headers.get('x-agent-can-edit')==='false';enforceReadOnly();window.parent.postMessage({type:'native-agent-saved',project:PORTAL_CODE,revision:PORTAL_REVISION},location.origin);}
    if(r.ok&&url==='/portal/finish')return r.clone().json().then(function(data){offerPortalCompletion(data);return r;});
    return r;
   });};
  var pending=portalQueue.then(run);portalQueue=pending.then(function(){},function(){});return pending;
 };
 window.__exportStandalone=function(no,code,fmt){var a=document.createElement('a');a.href='/api/native-agent/'+PORTAL_CODE+'?document='+PORTAL_DOC+'&path='+encodeURIComponent('/api/export/'+PORTAL_CODE+'/'+code+'?fmt='+fmt);a.click();};
 </script><style>
 .hero,.tabs,#btnNew,#btnNew2,#btnSettings,#feaPick,#ardPick,#btnGoFea {display:none!important;}
 body{background:#fff!important;} .app{max-width:none!important;padding:10px!important;}
 input,textarea,select,button{font-size:14px!important;}
 html,body{height:auto!important;min-height:0!important;overflow:hidden!important;}
 .app .form-scroll,.app .chat,.app .doc{height:auto!important;max-height:none!important;overflow:visible!important;}
 .app textarea{max-height:none!important;overflow:hidden!important;resize:none!important;}
 .app .split{align-items:start;}
 .app .portal-fold{margin-left:auto;flex-shrink:0;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--muted);padding:4px 8px;font-size:12px!important;cursor:pointer;}
 .app .portal-fold:hover{background:var(--line-2);color:var(--navy);}
 .app .portal-fold:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
 .app .card.portal-folded > :not(.card-head),.app .fsec.portal-folded > :not(h4){display:none!important;}
 .app .card.portal-folded > .card-head{margin-bottom:0;}
 </style>`;
 html=html.replace('<main class="main">','<main class="main app">');
 html=html.replace('<script>',init+'<script>');
 html=html.replace('function mdToHtml(md){', "function mdToHtml(md){md=String(md||'').replace(/\\b\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})\\b/g,portalKst);");
 html=html.replace("(a.at||'').replace('T',' ').replace('+00:00','')","portalKst(a.at)");
 html=html.replace("var no = $('#feaPick').value;","var no = PORTAL_CODE;");
 html=html.replace("var no = $('#ardPick').value;","var no = PORTAL_CODE;");
 html=html.replace("goTab(p.fea_form && Object.keys(p.fea_form).length ? 'fea' : 'intake');","goTab({INT:'intake',FEA:'fea',ARD:'ard'}[PORTAL_DOC]);");
 html=html.replace('boot().then(function(){ loadDocs(); });','boot().then(function(){ openProject(PORTAL_CODE); });');
 // Interview/repeat only collect information. Explicit completion cards persist
 // the final document and advance through the portal's own permission checks.
 for(const operation of ['/api/intake/finalize','/api/fea/complete','/api/ard/generate'])html=html.replaceAll("post('"+operation+"',", "post('/portal/finish',");
 for(const id of ['btnVerify','btnFeaVerify','btnArdVerify','btnIntComplete','btnArdComplete','btnSend','btnFeaSend','btnArdSend'])html=html.replaceAll("$('#"+id+"').disabled = false;", "$('#"+id+"').disabled = portalReadOnly;");
 html=html.replaceAll('b.disabled = false;', 'b.disabled = portalReadOnly;');
 html=html.replace("var card = box.closest('.card');", "var card = box.closest('.card');if(card){card.querySelectorAll('.portal-folded > h4 [data-portal-fold]').forEach(function(b){b.click();});if(card.classList.contains('portal-folded'))card.querySelector('.card-head [data-portal-fold]').click();}");
 html=html.replaceAll('3자 서명(7번)은 G2 에서 사람이 합니다.','요구자·Project Owner는 요구 정의 화면에서 승인하고, 팀장은 G2에서 개발 착수를 승인합니다.');
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'"}});
}
