'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, BookOpen, CheckCircle, Code, FileMagnifyingGlass, FilePlus, Pause, Play, User, Users, X } from '@phosphor-icons/react';
import { kstDate } from '../shared/portal-time.mjs';
import { launchStorageKey, shouldShowLaunch } from '../shared/launch-onboarding.mjs';
import './launch-onboarding.css';

const GUIDE = '/guides/agent-portal-user-guide.html';
const steps = ['환영합니다', 'Agent 과제 요청', '검토·업무 테스트', '진행·대시보드', 'Agent Gallery', '가이드·시작하기'];
const titles = ['Agent Portal을 방문하신 걸 환영합니다!', '업무 협조 요청, 포털에서 시작하세요.', '검토와 업무 테스트, 내 역할에 맞게 진행하세요.', '내 과제의 진행과 일정을 한눈에 확인하세요.', '이미 만들어진 Agent를 찾아보고 활용하세요.', '처음부터 차근차근, 사용자 가이드와 함께하세요.'];
const descriptions = ['Agent 업무 협조 요청부터 검토·승인과 진행 확인까지, 이제 포털에서 함께합니다.', '과제명과 Project Owner를 지정한 뒤 요구접수서를 작성합니다.', '요구자와 Project Owner는 작성된 문서를 확인하고 실제 업무 결과를 검증합니다.', '요구자 또는 Project Owner로 참여한 과제를 대시보드에서 확인합니다.', 'Agent Gallery에서 업무에 필요한 Agent를 검색하고 상세 정보를 확인합니다.', '실제 화면과 단계별 설명으로 요청부터 검토·승인까지 쉽게 따라할 수 있습니다.'];

function IconCircle({ icon: Icon }) { return <span className="launch-icon-circle"><Icon size={44} weight="regular"/></span>; }
function Screen({ name, alt }) { return <figure className="launch-screen"><Image src={`/guides/screens/${name}.jpg`} alt={alt} width={1440} height={1000} unoptimized loading="eager"/><figcaption>사용자 가이드 예시 화면 · 실제 표시 항목은 계정에 따라 다릅니다.</figcaption></figure>; }
function ThreeSteps({ items }) { return <ol className="launch-three-steps">{items.map(([title, text], index) => <li key={title}><span>{index + 1}</span><div><b>{title}</b><p>{text}</p></div></li>)}</ol>; }

function PageContent({ page, close }) {
  if (page === 0) return <>
    <div className="launch-flow">{[[FilePlus, '업무 요청'], [CheckCircle, '검토·승인'], [Code, '개발·배포']].map(([Icon, label], index) => <div key={label}><IconCircle icon={Icon}/><b>{label}</b>{index < 2 && <ArrowRight className="launch-flow-arrow" size={28}/>}</div>)}</div>
    <div className="launch-roles"><div><IconCircle icon={User}/><p><b>요구자</b><span>업무 문제 제안·요청 작성·업무 테스트</span></p></div><div><IconCircle icon={Users}/><p><b>Project Owner</b><span>업무 범위와 도입·확산 결과 확인</span></p></div></div>
  </>;
  if (page === 1) return <><Screen name="user-request-filled" alt="신규 Agent 과제 요청에서 과제명과 Project Owner를 지정하는 화면"/><ThreeSteps items={[["과제명·Owner 등록", "업무 제목과 담당 Owner를 입력하세요."], ["요구접수서 작성", "업무 문제·처리 방식·자료를 설명하세요."], ["AI 인터뷰·작성 완료", "질문에 답한 뒤 작성 및 검토 완료를 누르세요."]]}/></>;
  if (page === 2) return <><div className="launch-review"><article><IconCircle icon={FileMagnifyingGlass}/><div><h3>요구사항 정의서 검토</h3><small>요구자 · Project Owner</small><b>작성된 문서 확인 → 승인 또는 보완 요청</b><p>각 담당자가 본인 계정으로 검토합니다.</p></div></article><article><IconCircle icon={CheckCircle}/><div><h3>사용자 인수 테스트</h3><small>요구자</small><b>실제 업무 사례 실행 → 확인 건수·결과 기록</b><p>요청한 업무가 정상적으로 처리되는지 확인하세요.</p></div></article></div><p className="launch-caption">Project Owner는 파일럿 결과와 도입·확산 조건도 확인합니다.</p></>;
  if (page === 3) return <><Screen name="user-dashboard" alt="기간별 진척률과 일정 경과율, 간트 차트를 확인하는 대시보드"/><ThreeSteps items={[["기간 선택", "연간 주기, 전체 또는 원하는 기간으로 보기"], ["진척률", "담당자가 입력한 진척률을 개발 기간으로 가중 평균"], ["일정 경과율", "선택한 기간 중 오늘까지 지난 날짜의 비율"]]}/></>;
  if (page === 4) return <><Screen name="user-gallery" alt="Agent Gallery의 검색, 카테고리와 Agent 카드 목록"/><ThreeSteps items={[["검색·카테고리로 찾기", "Agent 이름, 업무 또는 부서로 검색하세요."], ["카드에서 상세 정보 확인", "설명·주요 기능·사용 방법을 확인하세요."], ["Agent 보기로 서비스 열기", "필요한 Agent를 실제 업무에 활용하세요."]]}/><p className="launch-caption">내 Agent 올리기 · 직접 만든 Agent는 검토를 거쳐 Gallery에 게시됩니다.</p></>;
  return <><div className="launch-guide-preview"><header><h3>Agent Portal 사용자 가이드</h3><div className="launch-guide-roles"><span>요구자</span><span>Project Owner</span></div></header><Image src="/guides/screens/user-guide.jpg" alt="첨부 HTML 사용자 가이드의 단계 목록과 실제 포털 화면 안내" width={1280} height={720} unoptimized loading="eager"/></div><ThreeSteps items={[["역할별 안내", "요구자와 Project Owner에 맞는 설명"], ["실제 화면 기반", "포털 화면을 보면서 확인"], ["단계별 따라하기", "요청부터 검토·승인까지"]]}/><div className="launch-final-actions"><a href={GUIDE} target="_blank" rel="noopener noreferrer">사용자 가이드 보기 <ArrowUpRight size={18}/></a><button onClick={close}>포털 시작하기 <ArrowRight size={18}/></button></div><p className="launch-caption launch-centered">사용자 가이드는 새 창에서 열립니다.</p></>;
}

