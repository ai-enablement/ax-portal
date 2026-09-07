import { readFile } from 'node:fs/promises';
import { getPool, closePool } from './db/pool.mjs';

const migration = await readFile(new URL('../database/postgresql/20260907_markdown_document_versions.sql', import.meta.url), 'utf8');
const pool = getPool();
try {
  await pool.query(migration);
  const check = await pool.query(`select
    to_regclass('agent_portal.markdown_document_versions')::text as table_name,
    has_table_privilege(current_user,'agent_portal.markdown_document_versions','SELECT,INSERT') as app_access`);
  console.log(JSON.stringify(check.rows[0]));
} finally {
  await closePool();
}
