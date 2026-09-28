// Idempotent schema setup only: no workbook re-import, no deletion or role changes.
import fs from 'node:fs/promises';
import {getPool,closePool} from '../server/db/pool.mjs';
const c=await getPool().connect();
try{
 await c.query('begin');
 await c.query("set local lock_timeout='5s'");
 const before=(await c.query("select to_regclass('agent_portal.rpa_projects') as present")).rows[0].present;
 const countBefore=before?Number((await c.query('select count(*) as n from agent_portal.rpa_projects')).rows[0].n):0;
 await c.query(await fs.readFile(new URL('../database/postgresql/rpa_portal.sql',import.meta.url),'utf8'));
 const tables=(await c.query("select table_name from information_schema.tables where table_schema='agent_portal' and table_name like 'rpa_%' order by table_name")).rows.map(r=>r.table_name);
 const counts=(await c.query('select (select count(*) from agent_portal.rpa_projects)::int as projects,(select count(*) from agent_portal.rpa_requests)::int as requests,(select count(*) from agent_portal.rpa_master_sheet)::int as master_rows,(select count(*) from agent_portal.rpa_request_history)::int as history_rows')).rows[0];
 if(counts.projects!==countBefore||counts.master_rows!==counts.projects)throw Error('Unexpected master count change');
 await c.query('commit');
 console.log(JSON.stringify({database:process.env.PGDATABASE,tables,...counts,preservedMasterRows:true}));
}catch(e){await c.query('rollback');throw e;}finally{c.release();await closePool();}
