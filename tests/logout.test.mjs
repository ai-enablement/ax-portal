import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const component=readFileSync(new URL('../app/logout-button.jsx',import.meta.url),'utf8');
test('logout delegates to Easy Auth without a protected redirect or client-only cookie clearing',()=>{
  assert.match(component,/location\.replace\('\/\.auth\/logout'\)/);
  assert.doesNotMatch(component,/post_logout_redirect_uri|document\.cookie|localStorage\.clear/);
  assert.match(component,/window\.confirm/);
  assert.match(component,/if \(leaving \|\| development\) return/);
});
test('cached Back navigation refreshes authentication and header exposes logout',()=>{
  assert.match(component,/event\.persisted\) window\.location\.reload/);
  assert.match(component,/removeEventListener\('pageshow', restore\)/);
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/<LogoutButton development=/);
});
