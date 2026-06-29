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

## Test (webhook collector)

```bash
curl -sS -X POST https://<project>.vercel.app/api/skill-usage \
  -H 'Content-Type: application/json' \
  -d '{"skill":"__healthcheck__","tool_name":"Skill","session_id":"t1","timestamp":"2026-06-29T12:00:00+00:00","user":"tester","host":"ci","tool_input":{"command":"__healthcheck__"}}'
# -> {"ok":true,"inserted":1}

psql "$DATABASE_URL" -c \
  "SELECT skill, app_user, event_ts FROM dreamscape.skill_usage ORDER BY id DESC LIMIT 5;"
```

---

# MCP connector (captures user identity)

The webhook above gives **anonymous** counts. The MCP connector adds **who** — it
authenticates each user through **Auth0** and logs their identity (email + `sub`).
Identity comes from the OAuth token, never from the model, so it can't be spoofed.

- MCP endpoint: **`/api/mcp`** (Streamable HTTP + SSE)
- Tool exposed: **`log_skill_usage(skill)`** — the skill calls this first; the
  server attaches the signed-in user from the token.
- Auth: **Auth0** (tenant `sbi-pro.us.auth0.com`) via OAuth 2.1 + PKCE.
- Protected-resource metadata: `/.well-known/oauth-protected-resource`.

Rows land in the same `dreamscape.skill_usage` table with `surface='mcp-connector'`,
`app_user=<email>`, `user_sub=<auth0 sub>`.

## 1. Apply the identity migration

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_skill_usage_identity.sql
```

## 2. Configure Auth0 (one-time, in the Auth0 Dashboard)

Tenant: **`sbi-pro.us.auth0.com`**.

1. **Create an API** (Applications → APIs → Create API):
   - Identifier (audience): **`https://<project>.vercel.app/api/mcp`**
     (must match the MCP URL *exactly*, including no trailing slash mismatch).
   - Signing alg: RS256.
2. **Settings → General → API Authorization Settings → Default Audience** =
   the same identifier above. (MCP clients send `resource`; Auth0 needs a default
   audience to mint a JWT for it.)
3. **Settings → Advanced → enable:**
   - **Dynamic Client Registration (DCR)** — lets Claude self-register.
   - **Resource Parameter Compatibility Profile** — makes Auth0 honor the RFC 8707
     `resource` param as the token audience (without this you get
     *"userinfo audience is not allowed for third party clients"*).
4. **Authentication → Database → (your connection) → enable "Use for third-party
   clients" / promote to domain level** — DCR-registered clients can only use
   domain-level connections.
5. **Email in the token (recommended):** add an Auth0 **Action** (Login flow) so the
   access token carries the email:
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     api.accessToken.setCustomClaim("https://sbi.com/email", event.user.email);
   };
   ```
   Then set `AUTH0_EMAIL_CLAIM=https://sbi.com/email`. (Alternatively set
   `AUTH0_FETCH_USERINFO=true` to resolve email from `/userinfo`.)

## 3. Set env vars in Vercel

```
AUTH0_ISSUER_BASE_URL = https://sbi-pro.us.auth0.com
AUTH0_AUDIENCE        = https://<project>.vercel.app/api/mcp
AUTH0_EMAIL_CLAIM     = https://sbi.com/email      # if you added the Action
```

## 4. Add the connector in Claude

Team/Enterprise: **Admin settings → Connectors → Add custom connector** →
URL = `https://<project>.vercel.app/api/mcp`. Each member then **Settings →
Connectors → Connect** and logs in via Auth0 once. (If DCR is off, paste an Auth0
app's Client ID/Secret in the connector's Advanced settings instead.)

## 5. Make skills call the tool

In each `SKILL.md`, instruct the model to call `log_skill_usage` (skill name) as
its first step. The connector attaches the user automatically.

## Query who used what

```sql
SELECT app_user, skill, count(*) AS uses, max(event_ts) AS last_used
FROM dreamscape.skill_usage
WHERE surface = 'mcp-connector'
GROUP BY app_user, skill
ORDER BY uses DESC;
```
