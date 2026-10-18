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

// 5. Multi-row Blue constraints: lowest position index wins deterministically
const multiBluePrev = ["STONE", "PLANT"];
// Row 1 STONE: N at pos 4 (index 3) is correct
// Row 2 PLANT: P at pos 1 (index 0) is correct
const multiBlueEval = [
  ["absent", "absent", "absent", "correct", "absent"],
  ["correct", "absent", "absent", "correct", "absent"]
];
// CRATE misses P at pos 1 and N at pos 4; pos 1 must win
const multiBlueFail = checkHardMode1Constraints("CRATE", multiBluePrev, multiBlueEval);
assert(
  !multiBlueFail.valid && multiBlueFail.message === "Position 1 must be P.",
  "Lowest position index 1 must take priority over position 4 regardless of row order."
);

// 6. Multi-row Orange constraints: lowest position index wins deterministically
const multiOrangePrev = ["TRAIN", "POINT"];
// Row 1 TRAIN: N at pos 5 (index 4) is orange
// Row 2 POINT: P at pos 1 (index 0) is orange
const multiOrangeEval = [
  ["absent", "absent", "absent", "absent", "wrong-position"],
  ["wrong-position", "absent", "absent", "absent", "absent"]
];
// PRONN has P at pos 1 and N at pos 5; pos 1 must win
const multiOrangeFail = checkHardMode1Constraints("PRONN", multiOrangePrev, multiOrangeEval);
assert(
  !multiOrangeFail.valid && multiOrangeFail.message === "Letter P cannot be in position 1.",
  "Lowest position index 1 in Orange must take priority over position 5 regardless of row order."
);

// 7. Cross-row category hierarchy: Blue outranks Orange regardless of row timing
// Case A: Row 1 Blue at pos 4, Row 2 Orange at pos 1
const crossCatA_Prev = ["STONE", "POINT"];
const crossCatA_Eval = [
  ["absent", "absent", "absent", "correct", "absent"], // N blue at 4
  ["wrong-position", "absent", "absent", "absent", "absent"]  // P orange at 1
];
// PRIZE has P at pos 1 (violates Orange) and Z at pos 4 (violates Blue). Blue must win!
const crossCatA_Fail = checkHardMode1Constraints("PRIZE", crossCatA_Prev, crossCatA_Eval);
assert(
  !crossCatA_Fail.valid && crossCatA_Fail.message === "Position 4 must be N.",
  "Blue violation from Row 1 must outrank Orange violation from Row 2."
);

// Case B: Row 1 Orange at pos 1, Row 2 Blue at pos 4
const crossCatB_Prev = ["POINT", "STONE"];
const crossCatB_Eval = [
  ["wrong-position", "absent", "absent", "absent", "absent"], // P orange at 1
  ["absent", "absent", "absent", "correct", "absent"]  // N blue at 4
];
const crossCatB_Fail = checkHardMode1Constraints("PRIZE", crossCatB_Prev, crossCatB_Eval);
assert(
  !crossCatB_Fail.valid && crossCatB_Fail.message === "Position 4 must be N.",
  "Blue violation from Row 2 must outrank Orange violation from Row 1."
);

// 8. Cross-row category hierarchy: Orange outranks Required Letters/Counts
const crossCatC_Prev = ["POINT", "SHEEP"];
const crossCatC_Eval = [
  ["wrong-position", "absent", "absent", "absent", "absent"], // P orange at 1
  ["absent", "absent", "wrong-position", "wrong-position", "absent"] // 2 E's required
];
// PILOT has P at pos 1 (violates Orange) and 0 E's (violates count). Orange must win!
const crossCatC_Fail = checkHardMode1Constraints("PILOT", crossCatC_Prev, crossCatC_Eval);
assert(
  !crossCatC_Fail.valid && crossCatC_Fail.message === "Letter P cannot be in position 1.",
  "Orange violation must outrank letter count violation."
);

console.log("FiveWink Worker game-rule checks passed.");
