import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_TOKEN = process.env.INGEST_TOKEN?.trim();

const INSERT = `
INSERT INTO dreamscape.skill_usage
  (event_ts, skill, tool_name, session_id, app_user, host, cwd, tool_input, raw, dedupe_key)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
ON CONFLICT (dedupe_key) DO NOTHING
`;

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "skill-usage-collector",
    tokenRequired: Boolean(INGEST_TOKEN),
  });
}

export async function POST(req: Request) {
  // Optional shared-secret gate.
  if (INGEST_TOKEN) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${INGEST_TOKEN}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = (await req.json()) as Record<string, unknown>;
    if (!event || typeof event !== "object") throw new Error("not an object");
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const eventTs = str(event.timestamp);
  const skill = str(event.skill) ?? "unknown";
  const sessionId = str(event.session_id);
  // Idempotency key: one record per (session, time, skill). Matches the schema docs.
  const dedupeKey = `${sessionId ?? ""}:${eventTs ?? ""}:${skill}`;

  const values = [
    eventTs, // $1 event_ts
    skill, // $2 skill
    str(event.tool_name), // $3 tool_name
    sessionId, // $4 session_id
    str(event.user), // $5 app_user
    str(event.host), // $6 host
    str(event.cwd), // $7 cwd
    JSON.stringify(event.tool_input ?? null), // $8 tool_input
    JSON.stringify(event), // $9 raw
    dedupeKey, // $10 dedupe_key
  ];

  try {
    const pool = getPool();
    const result = await pool.query(INSERT, values);
    // rowCount === 0 means it was a duplicate (ON CONFLICT DO NOTHING).
    return NextResponse.json({ ok: true, inserted: result.rowCount ?? 0 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "ingest failed", detail }, { status: 500 });
  }
}
