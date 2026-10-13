import {
  evaluateGuess,
  FIVEWINK_RESULTS,
  getSeventhResult,
  isFiveLetterGuess,
  parseClues,
  checkHardMode1Constraints,
  ALLOWED_GAMEPLAY_MODES
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
    JSON.stringify(["wrong-position", "absent", "correct", "absent", "correct"]),
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

assert(
  ALLOWED_GAMEPLAY_MODES.has("default") && ALLOWED_GAMEPLAY_MODES.has("hard1"),
  "Allowed gameplay modes must include default and hard1."
);
assert(
  !ALLOWED_GAMEPLAY_MODES.has("hard2") && !ALLOWED_GAMEPLAY_MODES.has("hard3"),
  "Placeholder modes hard2 and hard3 must not be active gameplay modes."
);

// Hard Mode 1 constraints:
// 1. Initial guess has no previous constraints
assert(checkHardMode1Constraints("HOUSE", [], []).valid, "Initial guess must be valid.");

// 2. Green / Blue position constraint
const greenPrev = ["CRANE"];
const greenEval = [["correct", "absent", "absent", "absent", "absent"]]; // C at pos 1
assert(
  checkHardMode1Constraints("CLOWN", greenPrev, greenEval).valid,
  "Guess with C in position 1 must be valid."
);
const greenFail = checkHardMode1Constraints("PLANT", greenPrev, greenEval);
assert(
  !greenFail.valid && greenFail.message === "Position 1 must be C.",
  "Guess missing C at position 1 must be rejected."
);

// 3. Orange / wrong-position constraint
const orangePrev = ["CRANE"];
const orangeEval = [["absent", "wrong-position", "absent", "absent", "absent"]]; // R at pos 2
const orangeSamePos = checkHardMode1Constraints("FROST", orangePrev, orangeEval); // R at pos 2
assert(
  !orangeSamePos.valid && orangeSamePos.message === "Letter R cannot be in position 2.",
  "Letter confirmed orange cannot be in the same position."
);
const orangeMissing = checkHardMode1Constraints("GHOST", orangePrev, orangeEval); // no R
assert(
  !orangeMissing.valid && orangeMissing.message === "Guess must contain R.",
  "Guess must contain confirmed orange letter."
);
assert(
  checkHardMode1Constraints("STORM", orangePrev, orangeEval).valid,
  "Guess containing R in position 4 must be valid."
);

// 4. Duplicate letters: count only colored (non-absent) occurrences
const dupPrev = ["SPEED"];
const dupEval = [["absent", "absent", "correct", "absent", "absent"]]; // only one E confirmed
assert(
  checkHardMode1Constraints("CREPT", dupPrev, dupEval).valid,
  "Guess with one E must be valid when only one E was confirmed colored."
);

const multiPrev = ["SHEEP"];
const multiEval = [["absent", "absent", "wrong-position", "wrong-position", "absent"]]; // 2 E's confirmed
const multiFail = checkHardMode1Constraints("MELON", multiPrev, multiEval); // only 1 E, at position 2 (index 1)
assert(
  !multiFail.valid && multiFail.message === "Guess must contain at least 2 of letter E.",
  "Guess with fewer occurrences than confirmed colored count must be rejected."
);
assert(
  checkHardMode1Constraints("EERIE", multiPrev, multiEval).valid,
  "Guess with 2 or more E's avoiding orange positions must satisfy 2 confirmed E's."
);

console.log("FiveWink Worker game-rule checks passed.");
