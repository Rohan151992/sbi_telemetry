import { Pool, type PoolConfig } from "pg";

// Reuse a single pool across hot lambda invocations (Next.js / Vercel).
declare global {
  // eslint-disable-next-line no-var
  var __sbiTelemetryPool: Pool | undefined;
}

function buildConfig(): PoolConfig {
  const url = process.env.DATABASE_URL;
  if (url && url.trim()) {
    return {
      connectionString: url.trim(),
      ssl: sslConfig(),
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10000,
    };
  }

  // Fallback to discrete PG_* vars (matches localmcp/.env layout).
  return {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? 5432),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: sslConfig(),
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  };
}

function sslConfig() {
  // RDS terminates TLS; we don't ship the CA bundle, so don't verify the chain.
  // Disable with PGSSL=disable for local Postgres.
  if ((process.env.PGSSL ?? "").toLowerCase() === "disable") return false;
  return { rejectUnauthorized: false };
}

export function getPool(): Pool {
  if (!global.__sbiTelemetryPool) {
    global.__sbiTelemetryPool = new Pool(buildConfig());
  }
  return global.__sbiTelemetryPool;
}
