import { NextResponse } from "next/server";
import { insertUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_TOKEN = process.env.INGEST_TOKEN?.trim();

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

  try {
    const inserted = await insertUsage({
      eventTs,
      skill,
      toolName: str(event.tool_name),
      sessionId,
      appUser: str(event.user), // anonymous webhook: usually null
      surface: str(event.surface) ?? "skill-embedded",
      host: str(event.host),
      cwd: str(event.cwd),
      toolInput: event.tool_input ?? null,
      raw: event,
      dedupeKey,
    });
    // inserted === 0 means it was a duplicate (ON CONFLICT DO NOTHING).
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "ingest failed", detail }, { status: 500 });
  }
}
