# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform built with simple HTML, CSS, and JavaScript modules.

## Current phase: FiveWink prototype + Cloudflare backend

FiveWink is playable. Game 2 and Game 3 remain independent Coming Soon placeholders.

FiveWink now uses a Cloudflare Worker and D1 database for private gameplay data.

## FiveWink architecture

```
FiveWink UI
    ↓
Puzzle Service
    ↓
Cloudflare Worker
    ↓
Cloudflare D1
```

The browser receives the current puzzle's ID, date, clues, and signed game-session token.

The answer is not sent to the browser during active play.

The Worker is authoritative for:

- current puzzle selection;
- accepted-guess validation;
- duplicate guesses;
- feedback generation;
- clue/attempt progression;
- seventh-stage progression;
- answer reveal after legitimate game completion.

## Comprehensive five-letter vocabulary

FiveWink does not use a small Wordle-sized vocabulary. The checked-in accepted-guess dataset currently contains 16,273 unique five-letter A-Z entries after deterministic source and quality filtering.

There is deliberately no artificial maximum or fixed target. The generator can include more legitimate five-letter English words when the selected high-quality sources support them.

The public vocabulary is used by the Worker for server-side guess validation. It is not treated as secret data.

Generate it with:

```
node scripts/generate-game1-vocabulary.mjs
```

## Private FiveWink puzzle data

Daily answers, clues, publication status, and active player sessions live in Cloudflare D1.

Private puzzle data must not be placed back into this public repository.

The Worker uses Asia/Kolkata (IST) as the canonical FiveWink daily date.

Only a published puzzle for the current IST date is returned by the public puzzle endpoint.

## Worker

Worker source lives under:

`worker/`

- `worker/index.js` — HTTP API and D1 session handling.
- `worker/game1.js` — server-side FiveWink rules and duplicate-letter evaluation.
- `worker/token.js` — signed session-token handling.
- `worker/schema.sql` — D1 schema.

The existing Cloudflare Worker name is:

`emnifun`

## Backend API

```
GET  /api/fivewink/puzzle
POST /api/fivewink/guess
POST /api/fivewink/clue
POST /api/fivewink/skip
```

The puzzle endpoint never returns the answer.

The answer is returned only after:

- a normal successful solve;
- a submitted seventh guess;
- skipping the seventh guess.

## Client structure

The FiveWink UI continues to use stable service boundaries:

- `js/services/puzzle-service.js` — current puzzle metadata service.
- `js/services/api.js` — backend API client.
- `js/games/game1/game1-logic.js` — client-side UI state helpers only.
- `js/games/game1/game1-ui.js` — presentation and input handling.

The client-side game logic does not evaluate the answer.

## Security notes

Never put passwords, API keys, database credentials, or Worker secrets into frontend source or the public repository.

The Worker uses the `GAME_TOKEN_SECRET` Cloudflare Worker Secret for signed game-session tokens.

The D1 `fivewink_puzzles` table is the private source of truth for answers and clues.

Old Git commits may still contain pre-backend puzzle JSON because that data existed in earlier public commits. This migration removes usable private puzzle data from the current working tree. Purging old history would require a separate history-rewrite operation.

## Running the site

Because JavaScript modules are used, run the site through a local web server:

```
python -m http.server 8000
```

Then open:

```
http://localhost:8000
```

## Testing

The repository includes client-state, server-rule, and backend-service tests under `tests/`.

See `worker/README.md` for Cloudflare setup and D1 configuration.
