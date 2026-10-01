import { kstDate } from './portal-time.mjs';

export const LAUNCH_END_DATE = '2026-10-31';
export const LAUNCH_START_DATE = '2026-10-01';
export function shouldShowLaunch(now = new Date(), hiddenDate = '') {
  const today = kstDate(now);
  return today >= LAUNCH_START_DATE && today <= LAUNCH_END_DATE && hiddenDate !== today;
}
export function launchStorageKey(account = 'unknown') {
  return `agent-portal-launch-hidden-202610:${encodeURIComponent(String(account).toLowerCase())}`;
}
