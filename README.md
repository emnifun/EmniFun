# EmniFun

EmniFun is a beginner-friendly web puzzle platform built with vanilla HTML, modern CSS, and native JavaScript ES modules. It features original daily word and logic puzzles, persistent accounts, an encrypted recovery vault, an administrative portal, and a serverless backend powered by Cloudflare Workers and Cloudflare D1.

---

## Table of Contents

- [Project Status](#project-status)
- [Architecture Overview](#architecture-overview)
- [FiveWink (Game 1)](#fivewink-game-1)
  - [Gameplay Mechanics](#gameplay-mechanics)
  - [Hard Mode: Strict](#hard-mode-strict)
  - [Validation Priority Rules](#validation-priority-rules)
  - [Mode Locking & Clue Rules](#mode-locking--clue-rules)
  - [Play Limit & Account Tracking](#play-limit--account-tracking)
- [User Accounts & Recovery Vault](#user-accounts--recovery-vault)
  - [Authentication Flow](#authentication-flow)
  - [Encrypted Recovery Vault](#encrypted-recovery-vault)
  - [Session Security & Cookies](#session-security--cookies)
- [Admin Panel Portal](#admin-panel-portal)
- [Clean Path Routing & Directory Structure](#clean-path-routing--directory-structure)
- [Cloudflare Worker & Backend API](#cloudflare-worker--backend-api)
  - [API Endpoints](#api-endpoints)
  - [Asia/Kolkata (IST) Canonical Scheduling](#asiakolkata-ist-canonical-scheduling)
  - [Scheduled Cron Jobs](#scheduled-cron-jobs)
- [Database Schema & Migrations](#database-schema--migrations)
- [Five-Letter Vocabulary](#five-letter-vocabulary)
- [Security Model](#security-model)
- [Local Development](#local-development)
- [Running Automated Tests](#running-automated-tests)
- [Deployment Workflow](#deployment-workflow)
- [Roadmap & Planned Features](#roadmap--planned-features)

---

## Project Status

- **FiveWink (Game 1):** Fully implemented and playable. Features daily published puzzles, clue assistance, an optional 7th-guess stage, play tracking, session restoration, and two playable modes: **Standard** and **Hard Mode: Strict**.
- **Game 2 & Game 3:** Independent placeholders marked as **Coming Soon**.
- **User Accounts:** Live with Google Identity Services (One Tap and Sign-In button), Gamer Tag customization, and an encrypted 2-slot emergency recovery key vault.
- **Admin Panel:** Live with secure backend authorization, puzzle scheduling, vocabulary validation, and draft/published/archived lifecycle management.
- **Platform Infrastructure:** Static frontend hosted on GitHub Pages; backend API hosted on Cloudflare Workers (`emnifun.workers.dev`) backed by Cloudflare D1 (SQLite).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Client                        │
│  (Static GitHub Pages: HTML5, CSS3, Vanilla ES Modules)     │
└──────────────┬───────────────────────────────▲──────────────┘
               │                               │
    HTTP Requests with CORS         Signed Game Tokens &
    and Partitioned Cookies         HttpOnly Session Cookies
               │                               │
┌──────────────▼───────────────────────────────┴──────────────┐
│                  Cloudflare Worker (emnifun)                │
│    • Public Gameplay API (/api/fivewink/*)                  │
│    • Authentication & Vault API (/api/auth/*)               │
│    • Admin Portal API (/api/admin/*)                        │
│    • Asia/Kolkata (IST) Date Engine & Cron Triggers         │
│    • Authoritative Guess Evaluator & Mode Lock Engine       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Prepared SQL Queries & Bindings
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Cloudflare D1 (emnifun-db)               │
│    • fivewink_puzzles (Private answers & clues)             │
│    • fivewink_sessions (Active & finished gameplay state)   │
│    • fivewink_plays (Authenticated 1-play uniqueness records)│
│    • accounts, auth_sessions, recovery_keys (Identity data) │
└─────────────────────────────────────────────────────────────┘
```

The browser **never receives the secret answer** during active play. The Worker authoritatively validates guesses, checks constraints, generates feedback, updates attempt state, and only reveals the answer upon legitimate puzzle completion.

---

## FiveWink (Game 1)

FiveWink is an original five-letter daily word deduction puzzle.

### Gameplay Mechanics

- **6 Normal Attempts:** Players submit five-letter guesses. Letters are evaluated as:
  - **Blue ("correct"):** The letter is in the target word and in the correct position.
  - **Orange ("wrong-position"):** The letter is in the target word but in a different position.
  - **Gray ("wrong"):** The letter does not appear in the target word (or extra duplicates do not appear).
- **Clue Assistance (Standard Mode):** Up to 5 progressive hints can be used instead of taking a normal guess. Using a clue consumes one of the 6 attempts.
- **Optional 7th Guess Stage:** If a player uses all 6 normal attempts without solving the puzzle, they enter the 7th-guess stage. Taking a 7th guess or skipping it concludes the puzzle.
- **Answer Secrecy:** The secret answer is returned to the client only after a solve, a submitted 7th guess, or an explicit skip.

---

### Hard Mode: Strict

FiveWink includes a challenging **Hard Mode: Strict** option (`hard1`). Players can select their game mode before taking any gameplay action using the header mode bulb button (`#game1-mode-btn`).

#### Validation Priority Rules

Hard Mode: Strict evaluates every submitted guess against a deterministic validation hierarchy. When a guess contains multiple violations across accumulated feedback, **exactly one error is displayed: the violation corresponding to the highest-priority category**.

1. **Format Validation:** Must be a valid 5-letter uppercase alphabetical string. Rejects format or length violations immediately (`"Not a valid word."`).
2. **Duplicate-Guess Validation:** Cannot repeat any guess already submitted in previous rows or the 7th guess. Always takes precedence over dictionary and constraint violations (`"Already guessed! Try another."`).
3. **Dictionary / Vocabulary Validation:** The guess must exist in the authoritative 16,273-word vocabulary list. Non-words are rejected before evaluating any Strict Mode constraints (`"Not a valid word."`).
4. **Blue Fixed-Position Constraints:** Any position confirmed Blue (`"correct"`) in any earlier guess must contain that exact letter in every subsequent guess (`"Position {pos} must be {letter}."`).
5. **Orange Forbidden-Position Constraints:** A letter confirmed Orange (`"wrong-position"`) in any earlier guess cannot be placed in the same position where it was confirmed Orange (`"Letter {letter} cannot be in position {pos}."`).
6. **Required Letters & Multiplicity Counts:** Any letter confirmed Blue or Orange must be included in future guesses, matching or exceeding confirmed duplicate counts (`"Guess must contain {letter}."` or `"Guess must contain at least {count} of letter {letter}."`).

#### Deterministic Multi-Row Positional Ordering

Constraints accumulated across multiple previous rows are evaluated holistically rather than by row discovery order:

- **Category Precedence:** Higher-priority categories always outrank lower-priority categories regardless of when constraints were discovered. A Blue constraint discovered in Row 6 outranks an Orange constraint discovered in Row 2; an Orange constraint discovered in Row 4 outranks a letter-count constraint discovered in Row 1.
- **Lowest Position Index Wins:** Within Blue or Orange constraints, violations are evaluated from leftmost to rightmost position (`pos = 1..5`). The lowest position index is reported first deterministically across all accumulated rows (e.g., if Row 1 established a constraint on Position 4 and Row 2 established a constraint on Position 1, a guess violating both reports the Position 1 error first).

#### State Immutability & UI Behavior

- **Zero Attempt Consumption:** Rejected guesses do not consume normal attempts, do not advance the active row, and do not mutate session state (`version`, `attempts_json`, or `guesses_json` in D1).
- **Preserved UI Experience:** On duplicate guess rejections, the current input is cleared and the notification is displayed. On format, vocabulary, or constraint rejections, the candidate word remains in the active tiles so the player can easily edit their guess.
- **Authoritative Server Enforcement:** Guess validation is performed authoritatively by the Cloudflare Worker in `handleGuess` ([`worker/game1.js`](worker/game1.js)), with mirrored logic in [`js/games/game1/game1-logic.js`](js/games/game1/game1-logic.js).

---

### Mode Locking & Clue Rules

- **Clues Disabled:** In Hard Mode: Strict, clues are completely disabled and unavailable. The clue panel displays a disabled notice, and the backend returns `400 Bad Request` if a clue is requested.
- **Atomic Mode Locking:** Game mode is locked as soon as the first state-changing action occurs (first accepted guess, clue use, or attempt skip). Once locked, neither the UI nor direct API calls to `POST /api/fivewink/mode` can alter the mode.
- **Upcoming Modes:** The mode dialog displays placeholders for **Hard Mode: Mindbender** (`hard2`) and **Hard Mode: Expert** (`hard3`) marked as **Coming Soon**. The Worker strictly rejects requests for placeholder modes.
- **Default Preference:** Players can check *"Use this mode by default for future puzzles"* to remember their preference across sessions in browser `localStorage`.
- **Token Synchronization:** When switching modes prior to the first action, the backend issues an updated HMAC token to preserve optimistic versioning.

---

### Play Limit & Account Tracking

- **Guest Users:** Can create unlimited sessions and replay puzzles freely.
- **Authenticated Accounts:** Enforce **one play per published puzzle**.
  - When an authenticated user starts a puzzle, a row is inserted into `fivewink_plays` with primary key `(emnifeed_id, puzzle_id)`.
  - If a player leaves an unfinished game and returns, their active session is resumed with full guess evaluations preserved.
  - If a player finishes a puzzle, subsequent requests return `alreadyPlayed: true` (HTTP 403) with the completed game board and answer revealed.
  - Concurrent play requests are handled atomically at the database constraint level.

---

## User Accounts & Recovery Vault

EmniFun features an account system designed for privacy, cross-device portability, and account recovery.

### Authentication Flow

1. **Permanent Backend Identity:** Every account is identified by a unique, backend-generated **EmniFeed ID** (8+ alphanumeric characters).
2. **Google Identity Services (GIS):** Users authenticate via Google One Tap or the Google Sign-In button. The backend verifies the credential token and maps the Google Subject ID (`sub`) to the account in `google_identities`.
3. **Custom Gamer Tag:** Upon first registration, users choose a user-facing Gamer Tag. Uniqueness is enforced case-insensitively via `gamer_tag_key`.
4. **Session Cookie:** The Worker sets an HTTP-only cookie named `__Host-emnifun_session` configured with `Secure`, `SameSite=None`, and `Partitioned` (CHIPS) for cross-site compatibility.

### Encrypted Recovery Vault

To ensure accounts can be recovered if a linked Google identity is lost, EmniFun provides a client-viewable Recovery Vault:

- **Two Recovery Key Slots:** Each account possesses up to two 16-character random alphanumeric recovery keys.
- **Authenticated Encryption:** Recovery keys are encrypted at rest using **AES-GCM (256-bit)** with unique IVs. Key hashes are derived using keyed HMAC-SHA256 (`TOKEN_PEPPER`).
- **Temporary Client Visibility:** Newly generated recovery keys are viewable in the UI only for 48 hours. After 48 hours, the unencrypted key cannot be retrieved.
- **Anti-Replay & Cooldown Guards:** Used keys and challenge nonces are tracked in `recovery_key_consumptions` and `auth_challenge_consumptions`. Modifying a linked Google identity triggers a 30-day cooldown.

---

## Admin Panel Portal

The EmniFun administration portal allows authorized personnel to manage the puzzle pipeline without code deployments.

- **Portal Access:** Central portal at `/admin/` and dedicated FiveWink manager at `/admin/FiveWink/`.
- **Access Control:** Anyone can view the static admin page, but all API operations require an authenticated account with `is_admin = 1` in the database. Unauthorized requests receive `401 Unauthorized` or `403 Forbidden`.
- **Puzzle Lifecycle:** Puzzles exist in one of four states:
  - `draft`: Editable answer, clues, and scheduled date.
  - `published`: Locked content. Active and past published puzzles cannot have their answer or clues modified, protecting player scores and history.
  - `unpublished`: Temporarily withdrawn from active play.
  - `archived`: Historical puzzle available for future archive features.
- **Vocabulary Enforcement:** When creating or editing puzzles, answers must exist in the authoritative 16,273-word vocabulary list.
- **Scheduling Rules:** Only one puzzle can be published per calendar date. Duplicate answer detection alerts administrators if an answer was used previously.

To grant admin privileges to an account, run this SQL statement in the Cloudflare D1 console:
```sql
UPDATE accounts SET is_admin = 1 WHERE gamer_tag_key = 'your_gamertag_lowercase';
```

---

## Clean Path Routing & Directory Structure

EmniFun uses direct static paths for all primary views, avoiding fragile hash-based routing.

```
EmniFun/
├── index.html                   # Main single-page application entry point
├── Games/
│   ├── index.html               # Games selection hub
│   ├── FiveWink/index.html      # Dedicated direct entry for FiveWink
│   ├── Game2/index.html         # Game 2 Coming Soon entry
│   └── Game3/index.html         # Game 3 Coming Soon entry
├── admin/
│   ├── index.html               # Central Admin Panels portal
│   ├── admin.css                # Admin portal styling
│   ├── admin.js                 # Admin client logic & API bindings
│   ├── FiveWink/index.html      # Dedicated FiveWink puzzle manager
│   ├── Game2/index.html         # Game 2 admin placeholder
│   └── Game3/index.html         # Game 3 admin placeholder
├── css/
│   └── style.css                # Primary application stylesheet & mobile touch targets
├── js/
│   ├── app.js                   # Application coordinator & navigation lifecycle
│   ├── auth/
│   │   ├── auth.js              # Auth API client & session state
│   │   └── auth-ui.js           # Login modal & Account Vault UI
│   ├── games/
│   │   ├── game1/               # FiveWink implementation
│   │   │   ├── game1-data.js    # Game configuration constants
│   │   │   ├── game1-logic.js   # State transitions & client constraint checking
│   │   │   ├── game1-sound.js   # Web Audio synthesizer chimes
│   │   │   └── game1-ui.js      # Board rendering, keyboard, modal dialog, touch targets
│   │   ├── game2/               # Game 2 UI & logic placeholders
│   │   └── game3/               # Game 3 UI & logic placeholders
│   ├── services/
│   │   ├── api.js               # Centralized fetch wrapper with error handling
│   │   └── puzzle-service.js    # Puzzle fetch & active session restoration
│   └── statistics/
│       └── statistics.js        # Local play stats & streak tracking
├── worker/
│   ├── index.js                 # Worker entry point, routing, session lifecycle & crons
│   ├── game1.js                 # Server-side FiveWink evaluator & Hard Mode 1 rules
│   ├── auth.js                  # Authentication, Google JWT, Vault encryption & sessions
│   ├── admin.js                 # Admin puzzle CRUD, scheduling & vocabulary validation
│   ├── token.js                 # HMAC-SHA256 game-session token signing
│   ├── vocab.js                 # 16,273-word vocabulary loader
│   ├── schema.sql               # Baseline D1 database schema
│   ├── migrations/              # D1 database migrations (0001–0005)
│   └── wrangler.jsonc           # Cloudflare Worker configuration & bindings
├── data/
│   └── game1/vocabulary/
│       └── valid-guesses.json   # 16,273 accepted five-letter words
├── scripts/
│   └── generate-game1-vocabulary.mjs # Vocabulary compiler script
└── tests/                       # Automated Node.js test suites
```

---

## Cloudflare Worker & Backend API

The Cloudflare Worker (`emnifun`) handles all backend operations.

### API Endpoints

#### FiveWink Gameplay API
- `GET /api/fivewink/puzzle` — Returns today's puzzle ID, date, clue count, clues, game mode, and a signed game token. Does **not** return the answer.
- `POST /api/fivewink/mode` — Sets game mode (`default` or `hard1`) for an untouched session and issues an updated game token. Fails if the session is locked.
- `POST /api/fivewink/guess` — Evaluates a five-letter guess against the target answer, enforces mode constraints, and returns feedback.
- `POST /api/fivewink/clue` — Consumes a clue attempt in Standard mode. Rejected in Hard Mode: Strict.
- `POST /api/fivewink/skip` — Ends the 7th-guess stage as `FAILED_HARD` and reveals the answer.

#### Authentication & Account API
- `GET /api/auth/me` — Returns current logged-in identity, Gamer Tag, admin status, and linked Google info.
- `POST /api/auth/google` — Verifies Google GIS credential; authenticates existing users or initiates registration.
- `POST /api/auth/register` — Finalizes new account creation with chosen Gamer Tag.
- `POST /api/auth/logout` — Revokes active session and clears the session cookie.
- `POST /api/auth/gamer-tag` — Updates user's Gamer Tag.
- `GET /api/auth/recovery/keys` — Fetches current recovery key slot status and viewable keys.
- `POST /api/auth/recovery/generate` — Generates a new 16-character recovery key for a designated slot.
- `POST /api/auth/recovery/initiate` — Initiates an account recovery challenge using a recovery key.
- `POST /api/auth/recovery/verify` — Verifies recovery key validity.
- `POST /api/auth/recovery/complete` — Links a new Google account and completes recovery.

#### Admin Panel API (Requires `is_admin = 1`)
- `GET /api/admin/puzzles` — Lists puzzles filtered by status or query.
- `POST /api/admin/puzzle` — Creates a new draft puzzle or updates an existing draft.
- `POST /api/admin/publish` — Publishes a draft puzzle for a specific date.
- `POST /api/admin/unpublish` — Reverts a published puzzle to draft.
- `POST /api/admin/archive` — Moves a puzzle to archived status.
- `POST /api/admin/delete` — Permanently deletes a draft, archived, or unpublished puzzle.

### Asia/Kolkata (IST) Canonical Scheduling

The Worker uses **Asia/Kolkata (IST)** as the canonical date reference for daily puzzles. Daily puzzles unlock at midnight IST (00:00 IST), regardless of the user's local timezone.

### Scheduled Cron Jobs

Configured in `worker/wrangler.jsonc`:
- **`30 18 * * *` (00:00 IST):** Auto-publishes scheduled puzzles for the new day, expires yesterday's sessions, and runs data cleanups.
- **`15 * * * *` (Hourly):** Cleans up expired sessions, expired auth challenges, and unlinked guest sessions.

---

## Database Schema & Migrations

The database is Cloudflare D1 (SQLite). Changes are versioned using D1 migrations in `worker/migrations/`:

| Migration File | Description |
| :--- | :--- |
| `0001_auth.sql` | Accounts, Google identities, recovery keys, auth sessions, challenge tables. |
| `0002_auth_security_fixes.sql` | Account-level recovery lock, challenge consumption, cooldown tracking. |
| `0003_admin.sql` | Adds `is_admin` to `accounts`, audit timestamps to `fivewink_puzzles`. |
| `0004_fivewink_plays.sql` | Creates `fivewink_plays` for authenticated one-play-per-puzzle enforcement. |
| `0005_fivewink_modes.sql` | Adds `mode TEXT NOT NULL DEFAULT 'default'` to `fivewink_sessions` and `fivewink_plays`. |

---

## Five-Letter Vocabulary

FiveWink uses an authoritative list of **16,273 unique five-letter English words** stored in `data/game1/vocabulary/valid-guesses.json`. The generator compiles words from multiple dictionary sources with deterministic filtering.

To recompile the vocabulary dataset:
```powershell
node scripts/generate-game1-vocabulary.mjs
```

---

## Security Model

- **No Secrets in Source:** Secrets are never committed to GitHub or exposed in frontend code.
- **Worker Secrets:**
  - `GAME_TOKEN_SECRET`: Used to sign HMAC-SHA256 game tokens.
  - `SESSION_SECRET`: Used to sign and verify session cookie tokens.
  - `TOKEN_PEPPER` & `RECOVERY_PEPPER`: Secret keys used in HMAC derivations.
  - `VAULT_KEY`: 256-bit AES-GCM encryption key for the Recovery Vault.
- **Answer Protection:** Answers are stored exclusively in D1. The Worker discloses the answer only after legitimate session termination.
- **Session Tokens:** State transitions require a valid token matching `sessionId`, `puzzleId`, `date`, and optimistic `version`. Stale or out-of-order requests are rejected with `409 Conflict`.
- **Rate Limiting:** Bound to Cloudflare rate limiters (`AUTH_RATE_LIMITER`, `AUTH_CHALLENGE_RATE_LIMITER`, `RECOVERY_RATE_LIMITER`) to protect against brute-force attacks.

---

## Local Development

EmniFun does not require a complex build system or Node package installation to run the frontend.

### Prerequisites
- Python 3 (for running a local HTTP server) or any static file server.
- Node.js 18+ (for running automated tests).

### Starting the Local Web Server

From the repository root:
```powershell
python -m http.server 8000
```

Open your browser to:
```
http://localhost:8000
```

---

## Running Automated Tests

EmniFun uses Node.js's built-in test runner. No external test packages or `node_modules` are required.

To run the full test suite (69 automated tests):
```powershell
node --test tests/*.test.mjs tests/*.test.js
```

### Test Suite Coverage
- `tests/fivewink-plays.test.mjs`: Authenticated one-play enforcement, guest replays, session restoration, atomic mode locking, Hard Mode: Strict constraint validation, and skip regressions.
- `tests/game1-logic.test.js`: Client-side state transitions, guess evaluation, clue progression, 7th-guess stage, and client constraint checking.
- `tests/game1-data.test.js`: Puzzle service integration and answer protection.
- `tests/worker-game1.test.mjs`: Server-side word feedback rules and duplicate-letter evaluation.
- `tests/worker-token.test.mjs`: HMAC game-session token signing and verification.
- `tests/admin.test.mjs`: Admin authorization, puzzle CRUD, vocabulary validation, and publication rules.
- `tests/auth-core.test.mjs`: Account security, vault encryption, recovery keys, and challenge lifecycle.
- `tests/games-routing.test.mjs`: Static routing helpers and entry points.

To check code formatting and whitespace:
```powershell
git diff --check
```

---

## Deployment Workflow

> [!WARNING]
> **Production Environment Notice:** Commands targeting remote environments (`--remote`) or pushing to the `main` branch directly affect the live production database and public website.
>
> Production migrations and Worker deployments should only be run intentionally after reviewing your changes, verifying test passes, and confirming the target configuration in `worker/wrangler.jsonc`. Before executing any production-changing commands, always review the target environment and inspect pending migrations (e.g., using `npx wrangler d1 migrations list emnifun-db --config worker/wrangler.jsonc --remote`).

### 1. Inspect Pending Migrations (Read-Only Pre-Check)
Verify the target database identity (UUID) and pending migration list without modifying anything:
```powershell
npx wrangler d1 migrations list emnifun-db --config worker/wrangler.jsonc --remote
```

### 2. Apply D1 Migrations to Production (Production-Changing)
Applies pending migrations to the live production database (`emnifun-db`):
```powershell
npx wrangler d1 migrations apply emnifun-db --config worker/wrangler.jsonc --remote
```

### 3. Deploy Cloudflare Worker (Production-Changing)
Uploads and activates the updated Worker code on Cloudflare:
```powershell
npx wrangler deploy --config worker/wrangler.jsonc
```

### 4. Deploy Frontend Assets (Production-Changing)
Push to the `main` branch. GitHub Pages will build and deploy static files within 60–90 seconds:
```powershell
git add css/ js/ Games/ admin/ index.html README.md worker/
git commit -m "feat: release updates"
git push origin main
```

---

## Roadmap & Planned Features

- **Hard Mode 2 (Mindbender):** Additional deduction rules and restricted letter constraints (in development).
- **Hard Mode 3 (Expert):** Master-tier challenge mode for advanced solvers (in development).
- **Game 2 & Game 3:** Upcoming puzzle formats currently under design.
- **Puzzle Archive Explorer:** Historical puzzle access for authenticated accounts.
- **Global Leaderboards:** Competitive daily solve statistics and streak showcases.
