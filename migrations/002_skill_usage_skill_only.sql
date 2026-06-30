-- Enforce that dreamscape.skill_usage only ever holds genuine skill invocations.
--
-- Backstop for the collector's app-level gate (route.ts rejects tool_name != 'Skill').
-- Even if a stale client, an old collector, or a stray process tries to write
-- TaskCreate / AskUserQuestion / ToolSearch / mcp__* noise, the database itself
-- refuses it.
--
-- Idempotent: safe to run repeatedly and against an existing table.
--
-- Apply from a host that can reach the DB (VPN / bastion / Vercel build):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_skill_usage_skill_only.sql

BEGIN;

-- Remove any pre-existing non-Skill rows so the CHECK constraint can be added.
DELETE FROM dreamscape.skill_usage
WHERE tool_name IS DISTINCT FROM 'Skill';

-- Add the CHECK constraint only if it isn't already present (ADD CONSTRAINT has
-- no IF NOT EXISTS for CHECK constraints, so guard it explicitly).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'dreamscape.skill_usage'::regclass
          AND conname = 'skill_usage_tool_name_skill_only'
    ) THEN
        ALTER TABLE dreamscape.skill_usage
            ADD CONSTRAINT skill_usage_tool_name_skill_only
            CHECK (tool_name = 'Skill');
    END IF;
END
$$;

COMMIT;
