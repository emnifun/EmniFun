# FiveWink puzzle data

FiveWink uses one separate word file and one separate clue file for every daily puzzle.

Master vocabulary remains separate:

    ../vocabulary/valid-guesses.json
    ../vocabulary/answers.json

## Folder structure

    puzzles/
    ├── Word/
    │   └── 2026/
    │       ├── 2026-10-02.json
    │       ├── 2026-10-03.json
    │       └── ...
    ├── Clue/
    │   └── 2026/
    │       ├── 2026-10-02.json
    │       ├── 2026-10-03.json
    │       └── ...
    ├── index.json
    └── README.md

## One date = one word file + one clue file

For 2026-10-03:

Word file:

    Word/2026/2026-10-03.json

    {
      "id": "game1-2026-10-03",
      "game": "game1",
      "date": "2026-10-03",
      "answer": "HOUSE",
      "status": "published"
    }

Clue file:

    Clue/2026/2026-10-03.json

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

The files are synchronized by date and puzzle ID.
Do not create a yearly file containing all dates.

## Puzzle index

index.json is the manifest only.
Each entry points to exactly one daily word file and one daily clue file.

    {
      "id": "game1-2026-10-03",
      "game": "game1",
      "date": "2026-10-03",
      "wordPath": "Word/2026/2026-10-03.json",
      "cluePath": "Clue/2026/2026-10-03.json"
    }

The index does not contain the answer or clue text.

## Create a new daily puzzle

For 2026-10-08:

1. Create puzzles/Word/2026/2026-10-08.json.
2. Put the answer and status in that file.
3. Create puzzles/Clue/2026/2026-10-08.json.
4. Put exactly five clues in that file.
5. Use the same game, date, and puzzle ID in both files.
6. Add the matching paths to index.json.

The answer must exist in the FiveWink vocabulary/answer-candidate files.
Start with draft and publish only when ready.

## Service synchronization

The data service loads the two date-specific files and combines them into the existing
FiveWink puzzle object. The UI and game logic do not know where the files are stored.

    daily word file
           +
    daily clue file
           ↓
     puzzle service
           ↓
   complete puzzle object
           ↓
        FiveWink

## Validation

The service fails clearly when:

- a word file is missing;
- a clue file is missing;
- dates or game IDs do not match;
- IDs do not match the date;
- the answer is missing, malformed, or absent from the existing FiveWink answer systems;
- there are not exactly five non-empty clues;
- the index contains an ambiguous duplicate date or ID.

It does not silently substitute another date or answer.

## Future years

    Word/2027/2027-01-01.json
    Clue/2027/2027-01-01.json

## Static-site limitation

This remains public static JSON. Draft and unpublished data are not secret.
A future private backend/database can replace the storage implementation.

No admin dashboard, authentication, backend, or database is part of this task.
