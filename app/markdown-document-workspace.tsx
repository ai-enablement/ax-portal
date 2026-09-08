"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import "./markdown-document-workspace.css";
import {ARD_LITE_TEMPLATE} from "../shared/fast-track.mjs";

type Phase = "fast_track_requirements" | "design" | "development_evaluation" | "deployment_rollout";
type HistoryItem = { id:string; documentType:"DES"|"EVD"|"UG"|"ARD_LITE"; phase:Phase; version:number; name:string; size:number; checksum:string; createdAt:string; authorName:string };
type OpenDocument = HistoryItem & { markdown:string };

const phaseLabels:Record<Phase,string> = { fast_track_requirements:"최소 요구정의", design:"설계", development_evaluation:"개발·평가", deployment_rollout:"배포·확산" };
const documentLabels = { ARD_LITE:"최소 요구정의서[ARD-Lite]", DES:"에이전트 설계서[DES]", EVD:"개발·평가 문서[EVD]", UG:"사용자 가이드[UG]" } as const;

function inlineText(value:string) {
  const pieces=value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return pieces.map((piece,index)=>piece.startsWith('`')&&piece.endsWith('`')?<code key={index}>{piece.slice(1,-1)}</code>:piece.startsWith('**')&&piece.endsWith('**')?<strong key={index}>{piece.slice(2,-2)}</strong>:piece);
}

