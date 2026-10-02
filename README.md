# EmniFun

EmniFun is a beginner-friendly Indian-oriented puzzle platform. Phase 1 creates the website shell and a clean foundation for adding games and a backend later.

## Phase 1

This version includes:

- A responsive website shell
- Home, Games, Statistics, Archive, and Login views
- Three independent game slots
- A Game 1 placeholder without final puzzle mechanics
- Game 2 and Game 3 as Coming Soon
- Separate areas for game UI, game logic, and game data
- A service boundary for the future backend/API
- Placeholder boundaries for authentication and statistics
- Documentation placeholders for the future data archive and admin area

It intentionally does **not** include a real database, user accounts, authentication, admin dashboard, leaderboards, multiplayer, or the final Game 1 rules.

## Project structure

- `index.html` — the small HTML entry point. It contains the website sections but not game logic.
- `css/style.css` — all Phase 1 visual styling.
- `js/app.js` — starts the website and connects navigation to the independent modules.
- `js/games/` — one separate folder for each game.
- `js/games/game1/game1-ui.js` — displays Game 1. It does not contain the future scoring rules.
- `js/games/game1/game1-logic.js` — reserved for Game 1 rules.
- `js/games/game1/game1-data.js` — reserved for Game 1 data definitions; no puzzle answers are stored here in Phase 1.
- `js/games/game2/` and `js/games/game3/` — independent placeholders with the same UI/logic/data separation.
- `js/services/api.js` — the future data/API boundary. Games should use this layer instead of knowing how a database works.
- `js/auth/auth.js` — the future authentication boundary. Login code should stay out of game modules.
- `js/statistics/statistics.js` — statistics boundary. Statistics are keyed by game so each game can have its own rules and results.
- `data/` — documentation and future non-secret data.
- `admin/` — future private administration area.
- `tests/` — future automated tests.

## A simple way to understand the architecture

Think of the project as layers:

**Website UI → Game UI → Game Logic → Data/API Service → Backend → Database**

The UI is what the player sees. Game logic is the rules. The data/API service is a middle layer that will eventually ask the server for data. The backend and database are intentionally not built yet.

This separation means the appearance can change without rewriting the game rules, and the backend can change later without forcing every game UI to be rewritten.

## Authentication

The eventual login system can use username + password with secure password hashing on the server. Phase 1 only provides a placeholder boundary; no passwords or sessions are implemented.

## Running the site

For a simple preview, open `index.html` through a local web server. ES modules are used, so opening the file directly with a browser's `file://` URL may be blocked by browser security rules.

One easy option is VS Code with a simple local-server extension. Another option, if Python is installed, is:

```text
python -m http.server 8000
```

Then visit `http://localhost:8000` in the browser.

## Future environment variables and secrets

When a backend is added, database URLs, secret keys, password-related secrets, and API credentials must be stored as environment variables or platform secrets. They must never be committed to GitHub.

## Phase 1 stopping point

The next phase should be started only after reviewing this foundation. The final Game 1 mechanics are deliberately not implemented yet.
