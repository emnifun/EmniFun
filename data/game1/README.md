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

## Puzzle archive

Folder:

`data/game1/puzzles/`

Each actual puzzle is stored in its own date-based file:

```
data/
└── game1/
    ├── vocabulary/
    │   ├── valid-guesses.json
    │   └── answers.json
    │
    └── puzzles/
        ├── index.json
        ├── README.md
        └── 2026/
            ├── 2026-10-02.json
            ├── 2026-10-03.json
            └── ...
```

The archive index only tells the service which date files exist. The complete puzzle content stays in the date file itself.

## Puzzle record

A puzzle file looks like this:

```json
{
  "id": "game1-2026-10-04",
  "game": "game1",
  "date": "2026-10-04",
  "answer": "TRAIN",
  "clues": [
    "It travels on tracks.",
    "It carries passengers or goods.",
    "It often has many carriages.",
    "It stops at stations.",
    "It has five letters."
  ],
  "status": "draft"
}
```

Dates always use **YYYY-MM-DD**.

Supported statuses are:

- `draft` — being prepared; never selected for normal play.
- `published` — the official puzzle for that date.
- `unpublished` — intentionally unavailable for normal play.
- `archived` — historical puzzle; kept permanently but not playable as the active daily puzzle.

For one date, the service allows zero or one published puzzle. If two published records are present for the same Game 1 date, the service throws a clear data error instead of choosing one.

## Today's puzzle

Game 1 asks the puzzle service for the current date.

The UI does not contain answers such as APPLE, HOUSE, or TRAIN.

The service:

1. resolves today's date as YYYY-MM-DD;
2. checks the puzzle archive index for that date;
3. loads the matching date file(s);
4. validates each record;
5. selects the single published Game 1 puzzle.

If no puzzle exists or none is published, the game shows an unavailable state. It does not use yesterday's puzzle, tomorrow's puzzle, a fallback answer, or an invented puzzle.

## Manual workflow

To create tomorrow's puzzle:

1. Create the date file, for example:
   `data/game1/puzzles/2026/2026-10-04.json`
2. Put in the id, game, date, answer, five clues, and `"status": "draft"`.
3. Make sure the answer exists in both `answers.json` and `valid-guesses.json`.
4. Add the matching file entry to `data/game1/puzzles/index.json`.
5. Preview/test the puzzle.
6. Change only the puzzle's status to `"published"` when it is ready.
7. Commit and push the change.

You do **not** need to edit Game 1 UI or Game 1 logic to create a daily puzzle.

To take a puzzle offline, change `published` to `unpublished`. To retain it as history, use `archived`.

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
