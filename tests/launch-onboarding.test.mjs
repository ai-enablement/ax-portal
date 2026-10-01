import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { shouldShowLaunch, launchStorageKey } from '../shared/launch-onboarding.mjs';
test('launch window uses Korea dates including October 31', () => {
  assert.equal(shouldShowLaunch(new Date('2026-09-30T14:59:59Z')), false);
  assert.equal(shouldShowLaunch(new Date('2026-09-30T15:00:00Z')), true);
  assert.equal(shouldShowLaunch(new Date('2026-10-31T14:59:59Z')), true);
  assert.equal(shouldShowLaunch(new Date('2026-10-31T15:00:00Z')), false);
});
test('today hide expires at Korea midnight and separates accounts', () => {
  assert.equal(shouldShowLaunch(new Date('2026-10-01T14:59:59Z'), '2026-10-01'), false);
  assert.equal(shouldShowLaunch(new Date('2026-10-01T15:00:00Z'), '2026-10-01'), true);
  assert.notEqual(launchStorageKey('one'), launchStorageKey('two'));
  assert.equal(launchStorageKey('USER@company.com'), launchStorageKey('user@company.com'));
});
test('onboarding is gated by authenticated identity and all assets ship locally', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /LaunchOnboarding enabled=\{identityStatus === 'ready' && Boolean\(identity\)\}/);
  for (const path of ['guides/agent-portal-user-guide.html', 'guides/Agent_Portal_개발_운영_관리자_가이드.html', 'guides/Agent_Portal_애니메이션_사용_가이드.html', 'guides/screens/user-request-filled.jpg', 'guides/screens/user-dashboard.jpg', 'guides/screens/user-gallery.jpg', 'guides/screens/user-guide.jpg', 'fonts/Pretendard-Regular.ttf', 'fonts/Pretendard-Bold.ttf']) {
    assert.equal(existsSync(new URL(`../public/${path}`, import.meta.url)), true, path);
  }
});
test('RPA is excluded and production preview does not bypass authentication', () => {
  const component = readFileSync(new URL('../app/launch-onboarding.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /RPA/);
  assert.doesNotMatch(component, /<Notice>|launch-note/);
  const preview = readFileSync(new URL('../app/dev-launch-preview/page.jsx', import.meta.url), 'utf8');
  assert.match(preview, /process.env.NODE_ENV !== 'development'\) notFound\(\)/);
});
