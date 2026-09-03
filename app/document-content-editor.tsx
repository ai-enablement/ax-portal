"use client";
/* Authenticated private images must bypass the public Next image optimizer/cache. */
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash, Paperclip, Table as TableIcon } from '@phosphor-icons/react';
import { asBlocks, MAX_FILE_BYTES } from '../shared/document-content.mjs';
import type { ContentBlock, FieldValue } from '../shared/standard-documents.mjs';
import './document-content.css';

export function DocumentContent({ value }: { value: FieldValue | undefined }) {
  return <div className="document-content-view">{asBlocks(value).map(block => <div key={block.id}>{block.type==='text' ? <p>{block.text || '미입력'}</p> : block.type==='table' ? <div className="document-table-scroll"><table><tbody>{block.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=>i===0?<th key={j}>{cell}</th>:<td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : <figure>{block.type==='image' && <img src={`/api/document-files/${block.file.id}?inline=1`} alt={block.caption || block.file.name}/>}<figcaption><a href={`/api/document-files/${block.file.id}`}>{block.file.name}</a>{block.caption && <p>{block.caption}</p>}</figcaption></figure>}</div>)}</div>;
}

export default function DocumentContentEditor({value,label,project,code,field,disabled,filesOnly=false,onChange,onBusy}: { value:FieldValue|undefined;label:string;project:string;code:string;field:string;disabled:boolean;filesOnly?:boolean;onChange:(value:FieldValue)=>void;onBusy:(busy:boolean)=>void }) {
  const existing=asBlocks(value); const blocks:ContentBlock[]=existing.length||filesOnly?existing:[{id:'initial',type:'text',text:''}]; const picker=useRef<HTMLInputElement>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const commit=(next:ContentBlock[])=>onChange({kind:'blocks',blocks:next});
  const replace=(index:number,block:ContentBlock)=>commit(blocks.map((b,i)=>i===index?block:b));
  const add=(type:'text'|'table')=>commit([...blocks,type==='text'?{id:crypto.randomUUID(),type,text:''}:{id:crypto.randomUUID(),type,rows:[['항목','내용'],['','']]}]);
  const move=(index:number,direction:number)=>{const next=[...blocks];[next[index],next[index+direction]]=[next[index+direction],next[index]];commit(next);};
  const upload=async(file:File)=>{
    if(file.size>MAX_FILE_BYTES){setError('파일은 5MB 이하로 첨부해 주세요.');return;}
    setBusy(true);onBusy(true);setError('');
    try {const form=new FormData();form.set('project',project);form.set('document',code);form.set('field',field);form.set('file',file);
      const response=await fetch('/api/document-files',{method:'POST',body:form});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'파일 업로드에 실패했습니다.');
      commit([...blocks,{id:crypto.randomUUID(),type:payload.file.type.startsWith('image/')?'image':'file',file:payload.file,caption:''}]);
    }catch(e){setError(e instanceof Error?e.message:'파일을 업로드하지 못했습니다.');}finally{setBusy(false);onBusy(false);}
  };
  return <section className="document-block-editor" aria-label={label}><header><b>{label}</b>{!disabled&&<div>{!filesOnly&&<><button type="button" onClick={()=>add('text')} disabled={busy}><Plus size={15}/>글 추가</button><button type="button" onClick={()=>add('table')} disabled={busy}><TableIcon size={15}/>표 삽입</button></>}<button type="button" onClick={()=>picker.current?.click()} disabled={busy}><Paperclip size={15}/>{busy?'업로드 중…':filesOnly?'파일 첨부':'이미지·파일 삽입'}</button><input ref={picker} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/></div>}</header>
    {error&&<p role="alert" className="document-upload-error">{error}</p>}
    {!blocks.length && (disabled?<p>미입력</p>:filesOnly?<p className="document-editor-hint">첨부 선택 · 최대 5MB/파일. 업로드 후 문서를 저장해 주세요.</p>:<textarea aria-label={label} placeholder="내용을 입력하거나 이미지·표를 추가하세요." onChange={e=>commit([{id:crypto.randomUUID(),type:'text',text:e.target.value}])}/>)}
    {blocks.map((block,i)=><div className="document-edit-block" key={block.id}>{!disabled&&<div className="document-block-actions"><span>{i+1} · {block.type==='text'?'글':block.type==='table'?'표':'첨부'}</span><button type="button" aria-label={`${label} ${i+1} 위로`} disabled={busy||i===0} onClick={()=>move(i,-1)}><ArrowUp/></button><button type="button" aria-label={`${label} ${i+1} 아래로`} disabled={busy||i===blocks.length-1} onClick={()=>move(i,1)}><ArrowDown/></button><button type="button" aria-label={`${label} ${i+1} 제거`} disabled={busy} onClick={()=>commit(blocks.filter((_,j)=>i!==j))}><Trash/></button></div>}
      {disabled?<DocumentContent value={{kind:'blocks',blocks:[block]}}/>:block.type==='text'?<textarea aria-label={`${label} ${i+1} 내용`} disabled={busy} value={block.text} onChange={e=>replace(i,{...block,text:e.target.value})}/>:block.type==='table'?<><div className="document-table-scroll"><table><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c}><textarea aria-label={`${label} 표 ${r+1}행 ${c+1}열`} value={cell} disabled={busy} onChange={e=>replace(i,{...block,rows:block.rows.map((rr,ri)=>ri===r?rr.map((cc,ci)=>ci===c?e.target.value:cc):rr)})}/></td>)}<td><button type="button" aria-label={`${r+1}행 삭제`} disabled={busy||block.rows.length<=1} onClick={()=>replace(i,{...block,rows:block.rows.filter((_,ri)=>ri!==r)})}><Trash/></button></td></tr>)}</tbody></table></div><div className="document-table-actions"><button type="button" disabled={busy||block.rows.length>=100} onClick={()=>replace(i,{...block,rows:[...block.rows,block.rows[0].map(()=>'')]})}>행 추가</button><button type="button" disabled={busy||block.rows[0].length>=20} onClick={()=>replace(i,{...block,rows:block.rows.map(row=>[...row,''])})}>열 추가</button><button type="button" disabled={busy||block.rows[0].length<=1} onClick={()=>replace(i,{...block,rows:block.rows.map(row=>row.slice(0,-1))})}>마지막 열 삭제</button></div></>:<><DocumentContent value={{kind:'blocks',blocks:[block]}}/><input aria-label={`${block.file.name} 설명`} placeholder="이미지 설명 또는 파일 설명" disabled={busy} value={block.caption} onChange={e=>replace(i,{...block,caption:e.target.value})}/></>}
    </div>)}
  </section>;
}
