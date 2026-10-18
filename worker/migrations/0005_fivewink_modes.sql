-- FiveWink gameplay mode support.
-- Adds mode column to fivewink_sessions and fivewink_plays.

ALTER TABLE fivewink_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'default';
ALTER TABLE fivewink_plays ADD COLUMN mode TEXT NOT NULL DEFAULT 'default';
