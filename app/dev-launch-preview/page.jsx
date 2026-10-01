import { notFound } from 'next/navigation';
import LaunchOnboarding from '../launch-onboarding';

// Isolated UI check without production authentication or database access.
export default function LaunchPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <main style={{ minHeight: '100vh', padding: 28, background: '#f5f7fb' }}><h1>Agent Portal · 사용 안내 미리보기</h1><p>운영 데이터에 연결되지 않는 로컬 화면입니다.</p><LaunchOnboarding enabled account="local-launch-preview"/></main>;
}
