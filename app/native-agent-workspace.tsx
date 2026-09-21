'use client';
import {useEffect,useRef,useState} from 'react';
import {MarkdownView} from './markdown-document-workspace';
import {formatKst} from '../shared/portal-time.mjs';
export default function NativeAgentWorkspace({projectNo,document,onCompleted,devRole}:{projectNo:string;document:'INT'|'FEA'|'ARD';onCompleted:(projectCode?:string)=>void;devRole?:string}){
 const headers:Record<string,string>=devRole?{'x-portal-dev-role':devRole}:{};
 const frame=useRef<HTMLIFrameElement>(null);
 const [frameHeight,setFrameHeight]=useState(850);
 const [access,setAccess]=useState<{mode:string;status:string;hasFinal?:boolean;recommendation?:string;track?:string;autonomy?:string}|null>(null);
 const [final,setFinal]=useState<{markdown:string;version:number}|null>(null);
 useEffect(()=>{let active=true;setFinal(null);if(access?.hasFinal)fetch(`/api/native-agent/${projectNo}?document=${document}&path=/portal/final`,{headers}).then(async r=>{if(!r.ok)throw Error('최종본을 불러오지 못했습니다.');return r.json();}).then(data=>{if(active)setFinal(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectNo,document,access]);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;setAccess(null);setError('');fetch(`/api/native-agent/${projectNo}?document=${document}&path=/portal/access`,{headers}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'권한을 확인하지 못했습니다.');if(active)setAccess(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectNo,document,devRole]);
 const [versions,setVersions]=useState<Array<{id:string;version_number:number;created_at:string}>>([]);
 const loadHistory=()=>fetch(`/api/native-agent/${projectNo}?document=${document}&path=/portal/history`,{headers}).then(async response=>{if(!response.ok)return;const data=await response.json();setVersions(data.versions||[]);}).catch(()=>{});
 useEffect(()=>{if(access?.mode==='full')loadHistory();},[projectNo,document,devRole,access?.mode]);
 useEffect(()=>{function receive(event:MessageEvent){
  if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||event.data?.project!==projectNo)return;
  if(event.data.type==='native-agent-height'&&Number.isFinite(event.data.height))setFrameHeight(Math.max(300,Math.ceil(event.data.height)));
  if(event.data.type==='native-agent-completed'){
   if(document==='INT')setAccess(value=>value?{...value,status:'작성 완료',hasFinal:true}:value);
   onCompleted(event.data.projectCode||projectNo);
  }
 }window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[projectNo,document,onCompleted]);
 if(error)return <section role="alert" style={{padding:24}}>{error}</section>;
 if(!access)return <section style={{padding:24}}>문서 접근 권한을 확인하고 있습니다.</section>;
 const finalView=final?<section className="workflow-v31-panel"><h3>{document} 작성 최종본 · v{final.version} · 읽기 전용</h3><MarkdownView value={final.markdown}/></section>:null;
 if(access.mode==='final'||document==='INT'&&access.hasFinal)return finalView||<p>작성 최종본을 불러오고 있습니다.</p>;
 if(access.mode!=='full')return <section style={{padding:24,border:'1px solid #dce4f0',borderRadius:12,background:'#f7f9fc',color:'#173b67'}}><h3>{document==='FEA'?'타당성 평가':'요구 정의'} · {access.status}</h3>{access.mode==='recommendation'?<><p>Agent 판정 권고 · 읽기 전용</p><p style={{whiteSpace:'pre-wrap'}}>{access.recommendation||'아직 생성된 판정 권고가 없습니다.'}</p>{access.track&&<p>트랙: {access.track}</p>}{access.autonomy&&<p>자율성: {access.autonomy}</p>}<small>문서 내용과 인터뷰는 팀장·Admin만 조회하고 작성할 수 있습니다. 권고는 최종 승인이 아닙니다.</small></>:<p>해당 단계의 진행 현황만 확인할 수 있습니다.</p>}</section>;
 return <section className="native-agent-workspace"><iframe ref={frame} title={`${projectNo} ${document} 작성 Agent`} src={`/api/native-agent/${projectNo}/workspace?document=${document}&devRole=${encodeURIComponent(devRole||'')}`} style={{display:'block',width:'100%',height:frameHeight,border:'1px solid #dce4f0',borderRadius:12}}/>{finalView}<details onToggle={event=>{if(event.currentTarget.open)loadHistory();}}><summary>Markdown 버전 이력 ({versions.length})</summary>{versions.map(v=><p key={v.id}><a href={`/api/native-agent/${projectNo}?document=${document}&path=/portal/version/${v.id}`}>{projectNo}-{document}.md · v{v.version_number}</a> · {formatKst(v.created_at)}</p>)}</details></section>;
}
