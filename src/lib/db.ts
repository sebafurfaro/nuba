import mysql from "mysql2/promise";

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveSsl():
  | string
  | { rejectUnauthorized: boolean }
  | undefined {
  if (process.env.DATABASE_SSL !== "true") {
    return undefined;
  }
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  return { rejectUnauthorized };
}

const globalForDb = globalThis as unknown as {
  nubaMysqlPool?: mysql.Pool;
};

function createPool(): mysql.Pool {
  const host = process.env.DATABASE_HOST ?? "127.0.0.1";
  const user = process.env.DATABASE_USER ?? "root";
  const password = process.env.DATABASE_PASSWORD ?? "";
  const database = process.env.DATABASE_NAME ?? "nuba";
  const port = parsePort(process.env.DATABASE_PORT, 3306);

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number.parseInt(
      process.env.DATABASE_POOL_MAX ?? "10",
      10,
    ),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: resolveSsl(),
  });
}

export const pool: mysql.Pool =
  globalForDb.nubaMysqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.nubaMysqlPool = pool;
}
