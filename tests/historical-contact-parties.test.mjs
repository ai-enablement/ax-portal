import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalParties} from '../shared/project-contacts.mjs';
import {isProjectParty} from '../shared/project-actors.mjs';
import {validateHistoricalContactUpdate,linkHistoricalContacts} from '../server/project-contacts.mjs';
const actor={id:1,app_role:'admin'};
const parties={requester:{name:'요구자',email:'requester@example.com'},owners:[{name:'Owner A',email:'a@example.com'},{name:'Owner B',email:'b@example.com'}]};
test('missing names and multiple owners can be completed after import finalization',()=>{
 const state={historicalImport:true,historicalImportFinalizedAt:'2026-09-30',requester:'미등록',projectOwner:'미등록'};
 assert.equal(historicalParties(state).requester.name,'');
 assert.deepEqual(validateHistoricalContactUpdate(state,{parties,complete:true},actor),{parties,complete:true});
 assert.throws(()=>validateHistoricalContactUpdate(state,{parties:{...parties,owners:[{name:'',email:'a@example.com'}]},complete:true},actor));
 assert.throws(()=>validateHistoricalContactUpdate(state,{parties:{...parties,owners:[parties.owners[0],parties.owners[0]]}},actor));
 assert.throws(()=>validateHistoricalContactUpdate(state,{parties},{id:2,app_role:'general_user'}),e=>e.status===403);
});
test('existing names and emails cannot be removed or replaced',()=>{
 const state={historicalImport:true,requester:'요구자',requesterEmail:parties.requester.email,projectOwners:parties.owners};
 assert.throws(()=>validateHistoricalContactUpdate(state,{parties:{...parties,owners:[parties.owners[0]]}},actor),e=>e.status===409);
 assert.throws(()=>validateHistoricalContactUpdate(state,{parties:{...parties,requester:{...parties.requester,email:'other@example.com'}}},actor),e=>e.status===409);
});
test('all owners are persisted as active members and completion is stored',async()=>{
 const calls=[];let id=10;const client={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{id:id++}]};}};
 const state={historicalImport:true};
 await linkHistoricalContacts(client,{id:5,organization_id:1},state,{parties,complete:true},1);
 assert.equal(state.historicalContactsCompleted,true);
 assert.equal(state.projectOwners.length,2);
 assert.equal(calls.filter(c=>c.sql.startsWith('insert into agent_portal.project_members')).length,3);
 for(const owner of state.projectOwners)assert.equal(isProjectParty(state,{id:owner.id,email:owner.email},'owner'),true);
 assert.equal(isProjectParty(state,{id:1,email:'admin@example.com'},'owner'),false);
});
