export const GALLERY_CATEGORIES = ['자료검색', '데이터분석', '업무자동화', '교육/가이드', '기타'];
export const GALLERY_PLATFORMS = ['Vibe Coding', 'Copilot Studio', 'Power Automate', 'Power Apps', '기타'];
export const GALLERY_DATA_CLASSES = ['공개', '사내', '기밀', '개인정보 포함'];
const platformCodes = ['vibe_coding', 'copilot_studio', 'power_automate', 'power_apps', 'other'];
const dataCodes = ['public', 'internal', 'confidential', 'personal_data'];
export function gallerySelections(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split(' · ')).map(v => String(v).trim()).filter(Boolean))];
}
export function toggleGallerySelection(values, value) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}
export function galleryCodes(value, kind) {
  const labels = kind === 'platform' ? GALLERY_PLATFORMS : GALLERY_DATA_CLASSES;
  const codes = kind === 'platform' ? platformCodes : dataCodes;
  const values = gallerySelections(value);
  if (!values.length || values.some(v => !labels.includes(v) && !codes.includes(v))) throw new Error('갤러리 선택 항목을 확인해 주세요.');
  return values.map(v => codes.includes(v) ? v : codes[labels.indexOf(v)]);
}
export function displayGallerySelections(codes, kind) {
  const labels = kind === 'platform' ? GALLERY_PLATFORMS : GALLERY_DATA_CLASSES;
  const keys = kind === 'platform' ? platformCodes : dataCodes;
  return gallerySelections(codes).map(v => labels[keys.indexOf(v)] || v).join(' · ');
}
export function primaryGalleryDataClass(value) {
  const codes = galleryCodes(value, 'data');
  return [...dataCodes].reverse().find(code => codes.includes(code));
}
export function assertGalleryCategory(value) {
  if (!GALLERY_CATEGORIES.includes(value)) throw new Error('갤러리 카테고리를 선택해 주세요.');
}
