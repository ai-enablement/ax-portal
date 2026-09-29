import {readFile} from 'node:fs/promises';
import {getPool,closePool} from '../server/db/pool.mjs';
try {
 await getPool().query(await readFile(new URL('../database/postgresql/20260929_d2b_dashboard_access.sql',import.meta.url),'utf8'));
 console.log('D2B access registry ready. Existing access changes preserved.');
} finally {await closePool();}
