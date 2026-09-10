'use client';
import {useEffect,useRef,useState} from 'react';
export default function NativeAgentWorkspace({projectNo,document,onCompleted,devRole}:{projectNo:string;document:'INT'|'FEA'|'ARD';onCompleted:()=>void;devRole?:string}){
 const headers:Record<string,string>=devRole?{'x-portal-dev-role':devRole}:{};
 const frame=useRef<HTMLIFrameElement>(null);
 const [versions,setVersions]=useState<Array<{id:string;version_number:number;created_at:string}>>([]);
 const loadHistory=()=>fetch(`/api/native-agent/${projectNo}?document=${document}&path=/portal/history`,{headers}).then(async response=>{if(!response.ok)return;const data=await response.json();setVersions(data.versions||[]);}).catch(()=>{});
 useEffect(()=>{loadHistory();},[projectNo,document,devRole]);
 useEffect(()=>{function receive(event:MessageEvent){if(event.origin===window.location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='native-agent-completed'&&event.data.project===projectNo)onCompleted();}window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[projectNo,onCompleted]);
 return <section className="native-agent-workspace"><iframe ref={frame} title={`${projectNo} ${document} 작성 Agent`} src={`/api/native-agent/${projectNo}/workspace?document=${document}&devRole=${encodeURIComponent(devRole||'')}`} style={{width:'100%',height:'850px',border:'1px solid #dce4f0',borderRadius:12}}/><details onToggle={event=>{if(event.currentTarget.open)loadHistory();}}><summary>Markdown 버전 이력 ({versions.length})</summary>{versions.map(v=><p key={v.id}><a href={`/api/native-agent/${projectNo}?document=${document}&path=/portal/version/${v.id}`}>{projectNo}-{document}.md · v{v.version_number}</a> · {new Date(v.created_at).toLocaleString('ko-KR')}</p>)}</details></section>;
}
