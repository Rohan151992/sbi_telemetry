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

  // Fallback to discrete vars. Accept several common naming conventions so the
  // collector works whether you set PG_* or DATABASE_* (incl. the SBI shared set).
  return {
    host: pickEnv("PG_HOST", "DATABASE_HOST"),
    port: Number(pickEnv("PG_PORT", "DATABASE_PORT") ?? 5432),
    database: pickEnv("PG_DATABASE", "DATABASE_NAME", "DATABASE"),
    user: pickEnv("PG_USER", "DATABASE_USER", "DATABASE_ADMIN_USERNAME"),
    password: pickEnv("PG_PASSWORD", "DATABASE_PASSWORD", "DATABASE_ADMIN_PASSWORD"),
    ssl: sslConfig(),
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  };
}

// Return the first non-empty value among the given env var names.
function pickEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
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
