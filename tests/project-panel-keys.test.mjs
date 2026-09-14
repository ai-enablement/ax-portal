import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('project management siblings have distinct stable keys across stage changes',()=>{
 const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const file=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const expressions=new Map();
 function visit(node){
  if(ts.isJsxSelfClosingElement(node)&&['HistoricalAdmin','ProjectDeadline'].includes(node.tagName.getText(file))){
   const name=node.tagName.getText(file);
   assert.equal(expressions.has(name),false,`${name} must have one render location`);
   const key=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)==='key');
   assert.ok(key&&ts.isJsxExpression(key.initializer));
   expressions.set(name,key.initializer.expression.getText(file));
  }
  ts.forEachChild(node,visit);
 }
 visit(file);assert.equal(expressions.size,2);
 const keys=current=>[...expressions.values()].map(expression=>Function('current',`return (${expression})`)(current));
 const first=keys({no:'2026-033',journeyStep:0});
 for(let click=0;click<30;click++){
  const current=keys({no:'2026-033',journeyStep:click%10});
  assert.equal(new Set(current).size,2,'sibling key collision can leave duplicate DOM cards');
  assert.deepEqual(current,first,'stage clicks must not remount project management cards');
 }
 assert.ok(keys({no:'2026-043'}).every((key,i)=>key!==first[i]),'switching project resets each editor');
});
