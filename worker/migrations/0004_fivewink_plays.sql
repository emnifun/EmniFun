-- FiveWink authenticated play uniqueness per puzzle.
-- Enforces one play per published puzzle for logged-in accounts.

CREATE TABLE IF NOT EXISTS fivewink_plays (
  emnifeed_id TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (emnifeed_id, puzzle_id),
  FOREIGN KEY (emnifeed_id) REFERENCES accounts(emnifeed_id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES fivewink_puzzles(puzzle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fivewink_plays_puzzle
  ON fivewink_plays(puzzle_id);

CREATE INDEX IF NOT EXISTS idx_fivewink_plays_session
  ON fivewink_plays(session_id);
