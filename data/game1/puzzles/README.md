# FiveWink puzzle storage

Daily FiveWink puzzle data is no longer stored as public JSON.

The private D1 database stores:

- puzzle ID;
- game ID;
- date;
- answer;
- five clues;
- publication status.

Active player-session state is stored in the same D1 database.

The public repository intentionally keeps no usable daily answer/clue records.

## Publication rule

The Worker selects exactly one `published` puzzle for the current Asia/Kolkata date.

Draft, unpublished, and archived puzzle records remain private and are never returned by the public puzzle endpoint.

## Adding a puzzle

Add a row to the private `fivewink_puzzles` D1 table.

Do not add daily answer or clue JSON files to this public repository.

The Worker API is the only browser-facing route to the current puzzle.

See `worker/schema.sql` and `worker/README.md`.
