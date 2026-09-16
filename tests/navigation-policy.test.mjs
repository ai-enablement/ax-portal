import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canOpenCostMonitoring} from '../shared/navigation-policy.mjs';

test('RPA Restart is a single Service & Control external link with safe new-tab navigation',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.equal(source.split('<span className="nav-copy">RPA Restart</span>').length-1,1);
  assert.match(source,/group.label === "SERVICE & CONTROL" && \([\s\S]*?aria-label="RPA Restart \(새 탭에서 열기\)"/);
  assert.match(source,/window.open\(\s*"https:\/\/rpa-restart-ckemcudeddc9dcen\.koreacentral-01\.azurewebsites\.net\/",\s*"_blank",\s*"noopener,noreferrer"/);
});

test('general User and unresolved identities cannot open cost monitoring',()=>{
  for(const role of ['general_user',undefined,null,'','unknown'])assert.equal(canOpenCostMonitoring(role),false);
  for(const role of ['admin','team_leader','team_member','bts','bp_solution'])assert.equal(canOpenCostMonitoring(role),true);
});
test('cost link, guide and click handler share the role guard',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('group.label === "SERVICE & CONTROL" && canAccessLlmCost'));
  assert.ok(source.includes('canAccessLlmCost && llmCostGuideOpen'));
  assert.ok(source.includes('if (!canAccessLlmCost) return;'));
  assert.ok(source.includes('if (!canAccessLlmCost) setLlmCostGuideOpen(false)'));
});
