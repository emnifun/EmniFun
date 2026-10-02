/**
 * Game 1 data-service checks.
 *
 * These run in a browser/server test environment with fetch available.
 */
import { loadGame1Data, findPublishedPuzzle, validatePuzzleRecord } from "../js/services/puzzle-service.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const data = await loadGame1Data();

assert([...data.validWords].every((word) => /^[A-Z]{5}$/.test(word)), "Every accepted vocabulary entry must be exactly five A-Z letters.");
assert(new Set(data.validWords).size === data.validWords.size, "Accepted vocabulary must not contain duplicates.");
assert(data.answerWords.size > 0, "Answer vocabulary must not be empty.");

// Representative words cover common, uncommon, variant, inflected, and loanword cases.
for (const word of ["APPLE", "THING", "AARTI", "LUDIC", "JIVER", "CWTCH", "WHEES"]) {
  assert(data.validWords.has(word), "Broad vocabulary should contain representative source words: " + word);
}

// These are intentionally excluded source-marked abbreviations/codes or malformed artifacts.
for (const word of ["EMACS", "NIMBY", "CCITT", "ACCRA", "ZILLA", "ADMRX", "APPMT", "ADDDA"]) {
  assert(!data.validWords.has(word), "Obvious source-flagged or malformed entry should be filtered: " + word);
}

for (const answer of data.answerWords) {
  assert(data.validWords.has(answer), "Every answer must also be a valid guess: " + answer);
}

const apple = findPublishedPuzzle(data.puzzles, "2026-10-02", "game1");
const house = findPublishedPuzzle(data.puzzles, "2026-10-03", "game1");
const train = findPublishedPuzzle(data.puzzles, "2026-10-04", "game1");

assert(apple?.answer === "APPLE", "October 2 sample puzzle should be APPLE.");
assert(house?.answer === "HOUSE", "October 3 sample puzzle should be HOUSE.");
assert(train?.answer === "TRAIN", "October 4 sample puzzle should be TRAIN.");
assert(findPublishedPuzzle(data.puzzles, "2026-10-05", "game1") === null, "Draft puzzle must not be selected.");
assert(findPublishedPuzzle(data.puzzles, "2026-10-06", "game1") === null, "Scheduled puzzle must not be selected.");
assert(findPublishedPuzzle(data.puzzles, "2026-10-07", "game1") === null, "Archived puzzle must not be selected.");

const validated = validatePuzzleRecord(apple, data.validWords, data.answerWords);
assert(validated.clues.length === 5, "Selected puzzle must have exactly five clues.");

const bad = { ...apple, answer: "NOT5", clues: apple.clues.slice(0, 4) };
let threw = false;
try {
  validatePuzzleRecord(bad, data.validWords, data.answerWords);
} catch (error) {
  threw = true;
}
assert(threw, "Malformed puzzle data must fail validation.");

console.log("Game 1 data checks passed.");
