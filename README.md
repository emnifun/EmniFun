# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform built with simple HTML, CSS, and JavaScript modules.

## Current phase: FiveWink data-driven prototype

FiveWink is playable and its content is data-driven. Game 2 and Game 3 remain independent Coming Soon placeholders.

## FiveWink data architecture

The project deliberately separates three different concepts:

```
data/game1/
├── vocabulary/
│   ├── valid-guesses.json
│   └── answers.json
│
└── puzzles/
    ├── index.json
    ├── README.md
    └── YYYY/
        └── YYYY-MM-DD.json
```

- `data/game1/vocabulary/valid-guesses.json` — comprehensive accepted five-letter guess vocabulary.
- `data/game1/vocabulary/answers.json` — separately curated answer candidates.
- `data/game1/puzzles/YYYY/YYYY-MM-DD.json` — one actual daily puzzle that you create.
- `data/game1/puzzles/index.json` — small archive manifest used to locate date files.
- `data/game1/puzzles/README.md` — beginner-friendly puzzle creation instructions.
- `js/services/puzzle-service.js` — the data/service boundary used by FiveWink.
- `js/games/game1/game1-logic.js` — gameplay rules; it does not know where puzzle data is stored.
- `js/games/game1/game1-ui.js` — current FiveWink presentation.
- `scripts/generate-game1-vocabulary.mjs` — deterministic vocabulary-generation pipeline.

FiveWink UI does not read puzzle JSON directly.

## Comprehensive five-letter vocabulary

FiveWink does not use a small Wordle-sized vocabulary. The checked-in accepted-guess dataset currently contains 16,273 unique five-letter A-Z entries after deterministic source and quality filtering.

There is deliberately no artificial maximum and no target such as 10,000, 15,000, 20,000, 40,000, or 50,000 words. If the selected high-quality sources contain more legitimate five-letter English words after filtering, the generator can include them. The final size is determined by source coverage and lexical quality rules.

The answer pool remains separate: it currently contains about 182 curated candidate answers. Those candidates are not automatically scheduled as daily puzzles.

## Daily puzzle archive

The actual daily puzzle is stored independently from the answer pool.

For example:

`data/game1/puzzles/2026/2026-10-08.json`

contains:

- the date;
- the FiveWink id;
- the answer;
- exactly five clues;
- the publication status.

Start new puzzles as `draft`. Change to `published` only when ready.

Supported statuses are `draft`, `published`, `unpublished`, and `archived`.

The public game asks the puzzle service for today's date and only accepts a `published` FiveWink puzzle for that exact date. It never cycles through the 182 answer candidates and never falls back to another date.

## How to add tomorrow's puzzle

1. Create `data/game1/puzzles/YYYY/YYYY-MM-DD.json`.
2. Set the id to `game1-YYYY-MM-DD`.
3. Set `game` to `game1`.
4. Set the date in `YYYY-MM-DD`.
5. Choose the answer from `data/game1/vocabulary/answers.json`.
6. Enter exactly five clues.
7. Start with `"status": "draft"`.
8. Add the file's id/date/path to `data/game1/puzzles/index.json`.
9. Preview/test it.
10. Change the status to `"published"` when it is ready.

You do not need to edit the FiveWink UI or game rules to create a new puzzle.

To take a published puzzle offline, change its status to `unpublished`. To retain it as historical data, change it to `archived`.

## Publication safety

For one FiveWink date, there should be zero or one published puzzle. The puzzle service checks the matching date files and throws a clear data error when multiple published records are present instead of silently choosing one.

If no puzzle exists for today's date, or the date exists only as draft/unpublished/archived, the game shows an unavailable state. It does not use yesterday's puzzle, tomorrow's puzzle, APPLE, or an invented puzzle.

## Important static-site limitation

This prototype ships puzzle JSON from a public GitHub repository to the browser. Users can inspect files in the repository, so draft, unpublished, and future puzzle answers are not truly private.

Status is therefore a **gameplay selection rule**, not a security boundary.

Before production, unreleased puzzles should live in a private backend/database. The public frontend should receive only the currently published puzzle.

## Backend and admin compatibility

The service boundary is intentionally stable:

```
Today:
FiveWink → Puzzle Service → Local JSON

Later:
FiveWink → Puzzle Service → Backend API → Database
                              ↑
                       Admin Dashboard
```

FiveWink continues asking the service for its current puzzle. The UI and core game logic do not need to know whether the answer came from JSON, an API, or a database.

The puzzle JSON record is already the conceptual entity that a future admin dashboard can create, edit, publish, unpublish, archive, search, and filter. No production admin system is implemented in this phase.

Game 2 and Game 3 remain independent. They can later have completely different puzzle structures and data stores.

## Refreshing the vocabulary

From the repository root:

```
node scripts/generate-game1-vocabulary.mjs
```

The generator writes:

`data/game1/vocabulary/valid-guesses.json`

The browser never calls the source dictionaries at runtime. It only uses the generated local file.

## Running the site

Because JavaScript modules are used, run the site through a local web server:

```
python -m http.server 8000
```

Then open:

http://localhost:8000

## Future secrets

Never put passwords, API keys, database credentials, or other secrets into frontend source files or the repository.
