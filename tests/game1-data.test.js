/**
 * FiveWink data-service checks.
 *
 * These run in a browser/server test environment with fetch available.
 */
import {
  PuzzleDataError,
  PUZZLE_STATUS,
  findPublishedPuzzle,
  getPublishedPuzzleForDate,
  loadGame1Data,
  validateDailyWordRecord,
  validateDailyClueRecord,
  combinePuzzleData,
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
  assert(!data.validWords.has(word), "Obvious source-marked or malformed entry should be filtered: " + word);
}

assert(data.puzzleIndex.game === "game1", "Puzzle archive index must be for FiveWink.");
assert(
  data.puzzleIndex.puzzles.every((entry) =>
    entry.wordPath === "Word/" + entry.date.slice(0, 4) + "/" + entry.date + ".json" &&
    entry.cluePath === "Clue/" + entry.date.slice(0, 4) + "/" + entry.date + ".json"
  ),
  "Every archive entry must use the canonical date-wise word and clue paths."
);
assert(data.puzzleIndex.puzzles.length === 6, "All six existing FiveWink dates must remain indexed.");

const today = await getPublishedPuzzleForDate("2026-10-03");
assert(today?.answer === "HOUSE", "Published puzzle for October 3 should load from the split schedule/clue data.");
assert(today?.clues.length === 5, "Today's puzzle must combine exactly five clues.");
assert(
  today?.clues[0] === "People live in it." &&
  today?.clues[4] === "It is a place to live.",
  "October 3 clues must remain in their original order."
);

const october2 = await getPublishedPuzzleForDate("2026-10-02");
assert(october2?.answer === "APPLE", "October 2 must preserve its migrated answer.");

assert(
  await getPublishedPuzzleForDate("2026-10-05") === null,
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


// Date-wise daily file validation checks.
const validWord = validateDailyWordRecord(
  {
    id: "game1-2026-10-08",
    game: "game1",
    date: "2026-10-08",
    answer: "HOUSE",
    status: PUZZLE_STATUS.DRAFT
  },
  data.validWords,
  data.answerWords,
  {
    id: "game1-2026-10-08",
    game: "game1",
    date: "2026-10-08",
    wordPath: "Word/2026/2026-10-08.json",
    cluePath: "Clue/2026/2026-10-08.json"
  }
);
assert(validWord.answer === "HOUSE", "Daily word file should validate its answer.");

const validClue = validateDailyClueRecord(
  {
    id: "game1-2026-10-08",
    game: "game1",
    date: "2026-10-08",
    clues: ["1", "2", "3", "4", "5"]
  },
  {
    id: "game1-2026-10-08",
    game: "game1",
    date: "2026-10-08",
    wordPath: "Word/2026/2026-10-08.json",
    cluePath: "Clue/2026/2026-10-08.json"
  }
);
assert(validClue.clues.length === 5, "Daily clue file should validate exactly five clues.");

const combined = combinePuzzleData(
  "2026-10-08",
  validWord,
  validClue,
  data.validWords,
  data.answerWords
);
assert(combined.answer === "HOUSE", "Daily word file must supply the combined answer.");
assert(combined.clues[0] === "1" && combined.clues.length === 5, "Daily clue file must supply the combined clues.");

for (const badWord of [
  null,
  { id: "game1-2026-10-09", game: "game1", date: "2026-10-08", answer: "HOUSE", status: PUZZLE_STATUS.DRAFT },
  { id: "game1-2026-10-08", game: "game1", date: "2026-10-08", answer: "NOT5", status: PUZZLE_STATUS.DRAFT }
]) {
  let threw = false;
  try {
    validateDailyWordRecord(badWord, data.validWords, data.answerWords);
  } catch (error) {
    threw = error instanceof PuzzleDataError;
  }
  assert(threw, "Malformed daily word file must fail clearly.");
}

for (const badClue of [
  null,
  { id: "game1-2026-10-09", game: "game1", date: "2026-10-08", clues: ["1", "2", "3", "4", "5"] },
  { id: "game1-2026-10-08", game: "game1", date: "2026-10-08", clues: ["1", "2"] },
  { id: "game1-2026-10-08", game: "game1", date: "2026-10-08", clues: ["1", "", "3", "4", "5"] }
]) {
  let threw = false;
  try {
    validateDailyClueRecord(badClue);
  } catch (error) {
    threw = error instanceof PuzzleDataError;
  }
  assert(threw, "Malformed daily clue file must fail clearly.");
}

let mismatchDetected = false;
try {
  combinePuzzleData(
    "2026-10-08",
    validWord,
    {
      id: "game1-2026-10-09",
      game: "game1",
      date: "2026-10-09",
      clues: ["1", "2", "3", "4", "5"]
    },
    data.validWords,
    data.answerWords
  );
} catch (error) {
  mismatchDetected = error instanceof PuzzleDataError;
}
assert(mismatchDetected, "A clue file for a different date must fail clearly.");

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
assert(validated.answer === "HOUSE", "Validated answer must come from puzzle data.");
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

console.log("FiveWink data checks passed.");
