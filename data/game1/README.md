# Game 1 data

This folder contains the local data used by the Game 1 prototype.

## valid-guesses.json

This is the player guess vocabulary. It contains 5,757 unique five-letter entries from the targeted 5-Letter-Words collection. The words were filtered to lowercase, unique, exactly five ASCII letters.

Source: darkermango/5-Letter-words, words.json
License: MIT (see the source repository)

## answers.json

This is a smaller curated answer pool. A word can be a valid guess without being eligible as an answer.

## puzzles.json

This contains the actual daily puzzle records. Each record has an id, game, date, answer, five clues, and status.

Supported status values are: `draft`, `scheduled`, `published`, `archived`.

The public game selects only the `published` Game 1 puzzle for the requested date.

## How to add tomorrow's puzzle

1. Open `data/game1/puzzles.json`.
2. Add a new object inside the `puzzles` array.
3. Give it a unique id such as `game1-2026-10-08`.
4. Set the `game` to `game1`.
5. Set the correct `date` in `YYYY-MM-DD` format.
6. Put the five-letter answer in `answer`.
7. Add exactly five clues to the `clues` array.
8. Set `status` to `published` when it is ready for the public game.
9. Commit and push the JSON file to GitHub.

You do not need to edit `game1-ui.js`, `game1-logic.js`, `app.js`, HTML, or CSS to change the daily puzzle.

## Static-site limitation

This prototype is served from static files. A browser can inspect any JSON shipped with the site, so draft, scheduled, and future puzzle answers are not truly private here. Status filtering is for application behavior and organization, not security. A future backend should keep unpublished puzzle data off the public site.