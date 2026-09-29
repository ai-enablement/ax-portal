'use client';
import {useEffect,useState} from 'react';
import {formatKst} from '../shared/portal-time.mjs';
import './d2b-access-management.css';

const endpoint='/api/database/governance/d2b-access';
export default function D2BAccessManagement(){
 const [accounts,setAccounts]=useState([]),[canManage,setCanManage]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [draft,setDraft]=useState(null),[removing,setRemoving]=useState(null),[search,setSearch]=useState('');
 async function load(){
  try{const response=await fetch(endpoint,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'목록을 불러오지 못했습니다.');setError('');setAccounts(data.accounts);setCanManage(data.canManage);}
  catch(e){setError(e.message);setCanManage(false);setAccounts([]);}finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/set-state-in-effect -- All state updates occur after the asynchronous fetch.
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  const target=removing||draft,method=removing?'DELETE':draft.id?'PATCH':'POST';
  try{
   const response=await fetch(endpoint+(target.id?`/${target.id}`:''),{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(target)});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'변경 내용을 저장하지 못했습니다.');
   setDraft(null);setRemoving(null);setMessage(method==='DELETE'?'D2B 전용 접근 지정을 삭제했습니다. 포털 계정은 유지됩니다.':'D2B 접근 정보를 저장했습니다. 대상 계정은 새로고침 또는 재로그인해 주세요.');await load();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const visible=accounts.filter(a=>`${a.displayName} ${a.email}`.toLowerCase().includes(search.toLowerCase()));
 return <div className="d2b-management">
  <header className="d2b-management-heading"><div><h3>D2B 전용 접근 계정</h3><p>등록된 MS 계정은 리더용 대시보드에서 D2B 과제만 조회합니다.</p></div>{canManage&&<button className="primary" onClick={()=>{setError('');setDraft({displayName:'',email:''});}}>계정 추가</button>}</header>
  <div className="d2b-management-note">기존 포털 역할과 과제 배정은 변경하지 않습니다. 접근 지정을 삭제하면 기존 역할의 권한으로 돌아갑니다. 팀장·Admin은 관리, AI 활성화팀 팀원은 조회할 수 있습니다.</div>
  <div className="d2b-management-tools"><label>계정 검색<input placeholder="이름 또는 MS 계정 이메일" value={search} onChange={e=>setSearch(e.target.value)}/></label><span>등록 계정 {accounts.length}명</span><button onClick={load} disabled={loading||busy}>새로고침</button></div>
  {message&&<p role="status" className="d2b-success">{message}</p>}{error&&<p role="alert" className="governance-account-error">{error}</p>}
  {loading?<p role="status">계정을 불러오는 중입니다.</p>:<div className="d2b-table-wrap"><table><thead><tr><th>이름</th><th>MS 계정 이메일</th><th>접근 범위</th><th>최종 변경</th>{canManage&&<th>관리</th>}</tr></thead><tbody>{visible.map(account=><tr key={account.id}><td><strong>{account.displayName}</strong></td><td>{account.email}</td><td><span className="d2b-scope-badge">D2B 전용</span></td><td>{formatKst(account.updatedAt)}</td>{canManage&&<td><div className="d2b-row-actions"><button onClick={()=>{setError('');setDraft({...account});}}>수정</button><button className="d2b-delete" onClick={()=>{setError('');setRemoving(account);}}>삭제</button></div></td>}</tr>)}</tbody></table>{!visible.length&&<p className="d2b-empty">{search?'검색 결과가 없습니다.':'등록된 D2B 전용 접근 계정이 없습니다.'}</p>}</div>}
  {(draft||removing)&&<div className="d2b-dialog-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="d2b-dialog-title" className="d2b-dialog"><form onSubmit={save}><header><small>D2B ACCESS</small><h3 id="d2b-dialog-title">{removing?'D2B 접근 지정 삭제':draft.id?'D2B 계정 수정':'D2B 계정 추가'}</h3></header>{removing?<p><strong>{removing.displayName}</strong> ({removing.email})의 D2B 전용 접근 지정을 삭제할까요?<br/>포털 계정과 기존 역할·과제 정보는 삭제되지 않습니다.</p>:<><label>이름<input autoFocus required maxLength={100} value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label><label>MS 계정 이메일<input required type="email" maxLength={254} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label><p>본인이 로그인할 MS 계정 이메일을 입력해 주세요. 별도 개발자 배정이나 편집 권한은 부여되지 않습니다.</p></>}{error&&<p role="alert" className="governance-account-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>{setDraft(null);setRemoving(null);setError('');}}>취소</button><button className={removing?'d2b-delete':'primary'} disabled={busy} type="submit">{busy?'저장 중…':removing?'접근 지정 삭제':'저장'}</button></footer></form></section></div>}
 </div>;
}
