import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('home project list becomes a modal drawer without wrapping the document panel',()=>{
 const page=read('../app/page.tsx');
 assert.match(page,/<ProjectListDrawer count=\{projectItems.length\}>/);
 assert.match(page,/<\/ProjectListDrawer>\s*<article className="panel selected-project-status oneview-status">/);
 assert.match(page,/data-project-select\s+onClick=\{\(\) => selectProject\(index\)\}/);
});
test('drawer exposes accessible open close and selection affordances',()=>{
 const drawer=read('../app/project-list-drawer.tsx');
 assert.match(drawer,/aria-haspopup="dialog" aria-expanded=\{open\}/);
 assert.match(drawer,/showModal\(\)/);
 assert.match(drawer,/trigger.current\?\.focus\(\)/);
 assert.match(drawer,/closest\('\[data-project-select\]'\)/);
 assert.match(drawer,/aria-label="과제 목록"/);
});
