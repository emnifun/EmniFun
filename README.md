# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform built with simple HTML, CSS, and JavaScript modules.

## Current phase: Game 1 data-driven prototype

Game 1 is playable and its content is now data-driven. Game 2 and Game 3 remain independent Coming Soon placeholders.

## Where Game 1 data lives

- data/game1/valid-guesses.json - comprehensive accepted five-letter guess vocabulary.
- data/game1/answers.json - smaller set of words allowed to become puzzle answers.
- data/game1/puzzles.json - dated puzzle records containing the answer, five clues, and publication status.
- js/services/puzzle-service.js - loads the JSON files once, selects the published puzzle for a date, and validates puzzle records.
- js/games/game1/game1-logic.js - gameplay rules. It does not contain the puzzle answer or word list.
- js/games/game1/game1-ui.js - displays the current puzzle supplied by the data/service layer.
- scripts/generate-game1-vocabulary.mjs - rebuilds the generated five-letter vocabulary from the selected lexical sources.

## How to add tomorrow's puzzle

1. Open data/game1/puzzles.json.
2. Add a new object inside the puzzles array.
3. Give it a unique id such as game1-2026-10-08.
4. Set game to game1.
5. Set the date in YYYY-MM-DD format.
6. Enter a five-letter answer that exists in answers.json and valid-guesses.json.
7. Enter exactly five clue strings.
8. Set status to published when the puzzle is ready for that date.
9. Commit and push the JSON change to GitHub.

You do not need to edit game1-ui.js, game1-logic.js, app.js, HTML, or CSS to change a daily puzzle.

## Puzzle status

Supported values are draft, scheduled, published, and archived. Normal gameplay selects only a Game 1 record whose date matches the requested date and whose status is published.

## Word validation

Player input is normalized to uppercase, restricted to A-Z, limited to five letters, and checked against a Set built once from valid-guesses.json. Invalid words do not consume an attempt.

## Comprehensive word vocabulary

Game 1 no longer uses a small Wordle-sized vocabulary. The generated accepted vocabulary currently contains 16,371 unique five-letter entries from two independent lexical sources: Moby Words II and the Wordnik Wordlist.

There is no artificial numerical maximum. The final size is determined by the selected sources and the documented filtering rules. The project does not intentionally stop at 10,000, 15,000, 20,000, or any other fixed number.

The generator is scripts/generate-game1-vocabulary.mjs. It normalizes source entries, keeps exactly five ASCII letters, deduplicates them, and applies source-aware filtering for names, places, abbreviations, and acronyms. Legitimate uncommon, archaic, variant, and inflected words are retained when supported by the selected lexical sources.

The final data file is bundled locally, so the game itself works without a dictionary API or network lookup. The accepted guess vocabulary remains separate from answers.json, which is a much smaller curated answer pool.

To refresh the vocabulary, run:

    node scripts/generate-game1-vocabulary.mjs

Then review the generated diff and commit data/game1/valid-guesses.json.

## Important static-site limitation

This is still a static-site prototype. Any JSON shipped to the browser can be inspected by a user, so draft, scheduled, and future puzzle answers in puzzles.json are not truly private. Status filtering is an application rule, not a security boundary. A future backend should keep unpublished puzzle data server-side.

## Game 1 gameplay architecture

Website UI -> Game 1 UI -> Game 1 Logic -> Puzzle/Data Service -> Local JSON

The same service boundary can later be changed to call a backend API without moving database code into the game UI.

## Statistics

Game 1 statistics remain prototype in-memory values. No persistent account or streak database was added in this task.

## What remains postponed

Production backend, database, persistent statistics, user authentication, administrator authentication, full admin dashboard, production puzzle scheduling, leaderboards, multiplayer, payments, advertisements, Game 2, Game 3, and the final visual redesign are not implemented.

## Running the site

Because JavaScript modules are used, run the site through a local web server:

    python -m http.server 8000

Then open http://localhost:8000.

## Future secrets

Never put passwords, API keys, database credentials, or other secrets into frontend source files or the repository.
