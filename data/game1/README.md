# Game 1 data

This folder contains the local data used by the Game 1 prototype.

## valid-guesses.json

This is the comprehensive player guess vocabulary.

The current generated dataset contains 16,371 unique five-letter A-Z entries. There is no artificial maximum or fixed target such as 10,000, 15,000, or 20,000 words. The size is simply the result of the selected lexical sources and the documented filtering pipeline.

### Sources

Moby Words II

- Repository: https://github.com/fordsfords/moby_words_2
- Input: single.txt
- License: the original Moby content was released to the public domain; the mirror documents its modifications as CC0 1.0.
- The source documentation describes single.txt as a large single-word collection excluding proper names, acronyms, and compound words or phrases, while retaining archaic words and significant variant spellings.

Wordnik Wordlist

- Repository: https://github.com/wordnik/wordlist
- Input: wordlist-20210729.txt
- License: MIT
- The repository describes the list as an open-source English wordlist for game developers and others who need English words commonly used in word games.

The two sources are combined automatically rather than manually typing thousands of words.

### Filtering

The generator:

1. normalizes entries to lowercase;
2. keeps only exactly five ASCII letters A-Z;
3. deduplicates the combined vocabulary;
4. uses Moby's names, places, and acronym/abbreviation side lists to remove source-flagged entries that are not independently supported by the other lexical source;
5. preserves uncommon, archaic, variant, and legitimate inflected forms when they are supported by the selected lexical sources;
6. does not impose a numerical cap.

The goal is to distinguish a rare English word from an obvious source-marked name, place, acronym, or abbreviation rather than deleting words merely because they are uncommon.

## answers.json

This is a much smaller curated answer pool. A word can be a valid guess without being eligible as an answer.

## puzzles.json

This contains the actual daily puzzle records. Each record has an id, game, date, answer, five clues, and status.

Supported status values are: draft, scheduled, published, archived.

The public game selects only the published Game 1 puzzle for the requested date.

## Regenerating the vocabulary

From the repository root, run:

    node scripts/generate-game1-vocabulary.mjs

The script downloads the selected source lists, applies the same filtering rules used to create the checked-in dataset, and rewrites data/game1/valid-guesses.json.

The game does not run this script. Runtime still loads only the generated local JSON.

## How to add tomorrow's puzzle

1. Open data/game1/puzzles.json.
2. Add a new object inside the puzzles array.
3. Give it a unique id such as game1-2026-10-08.
4. Set the game to game1.
5. Set the correct date in YYYY-MM-DD format.
6. Put the five-letter answer in answer. It must also exist in answers.json.
7. Add exactly five clues to the clues array.
8. Set status to published when it is ready for that date.
9. Commit and push the JSON file to GitHub.

You do not need to edit game1-ui.js, game1-logic.js, app.js, HTML, or CSS to change a daily puzzle.

## Static-site limitation

This prototype is served from static files. A browser can inspect any JSON shipped with the site, so draft, scheduled, and future puzzle answers are not truly private here. Status filtering is for application behavior and organization, not security. A future backend should keep unpublished puzzle data off the public site.
