'use client';
import {useState,useEffect} from 'react';
export default function MailSettings(){
  const [state,setState]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){
    const response=await fetch('/api/work-mail',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok){setMessage(data.error||'조회 실패');return;}
    setState(data);
  }
  useEffect(()=>{refresh().catch(()=>setMessage('연결을 확인해 주세요.'));},[]);
  async function test(){
    if(!window.confirm('현재 로그인한 Admin 본인에게 테스트 메일 1건을 보냅니다. 진행할까요?'))return;
    setBusy(true);setMessage('발송 결과 확인 중…');
    try{
      const response=await fetch('/api/work-mail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'send-self-test'})});
      const result=await response.json();
      const stageNames={flow_url:'Flow URL 검증',identity_settings:'관리 ID 설정',identity_token:'관리 ID 토큰 발급',flow_request:'Flow HTTP 호출',flow_receipt:'메일 발송 완료 응답',mail_server:'메일 서버 처리'};
      const detail=`${stageNames[result.stage]||'포털 요청'} · ${result.code||result.error||result.status}${result.httpStatus?` · HTTP ${result.httpStatus}`:''}${result.notificationId?` · 진단 ID: ${result.notificationId}`:''}`;
      setMessage(response.ok?'Outlook 발송 성공 응답을 확인했습니다. 받은 편지함을 확인해 주세요.':`${result.status==='not_sent'?'메일 호출 전 중단':'완료 확인 불가'}: ${detail}. ${result.status==='not_sent'?'진단 결과를 전달해 주세요.':'중복 발송을 피하려면 Flow 실행 기록을 먼저 확인해 주세요.'}`);
    }catch{setMessage('결과를 확인하지 못했습니다. 다시 보내기 전에 Flow 실행 기록을 확인해 주세요.');}
    finally{setBusy(false);}
  }
  return <main style={{maxWidth:760,margin:'48px auto',padding:24,color:'#17385e',background:'#fff',border:'1px solid #d8e2ee',borderRadius:12}}>
    <h1 style={{fontSize:24,marginBottom:20}}>업무 메일 연결 · Admin</h1>
    <p>기존 과제나 승인 상태를 변경하지 않습니다. 테스트 메일은 현재 로그인한 본인에게만 전송됩니다.</p>
    {state&&<><p style={{margin:'24px 0'}}>발송 모드: {state.mode} · Flow 설정: {state.configured?'완료':'필요'} · 관리 ID: {state.managedIdentity?'연결됨':'없음'}</p>
    <button disabled={busy||!state.configured||!state.managedIdentity} onClick={test} style={{background:'#173d6b',color:'white',padding:'12px 20px',borderRadius:8,opacity:busy?0.5:1}}>본인에게 테스트 메일 1건 발송</button>
    <h2 style={{fontSize:18,marginTop:24}}>발송 큐 상태</h2><pre>{JSON.stringify(state.counts,null,2)}</pre></>}
    <p role="status" style={{marginTop:20}}>{message}</p><a href="/">포털로 돌아가기</a>
  </main>;
}
