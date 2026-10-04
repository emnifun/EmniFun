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

EmniFun account authentication uses Google Identity Services with the Google
ID token verified server-side by the Cloudflare Worker. The permanent backend
identity is the internal EmniFeed ID; users do not enter or see it. A permanent
user-chosen Gamer Tag is required for account creation and is the user-facing
identifier used together with one recovery key during recovery.

Recovery keys are 16-character cryptographically random alphanumeric values.
The Worker stores only a keyed validation hash plus authenticated encrypted
material protected by the Cloudflare Worker Secret RECOVERY_VAULT_SECRET.
The browser receives plaintext keys only through the authenticated Vault while
the configured per-key viewing period remains active. Viewing expiry does not
invalidate the key. Successful recovery consumes only the used key slot and
rotates that slot; the unused key remains valid.

Required Worker configuration:

- Worker Secret: RECOVERY_VAULT_SECRET
- Nonsecret var: GOOGLE_CLIENT_ID
- Nonsecret var: AUTH_ALLOWED_ORIGIN
- Nonsecret var: RECOVERY_KEY_VISIBILITY_SECONDS (must be configured before deployment; the business duration is intentionally not hardcoded)
- Nonsecret var: RECOVERY_VAULT_SECRET_VERSION (current vault cryptographic secret version, starting at 1)
- Rate limiting bindings: AUTH_RATE_LIMITER, AUTH_CHALLENGE_RATE_LIMITER, RECOVERY_RATE_LIMITER
- Cron Trigger: 15 * * * * (UTC) for auth/session cleanup

Current cross-site frontend/API session cookies use SameSite=None; Secure; HttpOnly; Partitioned. A future same-site custom domain can switch the cookie policy without changing the permanent account identity model.

