import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatKst,kstDate,markdownTimesKst} from '../shared/portal-time.mjs';
import {finalDocument,withArdApprovals} from '../shared/final-document.mjs';

test('portal dates use KST across midnight and year boundaries, preserving date-only input',()=>{
 assert.equal(formatKst('2026-09-21T01:24:54.825Z'),'2026-09-21 10:24:54 KST');
 assert.equal(formatKst('2026-09-21T10:24:54+09:00'),'2026-09-21 10:24:54 KST');
 assert.equal(kstDate('2026-12-31T16:00:00Z'),'2027-01-01');
 assert.equal(formatKst('2026-09-21'),'2026-09-21');
 assert.equal(kstDate('2026-09-21'),'2026-09-21');
 assert.equal(formatKst(null),'—');
 assert.equal(formatKst('미정'),'미정');
});
test('new document completion and approval times are KST; legacy Markdown is formatted without mutation',()=>{
 const original='# INT\n작성 완료: 2026-09-21T01:24:54.825Z';
 assert.match(markdownTimesKst(original),/10:24:54 KST/);
 assert.ok(original.includes('01:24:54.825Z'));
 assert.match(finalDocument('# INT 초안','INT','User','2026-09-21T01:24:54Z'),/10:24:54 KST/);
 assert.match(withArdApprovals('# ARD',{workflowApprovals:{G2:{owner:{at:'2026-09-21T01:24:54Z'}}}}),/10:24:54 KST/);
});
test('completed INT hides the authoring iframe and single-scroll workspace reports content height safely',()=>{
 const page=fs.readFileSync(new URL('../app/native-agent-workspace.tsx',import.meta.url),'utf8');
 const route=fs.readFileSync(new URL('../app/api/native-agent/[code]/workspace/route.js',import.meta.url),'utf8');
 assert.ok(page.includes("document==='INT'&&access.hasFinal"));
 assert.ok(page.includes('event.origin!==window.location.origin'));
 assert.ok(page.includes('event.source!==frame.current?.contentWindow'));
 assert.ok(page.includes('height:frameHeight'));
 assert.ok(route.includes('new ResizeObserver(schedule)'));
 assert.ok(route.includes('.app .form-scroll,.app .chat,.app .doc'));
 assert.ok(route.includes('max-height:none!important;overflow:visible!important'));
});
