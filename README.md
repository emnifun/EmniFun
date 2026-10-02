# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform. The project uses simple HTML, CSS, and JavaScript modules so that individual games can grow without becoming one giant application.

## Current phase: Game 1 functional prototype

The original Phase 1 shell remains in place. Game 1 now has a playable local prototype while Game 2 and Game 3 remain Coming Soon.

## Game 1 rules

- The answer has 5 letters.
- There are exactly 6 normal attempts.
- Attempts 1-5 can be used either for a guess or that attempt's clue.
- Attempt 6 is guess-only.
- There are exactly 5 clues, one for each of attempts 1-5.
- Using a clue consumes that attempt.
- Guessing on attempts 1-5 skips that attempt's clue opportunity.
- An invalid word does not consume an attempt.
- Valid guesses receive positional feedback: correct position, wrong position, or absent.
- Duplicate letters are handled with a two-pass evaluation so occurrences are counted correctly.
- Solving on attempts 1-6 produces SOLVED.
- After an incorrect sixth guess, a special optional seventh guess appears.
- The seventh guess never counts as a solve, even when it exactly matches the answer.
- Skipping the seventh guess produces FAILED_HARD.
- A seventh guess produces FAILED_CLOSE or FAILED_HARD using a temporary configurable closeness rule.
- The answer is shown after either failure state.
- See Why becomes available only after the game has ended.

## Seventh-attempt closeness rule

The exact definition of close has not been finalized.

The prototype currently uses seventhAttemptMinimumCorrectPositions = 2 in js/games/game1/game1-logic.js.

That means a seventh guess is FAILED_CLOSE when it has at least 2 correctly positioned letters; otherwise it is FAILED_HARD.

This is TEMPORARY / CONFIGURABLE. The final formula can be changed in evaluateSeventhAttempt() without rewriting the rest of the game.

## Puzzle data separation

The puzzle is stored as a data record containing date, game, answer, five clues, and status.

VALID_GUESS_WORDS contains words players may submit. ANSWER_WORDS contains words that may be selected as answers. They are separate so the lists can evolve independently.

The current prototype uses a small local list because there is no backend yet. The future API service can provide the same puzzle shape without putting database code in the game UI.

## Statistics

Game 1 currently tracks Current Streak, Maximum Streak, Total Games, Solved, Failed - Close, Failed - Hard, Average Guesses, and Clues Used.

A solved game increases the current streak and can increase the maximum streak. Either failure result resets the current streak. Prototype statistics are stored only in browser memory, so they are not permanent yet.

## Player history

At completion, Game 1 creates a record containing puzzleDate, game, result, attemptsUsed, cluesUsed, and seventhGuessUsed. The API layer currently treats this as a future backend payload and does not persist it.

## What is intentionally postponed

Production backend, database, permanent statistics storage, secure user authentication, administrator authentication, full admin dashboard, production puzzle archive, scheduling/publishing backend, Google login, OTP/email authentication, leaderboards, multiplayer, payments, advertisements, Game 2 implementation, Game 3 implementation, and the final visual redesign are intentionally not implemented.

## Important files

- index.html - website shell.
- css/style.css - site and temporary Game 1 styling.
- js/app.js - connects navigation to independent game modules.
- js/games/game1/game1-ui.js - board, clues, keyboard, result and See Why UI.
- js/games/game1/game1-logic.js - Game 1 rules and state transitions.
- js/games/game1/game1-data.js - puzzle data and separate word lists.
- js/services/api.js - future backend/API boundary.
- js/statistics/statistics.js - per-game statistics boundary.

## Running the site

Because the site uses JavaScript modules, serve it from a local web server instead of opening the HTML with a file:// URL.

python -m http.server 8000

Then open http://localhost:8000.

## Future secrets

Never put administrator passwords, user passwords, database credentials, API keys, or other secrets in frontend source files or the repository. Production authentication and secrets belong on the backend or platform secret store.