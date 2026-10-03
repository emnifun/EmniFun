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
const SCHEDULE_PATH_PATTERN = /^schedule\/\d{4}\.json$/;
const CLUE_PATH_PATTERN = /^clues\/\d{4}\.json$/;

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

  return {
    ...index,
    puzzles: index.puzzles.map((entry) => {
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
        throw new PuzzleDataError("The Game 1 puzzle index contains an ambiguous duplicate date or id: " + date + ".");
      }

      if (typeof entry.schedulePath !== "string" || !SCHEDULE_PATH_PATTERN.test(entry.schedulePath)) {
        throw new PuzzleDataError("Puzzle index schedule paths must use schedule/YYYY.json.");
      }

      if (entry.schedulePath !== "schedule/" + year + ".json") {
        throw new PuzzleDataError("Puzzle index schedule path does not match its date.");
      }

      if (typeof entry.cluePath !== "string" || !CLUE_PATH_PATTERN.test(entry.cluePath)) {
        throw new PuzzleDataError("Puzzle index clue paths must use clues/YYYY.json.");
      }

      if (entry.cluePath !== "clues/" + year + ".json") {
        throw new PuzzleDataError("Puzzle index clue path does not match its date.");
      }

      seenDates.add(date);
      seenIds.add(entry.id);

      return {
        id: entry.id,
        game: entry.game,
        date,
        schedulePath: entry.schedulePath,
        cluePath: entry.cluePath
      };
    })
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

    // Allow a later retry if local data failed to load.
    game1DataPromise.catch(() => {
      game1DataPromise = null;
    });
  }

  return game1DataPromise;
}

export function validateScheduleData(scheduleData, year) {
  if (!scheduleData || typeof scheduleData !== "object") {
    throw new PuzzleDataError("The Game 1 answer schedule is invalid.");
  }

  const normalizedYear = String(year);
  if (scheduleData.game !== "game1" || String(scheduleData.year) !== normalizedYear) {
    throw new PuzzleDataError("The Game 1 answer schedule has the wrong game or year.");
  }

  if (!scheduleData.puzzles || typeof scheduleData.puzzles !== "object" || Array.isArray(scheduleData.puzzles)) {
    throw new PuzzleDataError("The Game 1 answer schedule must contain a puzzles object.");
  }

  const puzzles = {};
  for (const [dateKey, entry] of Object.entries(scheduleData.puzzles)) {
    const date = normalizePuzzleDate(dateKey);
    if (date.slice(0, 4) !== normalizedYear) {
      throw new PuzzleDataError("Answer schedule date does not match its year: " + date + ".");
    }

    if (!entry || typeof entry !== "object") {
      throw new PuzzleDataError("Answer schedule entry is invalid for " + date + ".");
    }

    const answer = String(entry.answer ?? "").trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(answer)) {
      throw new PuzzleDataError("Scheduled answer for " + date + " is not a valid five-letter word.");
    }

    if (!VALID_PUZZLE_STATUSES.has(entry.status)) {
      throw new PuzzleDataError("Scheduled puzzle for " + date + " has an invalid status.");
    }

    puzzles[date] = {
      answer,
      status: entry.status
    };
  }

  return { ...scheduleData, year: Number(normalizedYear), puzzles };
}

export function validateClueData(clueData, year) {
  if (!clueData || typeof clueData !== "object") {
    throw new PuzzleDataError("The Game 1 clue data is invalid.");
  }

  const normalizedYear = String(year);
  if (clueData.game !== "game1" || String(clueData.year) !== normalizedYear) {
    throw new PuzzleDataError("The Game 1 clue data has the wrong game or year.");
  }

  if (!clueData.puzzles || typeof clueData.puzzles !== "object" || Array.isArray(clueData.puzzles)) {
    throw new PuzzleDataError("The Game 1 clue data must contain a puzzles object.");
  }

  const puzzles = {};
  for (const [dateKey, entry] of Object.entries(clueData.puzzles)) {
    const date = normalizePuzzleDate(dateKey);
    if (date.slice(0, 4) !== normalizedYear) {
      throw new PuzzleDataError("Clue data date does not match its year: " + date + ".");
    }

    if (!entry || typeof entry !== "object") {
      throw new PuzzleDataError("Clue data entry is invalid for " + date + ".");
    }

    const expectedId = "game1-" + date;
    if (entry.id !== expectedId) {
      throw new PuzzleDataError("Clue data id does not match its date: " + date + ".");
    }

    if (!Array.isArray(entry.clues) || entry.clues.length !== 5) {
      throw new PuzzleDataError("Clue data for " + date + " must contain exactly five clues.");
    }

    if (entry.clues.some((clue) => typeof clue !== "string" || !clue.trim())) {
      throw new PuzzleDataError("Clue data for " + date + " contains an empty or invalid clue.");
    }

    puzzles[date] = {
      id: expectedId,
      clues: entry.clues.map((clue) => clue.trim())
    };
  }

  return { ...clueData, year: Number(normalizedYear), puzzles };
}

