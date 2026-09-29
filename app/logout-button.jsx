'use client';

import {useEffect, useState} from 'react';
import {SignOut} from '@phosphor-icons/react';

export default function LogoutButton({development = false}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // Recheck authentication instead of displaying a cached signed-in screen on Back.
    const restore = event => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);
  function logout() {
    if (leaving || development) return;
    if (!window.confirm('로그아웃하시겠습니까? 저장하지 않은 입력 내용은 사라질 수 있습니다.')) return;
    setLeaving(true);
    // Easy Auth owns its HttpOnly cookie and token cache. Do not fake logout in React
    // or redirect to the protected homepage, which would immediately start SSO again.
    window.location.replace('/.auth/logout');
  }
  return <button type="button" className="portal-logout" onClick={logout}
    disabled={leaving || development}
    title={development ? '로컬 개발 계정은 로그아웃할 수 없습니다. 운영 사이트에서 이용해 주세요.' : '포털 인증 세션 종료'}>
    <SignOut size={17} aria-hidden="true"/>
    <span>{leaving ? '로그아웃 중…' : '로그아웃'}</span>
  </button>;
}
