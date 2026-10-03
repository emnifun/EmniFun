/**
 * Game 1 puzzle/data service.
 *
 * Game 1 UI code uses this service contract and never reads JSON files
 * directly. Today the implementation uses local JSON files. Later the
 * implementation can call a backend API/database without changing Game 1.
 */

const VALID_GUESSES_URL = new URL("../../data/game1/vocabulary/valid-guesses.json", import.meta.url);
const ANSWERS_URL = new URL("../../data/game1/vocabulary/answers.json", import.meta.url);
const PUZZLE_DATA_URL = new URL("../../data/game1/puzzles/", import.meta.url);
const PUZZLE_INDEX_URL = new URL("../../data/game1/puzzles/index.json", import.meta.url);

export const PUZZLE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
  ARCHIVED: "archived"
});

const VALID_PUZZLE_STATUSES = new Set(Object.values(PUZZLE_STATUS));
const DAILY_WORD_PATH_PATTERN = /^Word\/\d{4}\/\d{4}-\d{2}-\d{2}\.json$/;
const DAILY_CLUE_PATH_PATTERN = /^Clue\/\d{4}\/\d{4}-\d{2}-\d{2}\.json$/;

let game1DataPromise = null;

export class PuzzleDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "PuzzleDataError";
  }
}

async function fetchJson(url, label) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new PuzzleDataError("Could not load " + label + ".");
  }

  if (!response.ok) {
    throw new PuzzleDataError("Could not load " + label + " (HTTP " + response.status + ").");
  }

  try {
    return await response.json();
  } catch (error) {
    throw new PuzzleDataError(label + " contains invalid JSON.");
  }
}

function validatePuzzleIndex(index) {
  if (!index || typeof index !== "object") {
    throw new PuzzleDataError("The Game 1 puzzle index is invalid.");
  }

  if (index.game !== "game1") {
    throw new PuzzleDataError("The Game 1 puzzle index has an invalid game identifier.");
  }

  if (!Array.isArray(index.puzzles)) {
    throw new PuzzleDataError("puzzles/index.json must contain a puzzles array.");
  }

  const seenDates = new Set();
  const seenIds = new Set();

  const puzzles = index.puzzles.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new PuzzleDataError("The Game 1 puzzle index contains an invalid entry.");
    }

    if (entry.game !== "game1") {
      throw new PuzzleDataError("A Game 1 puzzle index entry has an invalid game identifier.");
    }

    const date = normalizePuzzleDate(entry.date);
    const expectedId = "game1-" + date;
    const year = date.slice(0, 4);

    if (entry.id !== expectedId) {
      throw new PuzzleDataError("Puzzle index id must match game1-YYYY-MM-DD.");
    }

    if (seenDates.has(date) || seenIds.has(entry.id)) {
      throw new PuzzleDataError(
        "The Game 1 puzzle index contains an ambiguous duplicate date or id: " + date + "."
      );
    }

    if (
      typeof entry.wordPath !== "string" ||
      !DAILY_WORD_PATH_PATTERN.test(entry.wordPath) ||
      entry.wordPath !== "Word/" + year + "/" + date + ".json"
    ) {
      throw new PuzzleDataError("Puzzle index wordPath must match Word/YYYY/YYYY-MM-DD.json.");
    }

    if (
      typeof entry.cluePath !== "string" ||
      !DAILY_CLUE_PATH_PATTERN.test(entry.cluePath) ||
      entry.cluePath !== "Clue/" + year + "/" + date + ".json"
    ) {
      throw new PuzzleDataError("Puzzle index cluePath must match Clue/YYYY/YYYY-MM-DD.json.");
    }

    seenDates.add(date);
    seenIds.add(entry.id);

    return {
      id: entry.id,
      game: entry.game,
      date,
      wordPath: entry.wordPath,
      cluePath: entry.cluePath
    };
  });

  return {
    ...index,
    puzzles
  };
}

