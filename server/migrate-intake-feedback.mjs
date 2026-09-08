import {readFile} from 'node:fs/promises';
import {getPool,closePool} from './db/pool.mjs';
const pool=getPool();
try {
  await pool.query(await readFile(new URL('../database/postgresql/20260908_intake_feedback.sql',import.meta.url),'utf8'));
  console.log('INT feedback schema migration completed; existing records preserved.');
} finally {await closePool();}