function MarkdownView({value}:{value:string}) {
  const lines=value.replace(/\r\n/g,'\n').split('\n'); const nodes=[]; let i=0;
  while(i<lines.length){
    const line=lines[i];
    if(line.startsWith('```')){const language=line.slice(3).trim();const body=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))body.push(lines[i++]);i++;nodes.push(<pre key={nodes.length} data-language={language}><code>{body.join('\n')}</code></pre>);continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const level=heading[1].length;nodes.push(createElement(`h${level}`,{key:nodes.length},inlineText(heading[2])));i++;continue;}
    if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-+/.test(lines[i+1])){const rows=[];const cells=(text:string)=>text.replace(/^\s*\||\|\s*$/g,'').split('|').map(v=>v.trim());rows.push(cells(line));i+=2;while(i<lines.length&&lines[i].includes('|'))rows.push(cells(lines[i++]));nodes.push(<div className="md-table-scroll" key={nodes.length}><table><thead><tr>{rows[0].map((c,j)=><th key={j}>{inlineText(c)}</th>)}</tr></thead><tbody>{rows.slice(1).map((r,j)=><tr key={j}>{r.map((c,k)=><td key={k}>{inlineText(c)}</td>)}</tr>)}</tbody></table></div>);continue;}
    if(/^\s*[-*+]\s+/.test(line)){const items=[];while(i<lines.length&&/^\s*[-*+]\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*[-*+]\s+/,''));nodes.push(<ul key={nodes.length}>{items.map((item,j)=><li key={j}>{inlineText(item)}</li>)}</ul>);continue;}
    if(/^\s*\d+\.\s+/.test(line)){const items=[];while(i<lines.length&&/^\s*\d+\.\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*\d+\.\s+/,''));nodes.push(<ol key={nodes.length}>{items.map((item,j)=><li key={j}>{inlineText(item)}</li>)}</ol>);continue;}
    if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));nodes.push(<blockquote key={nodes.length}>{quote.join(' ')}</blockquote>);continue;}
    if(!line.trim()){i++;continue;}const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,6})\s|^```|^\s*[-*+]\s+|^\s*\d+\.\s+|^>/.test(lines[i]))paragraph.push(lines[i++]);nodes.push(<p key={nodes.length}>{inlineText(paragraph.join(' '))}</p>);
  }
  return <article className="markdown-rendered">{nodes}</article>;
}

type MarkdownPhaseRecord = { version?:number; status?:"draft"|"complete"; completedAt?:string };
type WorkspaceProject = { no:string; name:string; markdownDocuments?:Record<string,{phases?:Record<string,MarkdownPhaseRecord>}> };

function storedPhaseComplete(project:WorkspaceProject,phase:Phase){
  const code=phase==='fast_track_requirements'?'ARD_LITE':phase==='design'?'DES':'EVD',record=project.markdownDocuments?.[code]?.phases?.[phase];
  return Number(record?.version)>0&&(record?.status===undefined||record.status==='complete');
}

export default function MarkdownDocumentWorkspace({project,phase,canEdit,devRole,onComplete}:{project:WorkspaceProject;phase:Phase;canEdit:boolean;devRole?:string;onComplete:(phase:Phase,version:number)=>Promise<boolean|void>|boolean|void}) {
  const codes = phase==='fast_track_requirements'?['ARD_LITE'] as const:phase==='design'?['DES'] as const:phase==='development_evaluation'?['EVD'] as const:['EVD','UG'] as const;
  const [active,setActive]=useState<string>(codes[0]); const [history,setHistory]=useState<HistoryItem[]>([]); const [opened,setOpened]=useState<OpenDocument|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const [phaseComplete,setPhaseComplete]=useState(()=>storedPhaseComplete(project,phase));
  const developmentHeaders=devRole?{'x-portal-dev-role':devRole}:undefined;
  const load=useCallback(async()=>{const response=await fetch(`/api/markdown-documents?project=${encodeURIComponent(project.no)}`,{cache:'no-store',headers:developmentHeaders});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'문서 이력을 불러오지 못했습니다.');return payload.documents||[];},[project.no,devRole]);
  useEffect(()=>{let active=true;setPhaseComplete(storedPhaseComplete(project,phase));void load().then(documents=>{if(active)setHistory(documents);}).catch(error=>{if(active)setMessage(error.message);});return()=>{active=false;};},[load,phase,project]);
  const visible=useMemo(()=>history.filter(item=>item.documentType===active),[history,active]);
  const requiredDocument=phase==='fast_track_requirements'?'ARD_LITE':phase==='design'?'DES':'EVD';
  const finalVersion=history.find(item=>item.documentType===requiredDocument&&item.phase===phase);
  async function open(item:HistoryItem){setBusy(true);setMessage('');try{const response=await fetch(`/api/markdown-documents/${item.id}`,{cache:'no-store',headers:developmentHeaders});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'문서를 열지 못했습니다.');setOpened(payload.document);}catch(error){setMessage(error instanceof Error?error.message:'문서를 열지 못했습니다.');}finally{setBusy(false);}}
  async function upload(file:File){setBusy(true);setMessage('');try{const form=new FormData();form.set('project',project.no);form.set('document',active);form.set('phase',phase);form.set('file',file);const response=await fetch('/api/markdown-documents',{method:'POST',body:form,headers:developmentHeaders});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'문서를 저장하지 못했습니다.');setHistory(await load());await open(payload.document);if(active===requiredDocument)setPhaseComplete(false);setMessage(`${documentLabels[active as keyof typeof documentLabels]} v${payload.document.version}을 저장했습니다. 최종 버전이면 아래 완료 버튼을 눌러 주세요.`);window.dispatchEvent(new Event('portal-agent-saved'));}catch(error){setMessage(error instanceof Error?error.message:'문서를 저장하지 못했습니다.');}finally{setBusy(false);}}
  async function completePhase(){setBusy(true);setMessage('');try{const ok=await onComplete(phase,finalVersion!.version);if(ok===false)throw new Error('단계 완료 조건을 확인해 주세요.');setPhaseComplete(true);setMessage(phase==='fast_track_requirements'?'최소 요구정의 작성을 완료했습니다. 팀장이 GF를 승인해야 개발을 시작합니다.':`${phaseLabels[phase]} 작성이 완료되어 다음 ${phase==='design'?'단계':'Gate'}로 이동했습니다.`);window.dispatchEvent(new Event('portal-agent-saved'));}catch(error){setMessage(error instanceof Error?error.message:'단계를 완료하지 못했습니다.');}finally{setBusy(false);}}
  return <section className="markdown-workspace">
    <header><div><small>{project.no} · {phaseLabels[phase]} 문서</small><h3>{phase==='fast_track_requirements'?'최소 요구정의 문서 작성':phase==='design'?'설계 문서 작성':phase==='development_evaluation'?'개발·평가 문서 작성':'배포·확산 문서 작성'}</h3><p>.md 버전을 여러 번 첨부할 수 있습니다. 최종 버전을 올린 뒤 완료 버튼을 눌러야 다음 절차로 이동합니다.</p></div><div className="markdown-header-actions"><span className={phaseComplete?'complete':'pending'}>{phaseComplete?'작성 완료':finalVersion?'완료 확인 필요':'문서 필요'}</span><a href={phase==='fast_track_requirements'?`data:text/markdown;charset=utf-8,${encodeURIComponent(ARD_LITE_TEMPLATE)}`:`/api/markdown-documents/export?project=${encodeURIComponent(project.no)}&phase=${phase}`} download={phase==='fast_track_requirements'?'ARD-Lite-template.md':true}>{phase==='fast_track_requirements'?'ARD-Lite .md 양식 다운로드':'앞 단계 누적 .md 다운로드'}</a></div></header>
    <nav aria-label="Markdown 문서 유형">{codes.map(code=><button key={code} type="button" className={active===code?'active':''} onClick={()=>{setActive(code);setOpened(null);}}>{documentLabels[code]}{code==='UG'&&<small>선택</small>}</button>)}</nav>
    <div className="markdown-workspace-body"><aside><div className="markdown-upload"><b>{documentLabels[active as keyof typeof documentLabels]} 첨부</b><p>{active==='EVD'&&phase==='deployment_rollout'?'기존 EVD 이력에 후속 버전으로 추가됩니다.':'UTF-8 Markdown · 최대 5MB'}</p>{canEdit?<label className="markdown-file-button">{busy?'처리 중…':'.md 파일 선택'}<input type="file" accept=".md,text/markdown" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.currentTarget.value='';}}/></label>:<small>{phase==='fast_track_requirements'?'INT 검토·자격 판정 완료 후 과제 작성 담당자가 첨부할 수 있습니다.':'지정 개발 담당자 또는 Admin만 첨부할 수 있습니다.'}</small>}</div><h4>전체 버전 이력</h4>{visible.length?<ol className="markdown-history">{visible.map(item=><li key={item.id}><button type="button" onClick={()=>void open(item)} className={opened?.id===item.id?'selected':''}><span><b>v{item.version} · {phaseLabels[item.phase]}</b><small>{item.name}</small></span><span><small>{item.authorName}</small><time>{new Date(item.createdAt).toLocaleString('ko-KR')}</time></span></button></li>)}</ol>:<p className="markdown-empty">등록된 버전이 없습니다.</p>}</aside><main>{opened?<><div className="markdown-view-meta"><div><b>{opened.name}</b><small>v{opened.version} · {phaseLabels[opened.phase]} · {opened.authorName}</small></div><small>SHA-256 {opened.checksum.slice(0,12)}…</small></div><MarkdownView value={opened.markdown}/></>:<div className="markdown-empty-view"><b>문서 이력을 선택하세요.</b><p>제목, 표, 목록과 본문을 안전한 Markdown 뷰어로 확인할 수 있습니다.</p></div>}</main></div>
    <footer><div><span>{active==='UG'?'UG는 선택 문서입니다.':'파일 첨부만으로 단계가 완료되지 않습니다.'}</span><p role="status">{message}</p></div>{canEdit&&active!=='UG'&&<button type="button" className="markdown-complete-button" disabled={busy||!finalVersion||phaseComplete} onClick={()=>void completePhase()}>{phaseComplete?'작성 완료':phase==='fast_track_requirements'?`ARD-Lite v${finalVersion?.version||'-'} 최종 확정 · 작성 완료`:phase==='design'?`DES v${finalVersion?.version||'-'} 최종 확정 · 개발·평가로`:phase==='development_evaluation'?`EVD v${finalVersion?.version||'-'} 최종 확정 · G3 요청`:`EVD v${finalVersion?.version||'-'} 최종 확정 · G4 요청`}</button>}</footer>
  </section>;
}
