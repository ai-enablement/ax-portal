import {readFile} from 'node:fs/promises';
import {getPool,closePool} from '../server/db/pool.mjs';
try{await getPool().query(await readFile(new URL('../database/postgresql/shared_accounts.sql',import.meta.url),'utf8'));console.log('Shared account schema ready; existing accounts unchanged.');}finally{await closePool();}
