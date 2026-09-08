import {readFile} from 'node:fs/promises';
import {getPool,closePool} from '../server/db/pool.mjs';
const client=await getPool().connect();
try {
  await client.query('begin');
  await client.query(await readFile(new URL('../database/postgresql/20260908_work_mail.sql',import.meta.url),'utf8'));
  await client.query('commit');
  console.log('Work mail tables ready. No mail sent.');
} catch(error) {await client.query('rollback');throw error;}
finally {client.release();await closePool();}
