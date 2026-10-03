import {
  evaluateGuess,
  FIVEWINK_RESULTS,
  getSeventhResult,
  isFiveLetterGuess,
  parseClues
} from "../worker/game1.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  JSON.stringify(evaluateGuess("HOUSE", "HOUSE")) ===
    JSON.stringify(["correct", "correct", "correct", "correct", "correct"]),
  "Exact answers must return five correct positions."
);

assert(
  JSON.stringify(evaluateGuess("HOUSE", "MOUSE")) ===
    JSON.stringify(["absent", "correct", "correct", "correct", "correct"]),
  "Position feedback must use the existing FiveWink semantics."
);

assert(
  JSON.stringify(evaluateGuess("SHEEP", "APPLE")) ===
    JSON.stringify(["absent", "absent", "wrong-position", "absent", "wrong-position"]),
  "Duplicate letters must respect remaining answer counts."
);

assert(
  JSON.stringify(evaluateGuess("EERIE", "THREE")) ===
    JSON.stringify(["wrong-position", "wrong-position", "correct", "absent", "correct"]),
  "Duplicate-letter feedback must not over-credit a repeated letter."
);

assert(isFiveLetterGuess("HOUSE"), "Five A-Z letters should be accepted.");
assert(!isFiveLetterGuess("HOUSES"), "Six letters must be rejected.");
assert(!isFiveLetterGuess("AB1CD"), "Non-letter input must be rejected.");

const clues = parseClues(JSON.stringify(["1", "2", "3", "4", "5"]));
assert(clues.length === 5 && clues[0] === "1", "Five valid clues must parse.");

let clueError = false;
try {
  parseClues(JSON.stringify(["1", "2"]));
} catch (error) {
  clueError = true;
}
assert(clueError, "A clue list with fewer than five clues must fail.");

assert(
  getSeventhResult("HOUSE", "HOUSE") === FIVEWINK_RESULTS.FAILED_CLOSE,
  "An exact seventh guess must remain FAILED_CLOSE."
);

assert(
  getSeventhResult("MOUSE", "HOUSE") === FIVEWINK_RESULTS.FAILED_HARD,
  "A non-exact seventh guess must remain FAILED_HARD."
);

console.log("FiveWink Worker game-rule checks passed.");
