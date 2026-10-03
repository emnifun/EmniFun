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
