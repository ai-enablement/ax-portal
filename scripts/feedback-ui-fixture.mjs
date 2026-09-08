// Explicit local-only UI fixture. No DB writes, Azure calls or mail delivery.
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {applyWorkflow,sanitizeNewWorkflow} from '../server/workflow-v31.mjs';
import {applyImportLifecycle} from '../shared/historical-import-policy.mjs';
import {applyMarkdownUpload,validateMarkdownUpload} from '../server/markdown-documents.mjs';
import {parseArdLiteMarkdown} from '../shared/fast-track.mjs';
import {progress} from '../shared/intake-agent.mjs';
if(process.env.NODE_ENV==='production')throw new Error('Fixture must never run in production.');
const actor={id:1,app_role:'admin',display_name:'UI 검증 관리자',is_active:true};
const base={source:'database',owner:'검증 요구자',requester:'검증 요구자 · 검증팀',projectOwner:'검증 Owner',requesterId:'1',ownerId:'1',requesterEmail:'review@example.invalid',projectOwnerEmail:'review@example.invalid',category:'개별 접수',description:'실제 데이터가 아닌 UI 검증용',receivedDate:'2026-09-01',requestedDate:'2026-10-01',status:'작성 중',updated:'2026-09-08',progress:50,workflowVersion:'3.1',workflowTrack:'MEDIUM',developerIds:['1'],developerNames:['UI 검증 관리자'],intakeAnswers:['회의 자료 취합','','','','2026-10-01'],intakeDetails:{performer:'팀원',countPerMonth:'20',asIsMinutes:'10',people:'1',failureImpact:'회의 지연'}};
let projects=[{...base,no:'2026-044',name:'[검증] 최신 Fast Track',journeyStep:5,deliveryPhase:'development',fastTrack:{requested:true,status:'GF_APPROVED'}},{...base,no:'2026-033',name:'[검증] 문서 첨부·이관 과제',journeyStep:5,deliveryPhase:'design',historicalImport:true,historicalBaselineStep:5,historicalResumeStep:5,documentsDeferred:true},{...base,no:'2026-045',name:'[검증] Fast Track 요구정의',journeyStep:0,intakeDraftCompleted:true,intakeReview:{at:'2026-09-08T00:00:00Z'},fastTrack:{requested:true,status:'QUALIFIED',externalFactor:'AUDIT',externalDeadline:'2026-10-01',externalReason:'UI 검증'}}];
const documents=[];
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4196');
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(!url.pathname.startsWith('/api/')){
    const proxy=http.request({hostname:'127.0.0.1',port:4194,path:req.url,method:req.method,headers:req.headers},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
    proxy.on('error',()=>{res.writeHead(502);res.end('Start local Next.js on port 4194.');});req.pipe(proxy);return;
  }
  try{
    const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
    const body=raw.length&&req.headers['content-type']?.includes('application/json')?JSON.parse(raw):{};
    if(url.pathname==='/api/auth/session')return json({userId:'1',email:'review@example.invalid',displayName:actor.display_name,appRole:'admin',accountRole:'admin',source:'entra',canSwitchRole:false});
    if(url.pathname==='/api/database/health')return json({status:'ok'});
    if(url.pathname==='/api/database/gallery/applications')return json({applications:[]});
    if(url.pathname.includes('/governance/users'))return json({users:[{id:'1',email:'review@example.invalid',displayName:actor.display_name,appRole:'admin',isActive:true}]});
    if(url.pathname==='/api/database/projects'){
      if(req.method==='GET')return json({projects});
      const project={...body.project,...sanitizeNewWorkflow(body.project),no:'2099-901',source:'database'};projects.push(project);return json({project},201);
    }
    if(url.pathname.startsWith('/api/database/projects/')){
      const no=url.pathname.split('/').pop(),old=projects.find(p=>p.no===no);
      if(!old)return json({error:'Unknown fixture project'},404);
      const changes=body.changes||{},merged=applyImportLifecycle(old,changes,old.journeyStep);
      const project=applyWorkflow(old,changes,merged,actor,{id:1,requester_id:1,owner_id:1});
      projects=projects.map(p=>p.no===no?project:p); // deliberately retain latest project at the top
      const response={...project};delete response.source;delete response.requesterId;delete response.ownerId;
      return json({project:response});
    }
    if(url.pathname==='/api/markdown-documents'){
      if(req.method==='GET')return json({documents:documents.filter(d=>d.project===url.searchParams.get('project')).toReversed()});
      const form=await new Response(raw,{headers:{'content-type':req.headers['content-type']}}).formData();
      const file=form.get('file'),bytes=Buffer.from(await file.arrayBuffer()),markdown=validateMarkdownUpload(file.name,bytes);
      const no=form.get('project'),type=form.get('document'),phase=form.get('phase'),version=documents.filter(d=>d.project===no&&d.documentType===type).length+1;
      const item={id:randomUUID(),project:no,documentType:type,phase,version,name:file.name,size:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString(),authorName:actor.display_name,markdown};
      const row={id:item.id,lifecycle_phase:phase,version_number:version,original_name:file.name,author_name:actor.display_name,created_at:item.createdAt};
      projects=projects.map(p=>p.no===no?{...applyMarkdownUpload(p,type,row).state,...(type==='ARD_LITE'?{ardLite:parseArdLiteMarkdown(markdown)}:{})}:p);documents.push(item);
      return json({document:item},201);
    }
    if(url.pathname.startsWith('/api/markdown-documents/'))return json({document:documents.find(d=>d.id===url.pathname.split('/').pop())});
    if(url.pathname.startsWith('/api/intake-agent/')){const p=projects.find(p=>p.no===url.pathname.split('/').pop());return json({configured:false,project:p,fields:[],session:{},messages:[],progress:progress(p),computed:{}});}
    return json({users:[],projects:[],history:[]});
  }catch(e){json({error:e.message},400);}
});
server.listen(4196,'127.0.0.1',()=>console.log('Isolated in-memory UI fixture: http://127.0.0.1:4196 (no DB or mail)'));
