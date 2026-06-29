-- Schema for the SBI skill-usage telemetry collector.
--
-- Idempotent: safe to run against the existing prod table. The critical line is
-- the UNIQUE INDEX on dedupe_key, without which the collector's
--   INSERT ... ON CONFLICT (dedupe_key) DO NOTHING
-- fails with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" and NO rows are written.
--
-- Apply from a host that can reach the DB (VPN / bastion / Vercel build):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_skill_usage.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS dreamscape;

CREATE TABLE IF NOT EXISTS dreamscape.skill_usage (
    id           BIGSERIAL PRIMARY KEY,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when the collector stored it
    event_ts     TIMESTAMPTZ,                         -- when the skill ran (from the hook)
    skill        TEXT NOT NULL,
    tool_name    TEXT,
    session_id   TEXT,
    app_user     TEXT,
    host         TEXT,
    cwd          TEXT,
    tool_input   JSONB,
    raw          JSONB,                               -- full hook payload, for safety
    dedupe_key   TEXT
);

-- In case the table already existed without these.
ALTER TABLE dreamscape.skill_usage ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON dreamscape.skill_usage (skill);
CREATE INDEX IF NOT EXISTS idx_skill_usage_time  ON dreamscape.skill_usage (event_ts);
CREATE INDEX IF NOT EXISTS idx_skill_usage_user  ON dreamscape.skill_usage (app_user);

-- Collapse any pre-existing duplicate dedupe_keys so the unique index can build.
DELETE FROM dreamscape.skill_usage a
USING dreamscape.skill_usage b
WHERE a.dedupe_key IS NOT NULL
  AND a.dedupe_key = b.dedupe_key
  AND a.id > b.id;

-- The piece that makes ON CONFLICT (dedupe_key) work: a NON-partial unique index.
-- NOTE: drop-then-create (not IF NOT EXISTS) on purpose — an existing *partial*
-- index (... WHERE dedupe_key IS NOT NULL) has the same name but does NOT satisfy a
-- plain `ON CONFLICT (dedupe_key)`, and IF NOT EXISTS would leave that broken index in place.
DROP INDEX IF EXISTS dreamscape.uq_skill_usage_dedupe;
CREATE UNIQUE INDEX uq_skill_usage_dedupe
    ON dreamscape.skill_usage (dedupe_key);

COMMIT;
