# Tests

The current test set covers both the FiveWink rules and the puzzle data layer.

- `tests/game1-logic.test.js` checks clue consumption, attempt rules, duplicate-letter feedback, seventh-attempt behavior, input sanitizing, and vocabulary validation.
- `tests/game1-data.test.js` checks the large local vocabulary, answer separation, date-based puzzle loading, status filtering, missing-date behavior, duplicate published-date protection, and puzzle validation.

The data test assumes a browser/server environment with `fetch` available.
