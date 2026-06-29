import { getPool } from "@/lib/db";

// Single source of truth for writing a skill-usage row. Used by both the
// anonymous webhook collector and the authenticated MCP connector.
const INSERT = `
INSERT INTO dreamscape.skill_usage
  (event_ts, skill, tool_name, session_id, app_user, user_sub, surface, host, cwd, tool_input, raw, dedupe_key)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
ON CONFLICT (dedupe_key) DO NOTHING
`;

export interface UsageRecord {
  eventTs?: string | null;
  skill: string;
  toolName?: string | null;
  sessionId?: string | null;
  appUser?: string | null; // email (MCP) — NULL for anonymous webhook
  userSub?: string | null; // Auth0 sub (MCP)
  surface?: string | null; // e.g. "skill-embedded" | "mcp-connector" | "cli-hook"
  host?: string | null;
  cwd?: string | null;
  toolInput?: unknown;
  raw?: unknown;
  dedupeKey: string;
}

// Returns the number of rows inserted (0 means it was a duplicate).
export async function insertUsage(rec: UsageRecord): Promise<number> {
  const values = [
    rec.eventTs ?? null,
    rec.skill,
    rec.toolName ?? null,
    rec.sessionId ?? null,
    rec.appUser ?? null,
    rec.userSub ?? null,
    rec.surface ?? null,
    rec.host ?? null,
    rec.cwd ?? null,
    JSON.stringify(rec.toolInput ?? null),
    JSON.stringify(rec.raw ?? null),
    rec.dedupeKey,
  ];
  const pool = getPool();
  const result = await pool.query(INSERT, values);
  return result.rowCount ?? 0;
}
