-- JustMeetAlready on D1. Applied with: wrangler d1 migrations apply justmeetalready
-- The Worker also runs CREATE TABLE IF NOT EXISTS for these tables on
-- startup, so a deploy that skips the migration step still works.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
  event_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (event_id, id)
);
CREATE TABLE IF NOT EXISTS signin_failures (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
