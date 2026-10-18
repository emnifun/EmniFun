# Tests

The FiveWink test set covers the client state layer, the server-side Word/feedback rules, and the backend service boundary.

- `tests/game1-logic.test.js` checks client state transitions, clue/attempt progression, seventh-stage behavior, input sanitizing, and answer-reveal boundaries.
- `tests/worker-game1.test.mjs` checks server-side feedback and duplicate-letter evaluation.
- `tests/game1-data.test.js` checks that the browser-facing puzzle service accepts backend puzzle metadata without an answer and does not fall back to local answer data.
