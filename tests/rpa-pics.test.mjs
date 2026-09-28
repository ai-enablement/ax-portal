import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPics,validatePics,picFields} from '../shared/rpa-pics.mjs';
test('single legacy email is matched, ambiguous pairs are not guessed and existing links win',()=>{
 const p={id:'p',pics:['A'],fields:{'현업 이메일':'A@EXAMPLE.COM'}};
 assert.deepEqual(initialPics(p),[{pic:'A',email:'a@example.com'}]);
 assert.equal(initialPics({...p,pics:['A','B']})[0].email,'');
 assert.equal(initialPics(p,[{projectId:'p',pic:'A',email:'linked@example.com'}])[0].email,'linked@example.com');
});
test('PIC pairs validate and generate consistent display fields',()=>{
 const pairs=validatePics([{pic:' A ',email:' A@EXAMPLE.COM '},{pic:'B',email:''}]);
 assert.deepEqual(picFields(pairs),{PIC:'A/B','현업 이메일':'a@example.com'});
 assert.throws(()=>validatePics([{pic:'A',email:'invalid'}]));
 assert.throws(()=>validatePics([{pic:'A'},{pic:'a'}]));
});
