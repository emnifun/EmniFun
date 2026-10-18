# FiveWink data

FiveWink now separates public guess vocabulary from private gameplay data.

## Public guess vocabulary

File:

`data/game1/vocabulary/valid-guesses.json`

This remains public because it is the accepted player-guess vocabulary, not a secret. The current generated dataset contains 16,273 unique five-letter A-Z entries.

## Private puzzle data

Daily FiveWink answers, clues, publication status, and active game-session state are now stored in the Cloudflare D1 database attached to the `emnifun` Worker.

The browser receives only the currently published puzzle's:

- puzzle ID;
- date;
- five clues;
- signed game-session token.

The browser does not receive the answer during active play.

The Worker returns the answer only after a legitimate finishing action:

- a normal solve;
- the seventh guess;
- skipping the seventh guess.

## Backend flow

```
FiveWink
   ↓
Puzzle Service
   ↓
Cloudflare Worker
   ↓
Cloudflare D1
```

The Worker is authoritative for:

- puzzle selection;
- accepted-guess validation;
- feedback generation;
- clue/attempt progression;
- seventh-stage progression;
- answer reveal after game completion.

## Daily puzzle management

Create and edit puzzle records in the private D1 database.

Do not put future answers or future clue text back into this public repository.

Use `worker/schema.sql` to create the required database tables.

See `worker/README.md` for the Cloudflare setup.

## Important history note

Old Git commits may still contain the pre-backend JSON data because those values existed in earlier public commits. This migration prevents the current working tree and future puzzle records from exposing those values through the frontend. Removing old Git history would require a separate history-rewrite operation.
