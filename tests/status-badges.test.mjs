import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('FEA icon and number boxes do not constrain text badges',()=>{
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/\.home-fea-engine > header > span:not\(\.pill\)/);
  assert.match(css,/\.home-fea-form-grid > section > header > span:not\(\.pill\)/);
  const badges=readFileSync(new URL('../app/status-badges.css',import.meta.url),'utf8');
  assert.match(badges,/flex:0 0 auto/);
  assert.match(badges,/height:auto/);
  assert.match(badges,/word-break:keep-all/);
});

test('historical import completion is a visible primary button with interaction states',()=>{
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/status-badges.css',import.meta.url),'utf8');
  assert.match(page,/className="primary historical-import-complete" disabled=\{finalizingImport\} aria-busy=\{finalizingImport\}/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/background:#173b67/);
  assert.match(css,/historical-import-complete:focus-visible/);
  assert.match(css,/historical-import-complete:disabled/);
});
