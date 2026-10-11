-- EmniFun admin authorization and puzzle management timestamps.
-- Apply after 0002_auth_security_fixes.sql.

ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

ALTER TABLE fivewink_puzzles ADD COLUMN created_at INTEGER;
ALTER TABLE fivewink_puzzles ADD COLUMN updated_at INTEGER;