export async function loadGame1Data() {
  if (!game1DataPromise) {
    game1DataPromise = Promise.all([
      fetchJson(VALID_GUESSES_URL, "valid-guesses.json"),
      fetchJson(ANSWERS_URL, "answers.json"),
      fetchJson(PUZZLE_INDEX_URL, "puzzles/index.json")
    ]).then(([validGuessData, answerData, puzzleIndexData]) => {
      if (!Array.isArray(validGuessData.words)) {
        throw new PuzzleDataError("valid-guesses.json must contain a words array.");
      }

      if (!Array.isArray(answerData.words)) {
        throw new PuzzleDataError("answers.json must contain a words array.");
      }

      const puzzleIndex = validatePuzzleIndex(puzzleIndexData);

      const validWords = new Set(
        validGuessData.words
          .map((word) => String(word).trim().toUpperCase())
          .filter((word) => /^[A-Z]{5}$/.test(word))
      );

      const answerWords = new Set(
        answerData.words
          .map((word) => String(word).trim().toUpperCase())
          .filter((word) => /^[A-Z]{5}$/.test(word))
      );

      return {
        validWords,
        answerWords,
        puzzleIndex
      };
    });

    game1DataPromise.catch(() => {
      game1DataPromise = null;
    });
  }

  return game1DataPromise;
}

export function normalizePuzzleDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new PuzzleDataError("Puzzle date is invalid.");
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return validateDateParts(year, month, day);
  }

  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (!match) {
    throw new PuzzleDataError("Puzzle date must use YYYY-MM-DD format.");
  }

  return validateDateParts(Number(match[1]), match[2], match[3]);
}

function validateDateParts(year, monthText, dayText) {
  const month = Number(monthText);
  const day = Number(dayText);

  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new PuzzleDataError("Puzzle date is not a valid calendar date.");
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new PuzzleDataError("Puzzle date is not a valid calendar date.");
  }

  return (
    String(year).padStart(4, "0") +
    "-" +
    String(month).padStart(2, "0") +
    "-" +
    String(day).padStart(2, "0")
  );
}

export function getTodayDateString() {
  return normalizePuzzleDate(new Date());
}

export function findPublishedPuzzle(puzzles, date, gameId = "game1") {
  const targetDate = normalizePuzzleDate(date);
  const published = puzzles.filter(
    (puzzle) =>
      puzzle &&
      puzzle.game === gameId &&
      puzzle.date === targetDate &&
      puzzle.status === PUZZLE_STATUS.PUBLISHED
  );

  if (published.length > 1) {
    throw new PuzzleDataError(
      "Multiple published " + gameId + " puzzles exist for " + targetDate + "."
    );
  }

  return published[0] || null;
}

export function validateDailyWordRecord(wordRecord, validWords, answerWords, expectedEntry = null) {
  if (!wordRecord || typeof wordRecord !== "object") {
    throw new PuzzleDataError("The daily Game 1 word record is invalid.");
  }

  if (wordRecord.game !== "game1") {
    throw new PuzzleDataError("The daily Game 1 word record has an invalid game identifier.");
  }

  const date = normalizePuzzleDate(wordRecord.date);
  const expectedId = "game1-" + date;

  if (wordRecord.id !== expectedId) {
    throw new PuzzleDataError("Daily word record id must match game1-YYYY-MM-DD.");
  }

  if (expectedEntry) {
    if (date !== expectedEntry.date || wordRecord.id !== expectedEntry.id) {
      throw new PuzzleDataError("Daily word record does not match its puzzle index entry.");
    }
  }

  if (!VALID_PUZZLE_STATUSES.has(wordRecord.status)) {
    throw new PuzzleDataError("Daily word record has an unrecognized status.");
  }

  const answer = String(wordRecord.answer ?? "").trim().toUpperCase();

  if (!/^[A-Z]{5}$/.test(answer)) {
    throw new PuzzleDataError("Daily word record answer must be a five-letter word.");
  }

  if (!(validWords instanceof Set) || !validWords.has(answer)) {
    throw new PuzzleDataError("The daily answer is not in valid-guesses.json.");
  }

  if (!(answerWords instanceof Set) || !answerWords.has(answer)) {
    throw new PuzzleDataError("The daily answer is not in answers.json.");
  }

  return {
    id: wordRecord.id,
    game: "game1",
    date,
    answer,
    status: wordRecord.status
  };
}

