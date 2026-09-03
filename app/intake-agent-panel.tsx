"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import './intake-agent-panel.css';

type Proposal={key:string;value:string;evidence:string;kind:string; baseValue:string};
type Snapshot={configured:boolean;fields:{key:string;label:string}[];messages:{role:string;text:string}[];session:{revision?:number;proposals?:Proposal[];request?:{id:string;message:string;status:string}};progress:{total:number;ready:boolean;missing:{key:string;label:string;held:boolean}[]};computed:{classification:{label:string;signals:string[]}|null;roi:{monthlyHours:number}|null};conflicts?:string[]};
const choiceLabels:Record<string,string>={true:'해당',false:'비해당',PERSONAL:'개인',TEAM:'팀',DEPT:'부서',MULTI_DEPT:'여러 부서',COMPANY:'전사'};
export default function IntakeAgentPanel({projectNo}:{projectNo:string}) {
  const [data,setData]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [retry,setRetry]=useState<{id:string;message:string}|null>(null);
  const mounted=useRef(true);
  const history=useRef<HTMLDivElement>(null);
  const inFlight=useRef(false);
  const url=`/api/intake-agent/${encodeURIComponent(projectNo)}`;
  const refresh=useCallback(async()=>{
    try {const r=await fetch(url,{cache:'no-store'});const p=await r.json();if(!r.ok) throw new Error(p.error||'대화를 불러오지 못했습니다.');if(mounted.current) {setData(p);setError('');}}
    catch(e) {if(mounted.current) setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
  },[url]);
  useEffect(()=>{mounted.current=true;const timer=setTimeout(()=>void refresh(),0);return()=>{mounted.current=false;clearTimeout(timer);};},[refresh]);
  useEffect(()=>{history.current?.scrollTo({top:history.current.scrollHeight,behavior:'smooth'});},[data?.messages.length,busy]);
  const serverRunning=data?.session.request?.status==='running';
  useEffect(()=>{
    if(!serverRunning || busy) return;
    const timer=setInterval(()=>void refresh(),5000);
    return()=>clearInterval(timer);
  },[serverRunning,busy,refresh]);
  async function send(action:'message'|'confirm'|'resume',keys:string[]=[],retryTurn?:{id:string;message:string}) {
    if(inFlight.current) return;
    const turn=retryTurn || {id:crypto.randomUUID(),message:input.trim()};
    if(action==='message' && !turn.message) return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    if(action==='message') setRetry(turn);
    try {
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,keys,revision:data?.session.revision||0,...(action==='message'?{message:turn.message,requestId:turn.id}:{})})});
      const payload=await r.json();
      if(!r.ok) throw new Error(payload.error||'처리하지 못했습니다.');
      window.dispatchEvent(new Event('portal-agent-saved'));
      if(!mounted.current) return;
      setData(payload);setSelected([]);
      if(action==='message'){setInput('');setRetry(null);}
      setNotice(payload.conflicts?.length?`다른 사람이 수정한 항목은 덮어쓰지 않았습니다: ${payload.conflicts.join(', ')}`:action==='confirm'?'확인한 내용을 INT·FEA 초안에 저장했습니다. 승인이나 단계 완료는 변경하지 않았습니다.':action==='resume'?'보류를 해제했습니다. 아래에 답변을 이어서 입력해 주세요.':'대화와 AI 초안을 DB에 저장했습니다.');
    } catch(e) {if(mounted.current){await refresh();setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}}
    finally {inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  const proposals=data?.session.proposals||[];
  return <section className="portal-intake-agent" aria-label="신규 과제 INT FEA 자동 인터뷰">
    <header><div><small>INT + FEA · 신규 과제 전용</small><h3>요구 접수 · 타당성 평가 Agent</h3><p>답변을 바탕으로 두 문서를 정리합니다. 미확보 정보는 보류하고, 확인한 내용만 초안에 반영합니다.</p></div><button type="button" onClick={()=>void refresh()} disabled={busy}>대화 새로고침</button></header>
    {error && <p className="agent-error" role="alert">{error}</p>}
    {notice && <p className="agent-notice" role="status">{notice}</p>}
    {data && <>
      {!data.configured && <p className="agent-notice">AI 연결 미설정 · 서버 환경 변수 등록 후 이용할 수 있습니다. 기존 문서 직접 입력은 계속 사용할 수 있습니다.</p>}
      <div className="agent-interview-grid">
        <div className="agent-conversation">
          <div ref={history} className="agent-history" role="log" aria-live="polite" aria-label="저장된 인터뷰 대화">
            {!data.messages.length && <><p>이미 입력한 접수서를 바탕으로 부족한 정보를 질문하겠습니다. 아래 버튼으로 시작하거나 답변을 바로 입력해 주세요.</p><button type="button" disabled={busy||!data.configured} onClick={()=>void send('message',[],{id:crypto.randomUUID(),message:'등록한 접수서를 검토하고 INT와 FEA에서 부족한 정보를 하나씩 질문해 주세요.'})}>접수서 검토 · 인터뷰 시작</button></>}
            {data.messages.map((m,i)=><div key={i} className={`agent-bubble ${m.role==='user'?'user':'agent'}`}><small>{m.role==='user'?'참여자':'요구 접수 Agent'}</small><p>{m.text}</p></div>)}
            {busy && <p role="status">처리 중입니다. 답변을 정리하고 저장하고 있습니다…</p>}
          </div>
          <form onSubmit={e=>{e.preventDefault();void send('message');}}>
            <label htmlFor={`agent-answer-${projectNo}`}>인터뷰 답변</label>
            <textarea id={`agent-answer-${projectNo}`} value={input} onChange={e=>setInput(e.target.value)} maxLength={6000} disabled={busy} placeholder="답변 또는 보완할 내용을 입력하세요. 모르는 항목은 확인 필요라고 알려주세요."/>
            <div className="agent-actions"><small>개인정보·비밀키를 입력하지 마세요.</small><button type="submit" disabled={busy||serverRunning||!data.configured||!input.trim()}>답변 보내기</button></div>
            {(retry || data.session.request?.status==='failed' || (serverRunning&&!busy)) && <button type="button" disabled={busy||!data.configured} onClick={()=>void send('message',[],retry||{id:data.session.request!.id,message:data.session.request!.message})}>저장된 마지막 답변 다시 처리</button>}
          </form>
        </div>
        <div className="agent-review">
          <h4>문서 반영 전 확인 <span>{proposals.length}개</span></h4>
          <p>‘답변에서 추출’도 정확한지 확인해 주세요. ‘AI 제안’은 검토 전까지 사실로 확정되지 않습니다. 직접 작성 중인 문서는 먼저 저장한 뒤 반영해 주세요.</p>
          <div className="agent-proposals">{proposals.map(p=><label className="agent-proposal" key={p.key}><input type="checkbox" checked={selected.includes(p.key)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.key]:old.filter(k=>k!==p.key))} disabled={busy}/><div><b>{data.fields.find(f=>f.key===p.key)?.label||p.key}</b><small>{p.kind==='extracted'?'답변에서 추출 · 확인 대기':'AI 제안 · 확인 대기'}</small><p>{choiceLabels[p.value]||p.value}</p>{p.evidence&&<blockquote>근거: {p.evidence}</blockquote>}</div></label>)}</div>
          {!proposals.length&&<p>대화를 시작하면 확인할 초안이 여기에 표시됩니다.</p>}
          <button type="button" disabled={busy||!selected.length} onClick={()=>void send('confirm',selected)}>선택한 {selected.length}개 확인 · 문서 반영</button>
          <details><summary>미확보·보완 필요 {data.progress.missing.length} / {data.progress.total}개</summary><ul>{data.progress.missing.map(f=><li key={f.key}>{f.label}{f.held&&<><span>보류</span><button type="button" disabled={busy} onClick={()=>void send('resume',[f.key])}>다시 보완</button></>}</li>)}</ul></details>
          {data.progress.ready&&<p className="agent-notice">필수 정보가 확보되었습니다. 담당자가 FEA를 검토한 뒤 작성 완료를 진행해 주세요.</p>}
          <p>트랙: {data.computed.classification?`${data.computed.classification.label} · 표준체계 0.3절`:'위험 응답 확인 필요'}<br/>월 절감 시간: {data.computed.roi?`${data.computed.roi.monthlyHours.toFixed(1)}시간`:'정량 정보 미확보'}</p>
          <small>G1 판정 확정은 팀장님만 가능합니다. 이 Agent는 승인하지 않습니다.</small>
        </div>
      </div>
    </>}
  </section>;
}
