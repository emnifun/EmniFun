# Game 1 data

Game 1 keeps three separate kinds of data:

1. **Guess vocabulary** — every five-letter word that Game 1 accepts as a guess.
2. **Answer candidates** — the smaller curated set of words that are suitable to become answers.
3. **Puzzle archive** — the actual date-based puzzles that you create.

Changing one does not automatically generate or schedule another.

## Guess vocabulary

File:

`data/game1/vocabulary/valid-guesses.json`

This is the comprehensive accepted player-guess vocabulary. The current generated dataset contains **16,273 unique five-letter A-Z entries**.

There is no artificial maximum and no fixed target size. A word does not have to be a daily answer to be accepted as a guess.

Regenerate it with:

```
node scripts/generate-game1-vocabulary.mjs
```

The browser never calls a dictionary API. It loads this local generated file.

## Answer candidates

File:

`data/game1/vocabulary/answers.json`

This contains the current curated pool of approximately **182 answer candidates**.

These are only eligible answer words. They are **not** the daily schedule, and the program does not cycle through them automatically.

Every answer candidate should also exist in `valid-guesses.json`.

## Puzzle data

Game 1 daily puzzle data is separated into three layers:

1. **Answer schedule** — chooses the answer and status for each date.
2. **Clue data** — stores the five clues for each date.
3. **Puzzle index** — lists which Game 1 dates exist and points to the yearly schedule/clue files.

Folder:

`data/game1/puzzles/`

Structure:

```
puzzles/
├── index.json
├── README.md
├── schedule/
│   └── 2026.json
└── clues/
    └── 2026.json
```

### Daily answer schedule

File:

`data/game1/puzzles/schedule/2026.json`

The schedule is the source of truth for:

`DATE → ANSWER + STATUS`

Example:

```json
{
  "game": "game1",
  "year": 2026,
  "puzzles": {
    "2026-10-03": {
      "answer": "HOUSE",
      "status": "published"
    }
  }
}
```

Do not copy daily clues into the schedule.

### Daily clue data

File:

`data/game1/puzzles/clues/2026.json`

The clue data is the source of truth for:

`DATE → FIVE CLUES`

Each clue record uses the same date and Game 1 puzzle ID so the two data layers cannot be silently mixed.

Example:

```json
{
  "game": "game1",
  "year": 2026,
  "puzzles": {
    "2026-10-03": {
      "id": "game1-2026-10-03",
      "clues": [
        "People live in it.",
        "It has rooms.",
        "It usually has a door.",
        "It can have a roof.",
        "It is a place to live."
      ]
    }
  }
}
```

### Puzzle service synchronization

The Game 1 UI and logic do not read either file directly.

The puzzle service uses the **date** as the synchronization key, loads the matching schedule and clue records, validates them, and creates the same effective puzzle object Game 1 already expects:

```json
{
  "id": "game1-2026-10-03",
  "game": "game1",
  "date": "2026-10-03",
  "answer": "HOUSE",
  "clues": ["...", "...", "...", "...", "..."],
  "status": "published"
}
```

The game therefore remains independent from the storage layout.

### Creating a new daily puzzle

For a future date such as `2026-10-08`:

1. Add the answer and status to `schedule/2026.json`.
2. Add the five clues to `clues/2026.json` under the same date.
3. Add the date to `index.json` with the matching yearly schedule/clue paths.
4. Use `draft` until the puzzle is ready.
5. Change the schedule status to `published` when it should become playable.

You do **not** copy the answer into the clue data.

You do **not** need to edit Game 1 UI or Game 1 logic.

### Statuses

Supported statuses are:

- `draft` — being prepared; never selected for normal play.
- `published` — the official puzzle for that date.
- `unpublished` — intentionally unavailable for normal play.
- `archived` — historical puzzle; kept but not playable.

Status belongs to the daily scheduled puzzle and is stored with the answer schedule, not separately on individual clues.

### Migration rule

Existing daily answers and clues must remain unchanged when moving between the old combined date files and the new split schedule/clue structure.

The answer candidate pool remains in:

`data/game1/vocabulary/answers.json`

The guess vocabulary remains in:

`data/game1/vocabulary/valid-guesses.json`

## Static-site privacy limitation

This is a public static-site architecture. Any puzzle JSON that is checked into and shipped from a public GitHub repository can be inspected by users, even when its status is `draft` or `unpublished`.

So status controls **normal gameplay selection**, not secrecy.

Before production, unreleased puzzle data should live in a private backend/database. The public frontend should receive only the currently published puzzle.

## Future admin/backend

The puzzle record in these JSON files is already the conceptual data entity that a future admin dashboard and database can use.

Today:

```
Game 1 → Puzzle Service → Local JSON
```

Later:

```
Game 1 → Puzzle Service → Backend API → Database
                              ↑
                       Admin Dashboard
```

The Game 1 UI and rules can continue using the same service functions and puzzle fields. The storage implementation can change without redesigning the puzzle record or rewriting the game.

Game 2 and Game 3 keep their own data structures. Nothing here requires future games to use Game 1's five-letter puzzle schema.
