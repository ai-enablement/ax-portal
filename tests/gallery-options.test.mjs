import test from 'node:test';
import assert from 'node:assert/strict';
import {GALLERY_CATEGORIES,GALLERY_PLATFORMS,GALLERY_DATA_CLASSES,galleryCodes,displayGallerySelections,primaryGalleryDataClass,toggleGallerySelection,assertGalleryCategory} from '../shared/gallery-options.mjs';

test('Gallery uses the requested business categories',()=>{
  assert.deepEqual(GALLERY_CATEGORIES,['자료검색','데이터분석','업무자동화','교육/가이드','기타']);
  for(const value of GALLERY_CATEGORIES)assert.doesNotThrow(()=>assertGalleryCategory(value));
  assert.throws(()=>assertGalleryCategory('생산성'),/카테고리/);
});

test('creation platforms and data classes support multiple unique selections',()=>{
  assert.equal(GALLERY_PLATFORMS.length,4);
  assert.equal(GALLERY_DATA_CLASSES.length,4);
  const selected=toggleGallerySelection(toggleGallerySelection([], 'Copilot Studio'),'Power Automate');
  assert.deepEqual(galleryCodes(selected,'platform'),['copilot_studio','power_platform']);
  assert.equal(displayGallerySelections(['copilot_studio','power_automate','power_apps'],'platform'),'Copilot Studio · Power Platform');
  assert.deepEqual(galleryCodes(['Power Apps','Power Automate','Power Platform'],'platform'),['power_platform']);
  assert.equal(primaryGalleryDataClass(['사내','개인정보 포함']),'personal_data');
  assert.throws(()=>galleryCodes([], 'platform'),/선택/);
});
