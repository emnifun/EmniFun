# FiveWink Cloudflare Worker

This Worker is the authoritative backend for FiveWink gameplay.

## Endpoints

- `GET /api/fivewink/puzzle` — returns today's puzzle ID, date, clues, and a signed game-session token. It never returns the answer.
- `POST /api/fivewink/guess` — validates a five-letter guess, evaluates it against the server-side answer, and advances the server-side session.
- `POST /api/fivewink/clue` — consumes the current clue attempt.
- `POST /api/fivewink/skip` — ends the optional seventh stage as FAILED_HARD and then returns the answer.

## Cloudflare setup

Use the existing Worker:

`emnifun`

Create one D1 database and bind it to the Worker with the variable name:

`DB`

Run `worker/schema.sql` in the D1 SQL console.

Create one Worker Secret:

`GAME_TOKEN_SECRET`

Use a long random value. Never commit this value to GitHub.

## Database contents

The D1 database is the private source of truth for:

- daily FiveWink puzzle answers;
- daily FiveWink clues;
- puzzle publication status;
- active game-session state.

Do not put private answers in this repository.

The accepted guess vocabulary is intentionally still public because it is not a secret; the Worker validates guesses against that vocabulary server-side.

## Daily puzzle rule

The Worker uses Asia/Kolkata (IST) as FiveWink's canonical daily date.

Only the row whose date is today's IST date and whose status is `published` is served by `GET /api/fivewink/puzzle`.

## Security boundary

The browser receives no answer during active play.

The answer can be returned only by a server response that legitimately finishes the current session:

- a normal solve;
- the seventh guess;
- skipping the seventh guess.

The signed token identifies a server-side D1 session. The session row stores the authoritative attempt/guess/clue state, and optimistic version checks prevent stale concurrent requests from branching the same session.

## Important deployment note

The repository does not contain the private D1 puzzle seed data. Create the D1 rows in Cloudflare after creating the database.

Do not add answer JSON files back into this public repository.

Authentication is additive to FiveWink and uses separate account sessions. The
existing FiveWink GAME_TOKEN_SECRET and signed game token remain dedicated to
FiveWink gameplay.

The Worker requires RECOVERY_VAULT_SECRET as a Cloudflare Worker Secret.
Set GOOGLE_CLIENT_ID, AUTH_ALLOWED_ORIGIN, and the configurable auth TTL/cooldown
settings as nonsecret Worker variables. RECOVERY_KEY_VISIBILITY_SECONDS must be
explicitly configured before authentication can serve requests; its exact business
duration is intentionally not hardcoded in source. The Rate Limiting bindings
AUTH_RATE_LIMITER, AUTH_CHALLENGE_RATE_LIMITER, and RECOVERY_RATE_LIMITER are
required for authentication endpoints; the Worker fails closed if a binding is absent.

No production account rows are seeded by the repository. Apply the auth D1
migration separately before deployment.

