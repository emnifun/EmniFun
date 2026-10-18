CREATE TABLE IF NOT EXISTS fivewink_puzzles (
  puzzle_id TEXT PRIMARY KEY,
  game TEXT NOT NULL CHECK (game = 'game1'),
  date TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL CHECK (length(answer) = 5),
  clues_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'unpublished', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_fivewink_puzzles_date_status
  ON fivewink_puzzles(date, status);

CREATE TABLE IF NOT EXISTS fivewink_sessions (
  session_id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game = 'game1'),
  date TEXT NOT NULL,
  attempts_json TEXT NOT NULL,
  guesses_json TEXT NOT NULL,
  clues_json TEXT NOT NULL,
  clues_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('playing', 'awaiting-seventh', 'finished')),
  result TEXT,
  seventh_guess TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (puzzle_id) REFERENCES fivewink_puzzles(puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_fivewink_sessions_expiry
  ON fivewink_sessions(expires_at);
