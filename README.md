# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform built with simple HTML, CSS, and JavaScript modules.

## Current phase: Game 1 data-driven prototype

Game 1 is playable and its content is data-driven. Game 2 and Game 3 remain independent Coming Soon placeholders.

## Game 1 data architecture

- data/game1/valid-guesses.json - comprehensive accepted five-letter guess vocabulary.
- data/game1/answers.json - separately curated words that may be selected as daily answers.
- data/game1/puzzles.json - dated puzzle records containing the answer, five clues, and publication status.
- js/services/puzzle-service.js - loads the JSON files and builds the vocabulary Set used by gameplay.
- js/games/game1/game1-logic.js - gameplay rules; it does not contain the vocabulary or puzzle answer list.
- js/games/game1/game1-ui.js - UI for the current puzzle.
- scripts/generate-game1-vocabulary.mjs - deterministic vocabulary-generation pipeline.

## Comprehensive five-letter vocabulary

Game 1 does not use a small Wordle-sized vocabulary. The checked-in accepted-guess dataset currently contains 16,273 unique five-letter A-Z entries after deterministic source and quality filtering.

There is deliberately no artificial maximum and no target such as 10,000, 15,000, 20,000, 40,000, or 50,000 words. If the selected high-quality sources contain more legitimate five-letter English words after filtering, the generator can include them. The final size is determined by source coverage and lexical quality rules.

### Selected lexical sources

Moby Words II supplies the broad base. Its single-word collection is intended to exclude proper names, acronyms, and compound words while retaining archaic words and significant variants. Its crossword files add established word-game vocabulary, including inflected forms.

Wordnik's open wordlist is used as an independent supplementary lexical source.

Moby's names, places, acronyms/abbreviations, and common-word lists are classification/corroboration inputs. They are not blindly merged into the accepted vocabulary.

### Filtering policy

The generator automatically:

1. normalizes entries to lowercase;
2. keeps exactly five ASCII alphabetic letters A-Z;
3. deduplicates all selected source candidates;
4. excludes source-flagged proper names, places, acronyms, and abbreviations unless established Moby crossword vocabulary independently supports the lexicalized English word;
5. removes only unmistakable malformed or short-form-like Moby artifacts when they also lack independent lexical corroboration;
6. preserves uncommon, archaic, variant, and legitimate inflected words supported by the selected sources;
7. never applies a numerical vocabulary cap.

The aim is to distinguish a rare English word from an obvious non-word, code, abbreviation, or source-marked proper name. Being uncommon by itself is not a reason to remove a word.

## Keep answers separate

valid-guesses.json is the comprehensive accepted-guess vocabulary.

answers.json is a smaller curated subset of suitable daily-answer words. A word can therefore be a valid guess without ever being selected as a daily answer.

The daily puzzle system remains independent from vocabulary size.

## Refreshing the vocabulary

From the repository root, run:

    node scripts/generate-game1-vocabulary.mjs

The script downloads the selected source lists, applies deterministic filtering, and rewrites data/game1/valid-guesses.json.

The browser never calls a dictionary API at runtime. It loads the generated local JSON and converts accepted words to a Set for membership checks.

After regeneration, review the generated diff and run the data tests before committing.

## How to add tomorrow's puzzle

1. Open data/game1/puzzles.json.
2. Add a new object inside the puzzles array.
3. Give it a unique id such as game1-2026-10-08.
4. Set game to game1.
5. Set the date in YYYY-MM-DD format.
6. Enter a five-letter answer that exists in answers.json and valid-guesses.json.
7. Enter exactly five clue strings.
8. Set status to published when it is ready for that date.
9. Commit and push the JSON change.

You do not need to edit the Game 1 UI or logic files to change a daily puzzle.

## Important static-site limitation

This prototype ships puzzle JSON to the browser. Users can inspect any shipped JSON, so draft, scheduled, and future puzzle answers stored in puzzles.json are not truly private. Status filtering is an application rule, not a security boundary. A future backend should keep unpublished puzzle data server-side.

## Running the site

Because JavaScript modules are used, run the site through a local web server:

    python -m http.server 8000

Then open http://localhost:8000.

## Future secrets

Never put passwords, API keys, database credentials, or other secrets into frontend source files or the repository.