export default function LaunchOnboarding({ enabled, account }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const manuallyOpened = useRef(false);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hideToday, setHideToday] = useState(false);
  const key = launchStorageKey(account);
  useEffect(() => {
    if (!enabled) return;
    let hidden = '';
    try { hidden = localStorage.getItem(key) || ''; } catch { /* Browsers may block storage. */ }
    const frame = requestAnimationFrame(() => {
      manuallyOpened.current = false;
      setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      setOpen(shouldShowLaunch(new Date(), hidden));
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, key]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; };
  }, [open]);
  useEffect(() => {
    if (!open || paused || page === 5) return;
    const timeout = setTimeout(() => setPage(current => Math.min(5, current + 1)), 6500);
    return () => clearTimeout(timeout);
  }, [open, paused, page]);
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => { if (!manuallyOpened.current && kstDate() > '2026-10-31') setOpen(false); }, 60000);
    return () => clearInterval(interval);
  }, [open]);
  function close() {
    if (hideToday) { try { localStorage.setItem(key, kstDate()); } catch { /* Closing must work without storage. */ } }
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(index) { setPage(index); setPaused(true); }
  return <>
    <button ref={trigger} type="button" className="launch-help-button" disabled={!enabled} onClick={() => { manuallyOpened.current = true; setPage(0); setHideToday(false); setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches); setOpen(true); }} title="처음 이용 안내와 사용자 가이드"><BookOpen size={18}/><span>사용 안내</span></button>
    <dialog ref={dialog} className="launch-dialog" aria-labelledby="launch-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className="launch-shell">
        <aside className="launch-rail"><header><b>Agent Portal</b><p>처음 이용 안내</p></header><nav aria-label="사용 안내 페이지">{steps.map((label, index) => <button key={label} type="button" aria-current={page === index ? 'step' : undefined} onClick={() => choose(index)}><span/>{label}</button>)}</nav><a href={GUIDE} target="_blank" rel="noopener noreferrer">사용자 가이드 보기 <ArrowUpRight size={15}/></a></aside>
        <section className="launch-main"><button className="launch-x" type="button" aria-label="사용 안내 닫기" onClick={close}><X size={24}/></button><div key={page} className="launch-page"><h2 id="launch-title">{titles[page]}</h2><p className="launch-description">{descriptions[page]}</p><PageContent page={page} close={close}/></div><footer className="launch-controls"><span>{page + 1} / 6</span>{page < 5 && <button type="button" aria-label={paused ? '자동 넘김 재생' : '자동 넘김 일시정지'} onClick={() => setPaused(!paused)}>{paused ? <Play size={18}/> : <Pause size={18}/>} {paused ? '자동 재생' : '일시정지'}</button>}<div/><button type="button" disabled={page === 0} onClick={() => choose(page - 1)}>이전</button>{page < 5 && <button type="button" className="launch-next" onClick={() => choose(page + 1)}>다음</button>}<button type="button" className="launch-skip" onClick={close}>건너뛰기</button></footer></section>
      </div>
      <footer className="launch-bottom"><label><input type="checkbox" checked={hideToday} onChange={event => setHideToday(event.target.checked)}/>오늘 하루 열지 않기</label><button type="button" onClick={close}>닫기</button></footer>
    </dialog>
  </>;
}
