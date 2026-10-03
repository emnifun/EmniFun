# Game 1 puzzle data

Game 1 daily answers and clues are stored separately.

The answer candidate pool is stored separately in:

`../vocabulary/answers.json`

That file only says which words are eligible to become answers. It does **not** decide which word is used on which date.

## Folder structure

```
puzzles/
├── index.json
├── README.md
├── schedule/
│   └── 2026.json
└── clues/
    └── 2026.json
```

## Answer schedule

Yearly schedule files determine:

`DATE → ANSWER + STATUS`

Example:

```json
{
  "game": "game1",
  "year": 2026,
  "puzzles": {
    "2026-10-08": {
      "answer": "APPLE",
      "status": "draft"
    }
  }
}
```

The schedule does not contain clue text.

## Clue data

Yearly clue files determine:

`DATE → FIVE CLUES`

Example:

```json
{
  "game": "game1",
  "year": 2026,
  "puzzles": {
    "2026-10-08": {
      "id": "game1-2026-10-08",
      "clues": [
        "Clue 1",
        "Clue 2",
        "Clue 3",
        "Clue 4",
        "Clue 5"
      ]
    }
  }
}
```

The clue entry uses the same date and puzzle ID as the answer schedule.

## Puzzle index

`index.json` is the archive manifest. It lists the dates that exist and points to the yearly schedule and clue files.

Example:

```json
{
  "id": "game1-2026-10-08",
  "game": "game1",
  "date": "2026-10-08",
  "schedulePath": "schedule/2026.json",
  "cluePath": "clues/2026.json"
}
```

The index is not a second copy of the answer or clue text.

## Create a new daily puzzle

For `2026-10-08`:

1. Add the answer and status to `schedule/2026.json`.
2. Add exactly five clues to `clues/2026.json` under `2026-10-08`.
3. Add the date to `index.json` with the matching schedule/clue paths.
4. Start with `"status": "draft"`.
5. Change the status to `"published"` only when the puzzle is ready for normal play.

The answer should exist in both vocabulary files used by Game 1.

## Statuses

- `draft`
- `published`
- `unpublished`
- `archived`

Status belongs to the scheduled daily puzzle, not an individual clue.

Only `published` puzzles are selected for normal Game 1 play.

## Synchronization

The puzzle service uses the date as the synchronization key:

```
schedule/2026.json
        │
        │  date = 2026-10-08
        ├──────────────┐
        │              │
        ▼              ▼
   answer/status     five clues
        │              │
        └──────┬───────┘
               ▼
       complete Game 1 puzzle
```

Game 1 receives the same complete puzzle object it used before this storage change.

The UI and game logic never read schedule/clue files directly.

## Validation rules

A scheduled date is not usable if:

- its answer is missing or malformed;
- the answer is not in Game 1's valid vocabulary and curated answer pool;
- its clue record is missing;
- its clue record has the wrong puzzle ID/date;
- it does not contain exactly five non-empty clues;
- its date/game metadata is malformed;
- the index creates an ambiguous duplicate date.

The service fails clearly instead of silently choosing a different answer or clue set.

## Static-site privacy limitation

This remains a public static-site architecture. Anyone who can inspect the repository can see draft and unreleased answer/clue data.

Status controls normal gameplay selection; it is not a security boundary.

Before production, unreleased puzzle data should move behind a private backend/database.

## Future admin

The split data model is designed to support a future private workflow:

```
Create Puzzle
    ↓
Select date
    ↓
Select answer
    ↓
Enter 5 clues
    ↓
Save draft
    ↓
Preview
    ↓
Publish
```

No admin dashboard is being built as part of this change.
