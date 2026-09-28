import fs from 'node:fs/promises';
import {getPool,closePool} from '../server/db/pool.mjs';
const data=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
if(!data.projects?.length || new Set(data.projects.map(p=>p.id)).size!==data.projects.length)throw Error('Invalid source rows');
const client=await getPool().connect();
try {
 await client.query('begin');
 await client.query(await fs.readFile(new URL('../database/postgresql/rpa_portal.sql',import.meta.url),'utf8'));
 // Preserve portal visibility choices and their audit trail across source reimports.
 for(const p of data.projects)await client.query(`insert into agent_portal.rpa_projects(id,project_code,payload,source_hash) values($1,$2,$3,$4) on conflict(id) do update set project_code=excluded.project_code,payload=excluded.payload || (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(rpa_projects.payload) where key in ('visibility','revision','history','deletedAt','deletedBy','deleteReason')),source_hash=excluded.source_hash`,[p.id,p.code,p,data.sha256]);
 const check=await client.query('select count(*)::int as count from agent_portal.rpa_projects where source_hash=$1',[data.sha256]);
 if(check.rows[0].count!==data.projects.length)throw Error('Import count mismatch');
 await client.query('commit');console.log(JSON.stringify({imported:check.rows[0].count,duplicates:data.duplicateCodes,picLinksCreated:0}));
}catch(e){await client.query('rollback');throw e;}finally{client.release();await closePool();}
