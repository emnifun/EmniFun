# Game 1 data

This folder contains the local data used by the Game 1 prototype.

## valid-guesses.json

This is the comprehensive accepted player-guess vocabulary.

Current generated size: 16,273 unique five-letter A-Z entries. There is no artificial maximum and no fixed target size.

The generator combines selected high-quality lexical sources and filters obvious source-marked non-standard entries. It does not manually type the vocabulary.

### Sources

Moby Words II

- single_5az.txt - broad five-letter single-word base.
- crosswd.txt and crswd-d.txt - supplementary established crossword vocabulary, including legitimate inflected forms.
- names.txt and places.txt - source classification lists for proper-name/place filtering.
- acronyms.txt - source classification for acronyms and abbreviations.
- common.txt - corroboration source for obvious malformed or short-form-like entries.
- Repository: https://github.com/fordsfords/moby_words_2

Wordnik Wordlist

- wordlist-20210729.txt - independent supplementary English wordlist.
- Repository: https://github.com/wordnik/wordlist

### Filtering

1. Normalize entries to lowercase.
2. Keep exactly five ASCII letters A-Z.
3. Deduplicate the combined candidate set.
4. Exclude source-flagged proper names, places, acronyms, and abbreviations unless established Moby crossword vocabulary independently supports the lexicalized English word.
5. Remove only unmistakable malformed or short-form-like Moby entries when they also lack independent lexical corroboration.
6. Preserve legitimate uncommon, archaic, variant, and inflected English words when the selected sources support them.
7. Never cap the vocabulary by a target number.

## answers.json

This is the separate curated daily-answer pool. Every answer must also exist in valid-guesses.json.

A rare legitimate word may be accepted as a guess without being eligible for daily selection.

## puzzles.json

This contains the dated puzzle records. Each record includes an id, game, date, answer, five clues, and status.

Supported status values are draft, scheduled, published, and archived.

The public game selects only the published Game 1 puzzle for the requested date.

## Regenerating the vocabulary

From the repository root:

    node scripts/generate-game1-vocabulary.mjs

The browser does not run this generator. It only loads the generated local JSON.

## Static-site limitation

Because the prototype ships puzzles.json to the browser, future puzzle answers are not secret. Backend storage should be introduced before production if unreleased puzzle answers must remain private.
