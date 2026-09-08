import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const dashboard=page.slice(page.indexOf('function LegacyTeamWorkspaceDashboard('),page.indexOf('function TeamPortfolioAnalytics('));
test('category selection filters the shared upper project list and reveals it',()=>{
 assert.match(dashboard,/categoryFilter === "전체" \|\| item.category === categoryFilter/);
 assert.match(dashboard,/return matchesStatus && matchesAssignee && matchesCategory/);
 assert.match(dashboard,/onCategory=\{\(category\) => \{\s*setStatusFilter\("전체"\);\s*setAssigneeFilter\("전체"\);\s*setCategoryFilter\(category\);\s*revealDetails\(\);/);
 assert.match(dashboard,/onMember=\{\(memberId\) => \{\s*setStatusFilter\("전체"\);\s*setCategoryFilter\("전체"\);/);
 assert.match(dashboard,/onClick=\{\(\) => openProject\(item\)\}/);
 assert.match(dashboard,/<TeamProjectModal[\s\S]*openWorkflow=\{openWorkflow\}/);
});
test('category rows use keyboard-operable buttons with selected state',()=>{
 assert.match(page,/<button type="button" className="category-workload-row"[\s\S]*?onClick=\{\(\) => onCategory\(category.category\)\}[\s\S]*?aria-pressed=\{selectedCategory === category.category\}/);
});
