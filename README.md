# sbi_telemetry

Skill-usage telemetry **collector** for the SBI skills marketplace. It receives the
webhook that the [`telemetry` plugin](https://github.com/SBI-AI/SBI-Skills) fires on every
skill invocation and writes one row to Postgres (`dreamscape.skill_usage`).

This is a drop-in replacement for the original `firm-project` collector, with the
ingestion bug fixed (the table now has the unique index that `ON CONFLICT (dedupe_key)`
requires).

## Endpoint

`/api/skill-usage`

- `GET` → health check: `{ "ok": true, "service": "skill-usage-collector", "tokenRequired": false }`
- `POST` → ingest one skill-usage record (JSON body from the hook).

POST body (sent by `track_skill_usage.py`):

```json
{
  "event": "skill_used",
  "timestamp": "2026-06-22T20:00:00+00:00",
  "skill": "rgd-metrics",
  "tool_name": "Skill",
  "session_id": "abc-123",
  "cwd": "/Users/jane/proj",
  "user": "jane",
  "host": "jane-mbp",
  "tool_input": { "command": "rgd-metrics" }
}
```

It is upserted with `ON CONFLICT (dedupe_key) DO NOTHING`, where
`dedupe_key = "<session_id>:<timestamp>:<skill>"`, so retries / double-fires don't
double-count.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL (or PG_* vars)
npm run migrate              # applies migrations/001_skill_usage.sql (needs DB access)
npm run dev                  # http://localhost:3000/api/skill-usage
```

### Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | yes (or PG_* below) | Postgres connection string |
| `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` | alt | Discrete connection vars |
| `PGSSL` | no | Set to `disable` for a local non-SSL Postgres (RDS needs SSL) |
| `INGEST_TOKEN` | no | If set, callers must send `Authorization: Bearer <token>` |

## Deploy (Vercel)

1. Import this repo in Vercel (framework auto-detected as Next.js).
2. Add the env vars above in **Project → Settings → Environment Variables**.
3. Ensure the Vercel deployment can reach the DB (RDS security group / pooler).
4. Deploy. Your endpoint is `https://<project>.vercel.app/api/skill-usage`.

## Point the hook here

In the `SBI-Skills` repo's telemetry hook, set the endpoint (managed settings is best
so it can't be overridden):

```jsonc
{
  "env": {
    "SBI_SKILL_TELEMETRY_URL": "https://<project>.vercel.app/api/skill-usage"
  },
  "enabledPlugins": ["telemetry@sbi-skills"]
}
```

## Test

```bash
curl -sS -X POST https://<project>.vercel.app/api/skill-usage \
  -H 'Content-Type: application/json' \
  -d '{"skill":"__healthcheck__","tool_name":"Skill","session_id":"t1","timestamp":"2026-06-29T12:00:00+00:00","user":"tester","host":"ci","tool_input":{"command":"__healthcheck__"}}'
# -> {"ok":true,"inserted":1}

psql "$DATABASE_URL" -c \
  "SELECT skill, app_user, event_ts FROM dreamscape.skill_usage ORDER BY id DESC LIMIT 5;"
```