export function validateDailyClueRecord(clueRecord, expectedEntry = null) {
  if (!clueRecord || typeof clueRecord !== "object") {
    throw new PuzzleDataError("The daily Game 1 clue record is invalid.");
  }

  if (clueRecord.game !== "game1") {
    throw new PuzzleDataError("The daily Game 1 clue record has an invalid game identifier.");
  }

  const date = normalizePuzzleDate(clueRecord.date);
  const expectedId = "game1-" + date;

  if (clueRecord.id !== expectedId) {
    throw new PuzzleDataError("Daily clue record id must match game1-YYYY-MM-DD.");
  }

  if (expectedEntry) {
    if (date !== expectedEntry.date || clueRecord.id !== expectedEntry.id) {
      throw new PuzzleDataError("Daily clue record does not match its puzzle index entry.");
    }
  }

  if (!Array.isArray(clueRecord.clues) || clueRecord.clues.length !== 5) {
    throw new PuzzleDataError("Daily clue record must contain exactly five clues.");
  }

  if (clueRecord.clues.some((clue) => typeof clue !== "string" || !clue.trim())) {
    throw new PuzzleDataError("Daily clue record contains an empty or invalid clue.");
  }

  return {
    id: clueRecord.id,
    game: "game1",
    date,
    clues: clueRecord.clues.map((clue) => clue.trim())
  };
}

/**
 * Combine one daily word file and one daily clue file into the stable puzzle
 * object consumed by Game 1.
 */
export function combinePuzzleData(date, wordRecord, clueRecord, validWords, answerWords) {
  const targetDate = normalizePuzzleDate(date);

  const word = validateDailyWordRecord(wordRecord, validWords, answerWords);
  const clues = validateDailyClueRecord(clueRecord);

  if (word.date !== targetDate || clues.date !== targetDate) {
    throw new PuzzleDataError("Daily word and clue data do not match " + targetDate + ".");
  }

  if (word.id !== clues.id || word.id !== "game1-" + targetDate) {
    throw new PuzzleDataError("Daily word and clue data do not match the same Game 1 puzzle.");
  }

  return {
    id: "game1-" + targetDate,
    game: "game1",
    date: targetDate,
    answer: word.answer,
    clues: clues.clues,
    status: word.status
  };
}

async function loadPuzzleFromIndexEntry(entry, data) {
  const wordUrl = new URL(entry.wordPath, PUZZLE_DATA_URL);
  const clueUrl = new URL(entry.cluePath, PUZZLE_DATA_URL);

  const [wordRecord, clueRecord] = await Promise.all([
    fetchJson(wordUrl, "word data " + entry.date),
    fetchJson(clueUrl, "clue data " + entry.date)
  ]);

  return combinePuzzleData(
    entry.date,
    validateDailyWordRecord(wordRecord, data.validWords, data.answerWords, entry),
    validateDailyClueRecord(clueRecord, entry),
    data.validWords,
    data.answerWords
  );
}

export async function getPublishedPuzzleForDate(date) {
  const data = await loadGame1Data();
  const targetDate = normalizePuzzleDate(date);

  const entries = data.puzzleIndex.puzzles.filter(
    (entry) => entry.game === "game1" && entry.date === targetDate
  );

  if (entries.length === 0) {
    return null;
  }

  if (entries.length > 1) {
    throw new PuzzleDataError(
      "Multiple Game 1 puzzle index entries exist for " + targetDate + "."
    );
  }

  const puzzle = await loadPuzzleFromIndexEntry(entries[0], data);
  return puzzle.status === PUZZLE_STATUS.PUBLISHED ? puzzle : null;
}

export async function getPublishedPuzzleForToday() {
  return getPublishedPuzzleForDate(getTodayDateString());
}

// Stable service-level name for future backend implementations.
export async function getCurrentGame1Puzzle() {
  return getPublishedPuzzleForToday();
}

export async function getGame1ValidWords() {
  const data = await loadGame1Data();
  return data.validWords;
}
