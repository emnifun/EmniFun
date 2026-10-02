# Tests

The current test set covers both the Game 1 rules and the data layer.

- tests/game1-logic.test.js checks clue consumption, attempt rules, duplicate-letter feedback, seventh-attempt behavior, input sanitizing, and vocabulary validation.
- tests/game1-data.test.js checks generated vocabulary shape and breadth, representative uncommon words, source-aware exclusions, answer separation, puzzle status filtering, and puzzle validation.

The data test assumes a browser/server test environment with fetch available.
