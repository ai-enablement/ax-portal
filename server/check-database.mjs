import { closePool, getPool, validateDatabaseEnvironment } from "./db/pool.mjs";

try {
  validateDatabaseEnvironment();
  const result = await getPool().query(
    `select current_database() as database,
            current_user as database_user,
            to_regclass('agent_portal.projects') is not null as schema_ready`,
  );
  const status = result.rows[0];
  console.log(
    `Connected to ${status.database} as ${status.database_user}. Schema ready: ${status.schema_ready}`,
  );
  if (!status.schema_ready) process.exitCode = 2;
} catch (error) {
  console.error(`PostgreSQL connection failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
