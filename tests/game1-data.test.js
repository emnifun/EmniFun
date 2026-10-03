/**
 * Game 1 data-service checks.
 *
 * These run in a browser/server test environment with fetch available.
 */
import {
  PuzzleDataError,
  PUZZLE_STATUS,
  findPublishedPuzzle,
  getPublishedPuzzleForDate,
  loadGame1Data,
  validatePuzzleRecord
} from "../js/services/puzzle-service.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const data = await loadGame1Data();

assert(data.validWords.size >= 16000, "The accepted vocabulary must remain broadly populated.");
assert([...data.validWords].every((word) => /^[A-Z]{5}$/.test(word)), "Every accepted vocabulary entry must be exactly five A-Z letters.");
assert(new Set(data.validWords).size === data.validWords.size, "Accepted vocabulary must not contain duplicates.");
assert(data.answerWords.size === 182, "The curated answer pool should remain separate and contain the current 182 candidates.");

for (const answer of data.answerWords) {
  assert(data.validWords.has(answer), "Every answer must also be a valid guess: " + answer);
}

for (const word of ["APPLE", "THING", "AARTI", "LUDIC", "JIVER", "CWTCH", "WHEES"]) {
  assert(data.validWords.has(word), "Broad vocabulary should contain representative source words: " + word);
}

for (const word of ["EMACS", "NIMBY", "CCITT", "ACCRA", "ZILLA", "ADMRX", "APPMT", "ADDDA"]) {
  assert(!data.validWords.has(word), "Obvious source-flagged or malformed entry should be filtered: " + word);
}

assert(data.puzzleIndex.game === "game1", "Puzzle archive index must be for Game 1.");
assert(data.puzzleIndex.puzzles.length === 6, "Current sample archive should contain six date entries.");
assert(
  data.puzzleIndex.puzzles.every((entry) =>
    entry.path === entry.date.slice(0, 4) + "/" + entry.date + ".json"
  ),
  "Every archive entry must use the canonical date-based file path."
);

const today = await getPublishedPuzzleForDate("2026-10-02");
assert(today?.answer === "APPLE", "Published puzzle for October 2 should load from its date file.");
assert(today?.clues.length === 5, "Today's puzzle clues must come from puzzle data.");

assert(
  await getPublishedPuzzleForDate("2026-10-03") === null,
  "Draft puzzle must not be selected."
);
assert(
  await getPublishedPuzzleForDate("2026-10-04") === null,
  "Unpublished puzzle must not be selected."
);
assert(
  await getPublishedPuzzleForDate("2026-10-07") === null,
  "Archived puzzle must not be selected."
);
assert(
  await getPublishedPuzzleForDate("2026-12-31") === null,
  "Missing date must return no puzzle instead of a fallback."
);

const conflictingDate = [
  {
    id: "game1-2026-11-01",
    game: "game1",
    date: "2026-11-01",
    answer: "APPLE",
    clues: ["1", "2", "3", "4", "5"],
    status: PUZZLE_STATUS.PUBLISHED
  },
  {
    id: "game1-2026-11-01",
    game: "game1",
    date: "2026-11-01",
    answer: "HOUSE",
    clues: ["1", "2", "3", "4", "5"],
    status: PUZZLE_STATUS.PUBLISHED
  }
];

let conflictDetected = false;
try {
  findPublishedPuzzle(conflictingDate, "2026-11-01", "game1");
} catch (error) {
  conflictDetected = error instanceof PuzzleDataError;
}
assert(conflictDetected, "Multiple published puzzles for one date must fail clearly.");

const onePublishedOneDraft = [
  conflictingDate[0],
  { ...conflictingDate[1], status: PUZZLE_STATUS.DRAFT }
];
assert(
  findPublishedPuzzle(onePublishedOneDraft, "2026-11-01", "game1")?.answer === "APPLE",
  "A single published puzzle should be selected even when another draft exists."
);

const validated = validatePuzzleRecord(today, data.validWords, data.answerWords);
assert(validated.answer === "APPLE", "Validated answer must come from puzzle data.");
assert(validated.clues.length === 5, "Selected puzzle must have exactly five clues.");

for (const badRecord of [
  { ...today, id: "game1-2026-10-09" },
  { ...today, date: "2026-02-30" },
  { ...today, status: "scheduled" },
  { ...today, answer: "NOT5" },
  { ...today, clues: today.clues.slice(0, 4) }
]) {
  let threw = false;
  try {
    validatePuzzleRecord(badRecord, data.validWords, data.answerWords);
  } catch (error) {
    threw = true;
  }
  assert(threw, "Malformed puzzle data must fail validation.");
}

console.log("Game 1 data checks passed.");
