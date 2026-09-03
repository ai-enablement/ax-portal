"use client";
import { useState } from 'react';
import type { StandardDocument } from '../shared/standard-documents.mjs';
import { standardDocuments } from '../shared/standard-documents.mjs';
import { asBlocks, contentText } from '../shared/document-content.mjs';
import { DocumentContent } from './document-content-editor';

export default function DocumentOutput({code,document}: {code:string;document:StandardDocument}) {
  const [detail,setDetail]=useState<number|null>(null);
  const fields=document.fields;
  const text=(key:string)=>contentText(fields[key]) || '미입력';
  const rich=(key:string)=><DocumentContent value={fields[key]}/>;
  const examples=(key:string)=><div className="guide-example-lines">{asBlocks(fields[key]).map(block=>block.type==='text'?block.text.split('\n').filter(Boolean).map((line,i)=><p key={`${block.id}-${i}`}>{line}</p>):<DocumentContent key={block.id} value={{kind:'blocks',blocks:[block]}}/>)}</div>;
  const attachments=(section:string)=>fields[`${section}.__attachments`]&&<div className="output-attachments">{rich(`${section}.__attachments`)}</div>;
  const card=(title:string,body:React.ReactNode,section:string)=>{const heading=title.match(/^([ABC]|\d{2})  (.*)$/);return <section className="document-output-card" key={section}><h3>{heading?<><span className="output-section-badge">{heading[1]}</span>{heading[2]}</>:title}</h3>{body}{attachments(section)}</section>;};
  const metrics=(items:string[][])=><dl className="document-output-metrics">{items.map(([label,key])=><div key={key}><dt>{label}</dt><dd>{rich(key)}</dd></div>)}</dl>;
  if(code==='UG')return <div className="document-output ug-output">
    {card('01  이 Agent는 무엇을 해주나요?',rich('overview.intro'),'overview')}
    {card('02  이런 건 못 해요 / 하지 않아요',rich('scope.outOfScope'),'scope')}
    {card('03  이렇게 사용하세요',<><ol className="guide-steps">{asBlocks(fields['usage.usageSteps']).flatMap(b=>b.type==='text'?b.text.split('\n').filter(Boolean):[]).map((step,i)=><li key={i}><span>{i+1}</span>{step}</li>)}</ol>{asBlocks(fields['usage.usageSteps']).some(b=>b.type!=='text')&&<DocumentContent value={{kind:'blocks',blocks:asBlocks(fields['usage.usageSteps']).filter(b=>b.type!=='text')}}/>}</>,'usage')}
    {card('04  좋은 질문과 잘 안 되는 질문',<div className="guide-examples"><section><b>좋은 질문</b>{examples('examples.goodExamples')}</section><section><b>잘 안 되는 질문</b>{examples('examples.badExamples')}</section></div>,'examples')}
    {card('05  주의사항',<div className="guide-caution">{rich('caution.caution')}<p>지식 기준일: {text('caution.knowledgeDate')}</p>{rich('caution.prohibitedInfo')}</div>,'caution')}
    {card('06  문의·오류 신고',metrics([['채널','support.channel'],['담당','support.owner'],['첨부 요령','support.reportingGuide']]),'support')}
  </div>;
  if(code==='OPS')return <div className="document-output">
    {card('A  에이전트 운영 정보',<dl className="document-output-metrics">{[['유형 · 트랙 · 자율성',['owners.type','owners.track','owners.autonomy']],['오너(현업)',['owners.owner']],['개발/운영 담당',['owners.operator']],['지식갱신 담당',['owners.knowledgeOwner']],['배포일',['owners.deployed']],['최근 점검 / 다음 재평가',['monitoring.checked','evaluation.reevaluate']]].map(([label,keys])=><div key={String(label)}><dt>{label}</dt><dd>{(keys as string[]).map(text).join(' / ')}</dd></div>)}</dl>,'owners')}
    {card(`B  월간 운영 점검 · ${text('monitoring.checked')}`,<div className="ops-monthly">{metrics([['사용량','monitoring.usage'],['품질','monitoring.quality'],['지식 최신성','monitoring.freshness'],['정기 재평가','evaluation.evaluation']])}</div>,'monitoring')}
    {card('운영 판단 및 후속 조치',<>{rich('evaluation.decision')}{rich('evaluation.actions')}{rich('monitoring.incidents')}</>,'evaluation')}
    <p>운영 상태: {text('owners.status')}</p>
    {fields['owners.status']==='폐기' && card('폐기(Sunset) 기준',<><h4>폐기 검토 기준</h4>{rich('sunset.criteria')}<h4>공지·접근 차단·데이터 처리 절차</h4>{rich('sunset.procedure')}</>,'sunset')}
    <small>운영 담당자가 월 1회 및 이벤트 발생 시 갱신합니다.</small>
  </div>;
  if(code==='CHG'){
    const rows=(Array.isArray(fields['history.rows'])?fields['history.rows']:[]) as Record<string,string>[];
    const columns=['변경번호','일자','유형','변경 내용','사유','재평가 결과','승인'];
    return <div className="document-output">{card('과제별 변경 이력',<><p>상세를 누르면 변경 전·후와 재평가·승인 근거를 확인할 수 있습니다.</p><div className="document-table-scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}<th>상세</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{columns.map(c=><td key={c}>{row[c]||'미입력'}</td>)}<td><button type="button" onClick={()=>setDetail(detail===i?null:i)}>상세</button></td></tr>)}</tbody></table></div>{!rows.length&&<p>등록된 변경 이력이 없습니다.</p>}{detail!==null&&rows[detail]&&<aside className="change-detail"><h3>{rows[detail]['변경번호']} 변경 상세</h3>{['변경 전','변경 후','재평가 결과','승인 근거'].map(c=><div key={c}><b>{c}</b><p>{rows[detail][c]||'미입력'}</p></div>)}</aside>}</>,'history')}<div className="guide-caution"><b>자율성 상향은 별도 재심사</b><p>ARD 개정 → 3자 재확인 → 전체 재평가 → G3 재승인</p></div></div>;
  }
  if(code==='DEP')return <div className="document-output">
    {card('A  배포 전 필수 확인',<div className="output-checks">{standardDocuments.DEP.sections[0].fields[0].options.map((label,i)=><label key={label}><input type="checkbox" disabled checked={Boolean((fields['readiness.checks'] as boolean[]||[])[i])}/>{label}</label>)}</div>,'readiness')}
    {card('B  배포 방식',<>{metrics([['파일럿 대상자 (명)','pilot.pilotAudience'],['기간 (주)','pilot.pilotPeriod'],['피드백 수집 방법','pilot.feedbackMethod']])}<h4>파일럿 종료 판정 기준</h4>{rich('pilot.exitCriteria')}<h4>확산</h4>{metrics([['공지 채널','pilot.rolloutChannel'],['교육 계획','pilot.trainingPlan'],['일정','pilot.rolloutSchedule']])}</>,'pilot')}
    {card('C  파일럿 결과 (G4 게이트)',<>{metrics([['사용 건수','results.pilotUsage'],['오류 신고','results.pilotErrors'],['만족도','results.pilotSatisfaction']])}<h4>주요 피드백</h4>{rich('results.pilotFeedback')}<div className="output-checks">{['확산 승인','파일럿 연장','회수 후 개선'].map(label=><label key={label}><input type="radio" disabled checked={text('results.pilotDecision')===label}/>{label}</label>)}</div>{metrics([['승인자','results.approver'],['일자','results.approvalDate']])}<small>문서에 기록된 결과입니다. 실제 G4 승인 권한과 처리 절차는 별도로 적용됩니다.</small></>,'results')}
  </div>;
  return <div>{Object.keys(fields).map(key=><div key={key}>{rich(key)}</div>)}</div>;
}
