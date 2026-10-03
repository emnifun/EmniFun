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

Game 1 daily puzzle storage is date-wise:

ONE DATE = ONE WORD FILE + ONE CLUE FILE

Example for 2026-10-03:

data/game1/puzzles/words/2026/2026-10-03.json
data/game1/puzzles/clues/2026/2026-10-03.json

The word file contains the answer and status for that date only.
The clue file contains the five clues for that date only.
Both files use game = game1, the same date, and the same puzzle ID.

Word file:

{
  "id": "game1-2026-10-03",
  "game": "game1",
  "date": "2026-10-03",
  "answer": "HOUSE",
  "status": "published"
}

Clue file:

{
  "id": "game1-2026-10-03",
  "game": "game1",
  "date": "2026-10-03",
  "clues": [
    "People live in it.",
    "It has rooms.",
    "It usually has a door.",
    "It can have a roof.",
    "It is a place to live."
  ]
}

Do not put multiple dates into one daily word file or one daily clue file.

### Puzzle index

data/game1/puzzles/index.json is only the manifest. Each date points to its two daily files.

Example entry:

{
  "id": "game1-2026-10-03",
  "game": "game1",
  "date": "2026-10-03",
  "wordPath": "words/2026/2026-10-03.json",
  "cluePath": "clues/2026/2026-10-03.json"
}

The index does not duplicate answer or clue text.

### Puzzle service

The Game 1 UI and logic do not read word or clue files directly.
The puzzle service uses the date/index entry, loads that date's two files, validates them,
and combines them into the same puzzle object Game 1 already expects:

    id + game + date + answer + clues + status

### Create a new daily puzzle

For 2026-10-08:

1. Create puzzles/words/2026/2026-10-08.json.
2. Put the selected answer and status in it.
3. Create puzzles/clues/2026/2026-10-08.json.
4. Put exactly five clues in it.
5. Use date 2026-10-08 in both files.
6. Add the matching wordPath and cluePath entry to index.json.

Start with status = draft and change it to published when ready.

### Statuses

- draft — being prepared; not selected for normal play.
- published — the official puzzle for that date.
- unpublished — exists but is unavailable for normal play.
- archived — historical puzzle kept for the archive.

Status belongs to the daily word record.

### Future years

The same pattern works for every year:

    puzzles/words/2027/2027-01-01.json
    puzzles/clues/2027/2027-01-01.json

Existing answers, clues, dates, IDs, and statuses must be preserved exactly during migrations.
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