export function combinePuzzleData(date, scheduleEntry, clueEntry, validWords, answerWords) {
  const targetDate = normalizePuzzleDate(date);

  if (!scheduleEntry || typeof scheduleEntry !== "object") {
    throw new PuzzleDataError("Scheduled answer is missing for " + targetDate + ".");
  }

  const answer = String(scheduleEntry.answer ?? "").trim().toUpperCase();
  if (!answer) {
    throw new PuzzleDataError("Scheduled answer is missing for " + targetDate + ".");
  }

  if (!VALID_PUZZLE_STATUSES.has(scheduleEntry.status)) {
    throw new PuzzleDataError("Scheduled puzzle for " + targetDate + " has an invalid status.");
  }

  if (!clueEntry || typeof clueEntry !== "object") {
    throw new PuzzleDataError("Clue data is missing for " + targetDate + ".");
  }

  if (clueEntry.id !== "game1-" + targetDate) {
    throw new PuzzleDataError("Clue data is attached to the wrong puzzle date: " + targetDate + ".");
  }

  if (!Array.isArray(clueEntry.clues) || clueEntry.clues.length !== 5) {
    throw new PuzzleDataError("Clue data for " + targetDate + " must contain exactly five clues.");
  }

  return validatePuzzleRecord(
    {
      id: "game1-" + targetDate,
      game: "game1",
      date: targetDate,
      answer,
      clues: clueEntry.clues,
      status: scheduleEntry.status
    },
    validWords,
    answerWords
  );
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

  return String(year).padStart(4, "0") + "-" +
    String(month).padStart(2, "0") + "-" +
    String(day).padStart(2, "0");
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

export function validatePuzzleRecord(puzzle, validWords, answerWords, expectedEntry = null) {
  if (!puzzle || typeof puzzle !== "object") {
    throw new PuzzleDataError("The selected puzzle record is invalid.");
  }

  if (puzzle.game !== "game1") {
    throw new PuzzleDataError("The selected puzzle is not a Game 1 puzzle.");
  }

  const date = normalizePuzzleDate(puzzle.date);
  const expectedId = "game1-" + date;

  if (puzzle.id !== expectedId) {
    throw new PuzzleDataError("Puzzle id must match game1-YYYY-MM-DD.");
  }

  if (!VALID_PUZZLE_STATUSES.has(puzzle.status)) {
    throw new PuzzleDataError("The selected puzzle has an unrecognized status.");
  }

  if (expectedEntry) {
    if (puzzle.id !== expectedEntry.id || date !== expectedEntry.date) {
      throw new PuzzleDataError("Puzzle record does not match its archive index entry.");
    }
  }

  if (!/^[A-Z]{5}$/.test(String(puzzle.answer ?? "").trim().toUpperCase())) {
    throw new PuzzleDataError("The selected puzzle has an invalid five-letter answer.");
  }

  const answer = String(puzzle.answer).trim().toUpperCase();

  if (!(validWords instanceof Set) || !validWords.has(answer)) {
    throw new PuzzleDataError("The puzzle answer is not in valid-guesses.json.");
  }

  if (!(answerWords instanceof Set) || !answerWords.has(answer)) {
    throw new PuzzleDataError("The puzzle answer is not in answers.json.");
  }

  if (!Array.isArray(puzzle.clues) || puzzle.clues.length !== 5) {
    throw new PuzzleDataError("The selected puzzle must contain exactly five clues.");
  }

  if (puzzle.clues.some((clue) => typeof clue !== "string" || !clue.trim())) {
    throw new PuzzleDataError("The selected puzzle contains an empty or invalid clue.");
  }

  return {
    ...puzzle,
    date,
    answer,
    clues: puzzle.clues.map((clue) => clue.trim())
  };
}

async function loadPuzzleFromIndexEntry(entry, data) {
  const scheduleUrl = new URL(entry.schedulePath, PUZZLE_DATA_URL);
  const clueUrl = new URL(entry.cluePath, PUZZLE_DATA_URL);

  const [scheduleDataRaw, clueDataRaw] = await Promise.all([
    fetchJson(scheduleUrl, "answer schedule " + entry.schedulePath),
    fetchJson(clueUrl, "clue data " + entry.cluePath)
  ]);

  const year = entry.date.slice(0, 4);
  const scheduleData = validateScheduleData(scheduleDataRaw, year);
  const clueData = validateClueData(clueDataRaw, year);
  const scheduleEntry = scheduleData.puzzles[entry.date];
  const clueEntry = clueData.puzzles[entry.date];

  return combinePuzzleData(
    entry.date,
    scheduleEntry,
    clueEntry,
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
    throw new PuzzleDataError("Multiple Game 1 puzzle index entries exist for " + targetDate + ".");
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
