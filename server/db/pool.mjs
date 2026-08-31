import pg from "pg";

const { Pool } = pg;

const required = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"];

export function validateDatabaseEnvironment(env = process.env) {
  const missing = required.filter(
    (key) => !env[key] || String(env[key]).startsWith("CHANGE_ME"),
  );
  if (missing.length) {
    throw new Error(`Missing PostgreSQL environment values: ${missing.join(", ")}`);
  }
  if ((env.PGSSLMODE || "disable") !== "disable") {
    throw new Error("This gateway is configured for PGSSLMODE=disable only.");
  }
}

function numberFromEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

let pool;

export function getPool() {
  validateDatabaseEnvironment();
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: numberFromEnv("PGPORT", 5432, 1, 65535),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: false,
      max: numberFromEnv("PGPOOL_MAX", 10, 1, 50),
      idleTimeoutMillis: numberFromEnv(
        "PGIDLE_TIMEOUT_MS",
        30000,
        1000,
        600000,
      ),
      connectionTimeoutMillis: numberFromEnv(
        "PGCONNECTION_TIMEOUT_MS",
        5000,
        500,
        60000,
      ),
      statement_timeout: numberFromEnv(
        "PGSTATEMENT_TIMEOUT_MS",
        15000,
        1000,
        120000,
      ),
      application_name: "agent-governance-portal-webapp",
    });
    pool.on("error", (error) => {
      console.error("Unexpected idle PostgreSQL client error:", error.message);
    });
  }
  return pool;
}

export async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
