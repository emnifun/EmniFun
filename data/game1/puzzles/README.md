# Game 1 puzzle archive

This folder contains the **actual Game 1 puzzles** that you create.

The answer candidate pool is stored separately in:

`../vocabulary/answers.json`

That file only says which words are eligible to become answers. It does **not** decide which word is used on which date.

## Folder structure

```
puzzles/
├── index.json
├── README.md
└── YYYY/
    ├── YYYY-MM-DD.json
    └── ...
```

Every puzzle file contains one complete puzzle.

Example:

```json
{
  "id": "game1-2026-10-08",
  "game": "game1",
  "date": "2026-10-08",
  "answer": "APPLE",
  "clues": [
    "Clue 1",
    "Clue 2",
    "Clue 3",
    "Clue 4",
    "Clue 5"
  ],
  "status": "draft"
}
```

## Create a new daily puzzle

Create the file under the year:

`data/game1/puzzles/2026/2026-10-08.json`

Then enter:

- id: `game1-2026-10-08`
- game: `game1`
- date: `2026-10-08`
- answer: one five-letter word from the curated answer pool
- clues: exactly five clue strings
- status: start with `draft`

Then add this file to the small archive index:

```json
{
  "id": "game1-2026-10-08",
  "game": "game1",
  "date": "2026-10-08",
  "path": "2026/2026-10-08.json"
}
```

The index is only a directory manifest. It is not a second copy of the puzzle answer/clues.

## Statuses

`draft` = being prepared

`published` = the official puzzle players can use for that date

`unpublished` = exists, but the public game must not use it

`archived` = historical record kept permanently

Only `published` can be selected by normal Game 1 play.

## Changing status

To publish:

```json
"status": "published"
```

To temporarily take it offline:

```json
"status": "unpublished"
```

To keep it as historical data:

```json
"status": "archived"
```

Do not delete old puzzles just because they are no longer current.

## Safety rules

- Keep the id and filename date aligned.
- Keep the date in YYYY-MM-DD.
- Use exactly five clues.
- Use an answer that exists in both Game 1 vocabulary files.
- Do not create two published puzzles for the same Game 1 date.
- If a conflict is accidentally created, the service fails clearly rather than silently selecting one.

## Preview/testing

The current site loads only the published puzzle for today's date. A draft can be checked by temporarily publishing it in a local/test copy, or by using the data-layer tests before committing.

Remember: a public GitHub repository cannot keep draft answers secret. Status is a gameplay filter, not a security feature.
