-- Adds identity columns used by the authenticated MCP connector path.
--
-- The webhook collector (anonymous, best-effort) keeps writing app_user=NULL.
-- The MCP connector path writes the Auth0-verified user into app_user (email)
-- and user_sub (the Auth0 `sub`), plus a `surface` tag so the two sources are
-- distinguishable.
--
-- Apply from a host that can reach the DB:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_skill_usage_identity.sql

BEGIN;

ALTER TABLE dreamscape.skill_usage ADD COLUMN IF NOT EXISTS user_sub TEXT;
ALTER TABLE dreamscape.skill_usage ADD COLUMN IF NOT EXISTS surface  TEXT;

CREATE INDEX IF NOT EXISTS idx_skill_usage_user_sub ON dreamscape.skill_usage (user_sub);
CREATE INDEX IF NOT EXISTS idx_skill_usage_surface  ON dreamscape.skill_usage (surface);

COMMIT;
