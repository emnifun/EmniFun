/**
 * Game 1 puzzle/data service.
 *
 * This is the only place that knows where the local JSON files live.
 * Later, these functions can call a backend API instead.
 */

const VALID_GUESSES_URL = new URL("../../data/game1/valid-guesses.json", import.meta.url);
const ANSWERS_URL = new URL("../../data/game1/answers.json", import.meta.url);
const PUZZLES_URL = new URL("../../data/game1/puzzles.json", import.meta.url);

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

export async function loadGame1Data() {
  if (!game1DataPromise) {
    game1DataPromise = Promise.all([
      fetchJson(VALID_GUESSES_URL, "valid-guesses.json"),
      fetchJson(ANSWERS_URL, "answers.json"),
      fetchJson(PUZZLES_URL, "puzzles.json")
    ]).then(([validGuessData, answerData, puzzleData]) => {
      if (!Array.isArray(validGuessData.words)) {
        throw new PuzzleDataError("valid-guesses.json must contain a words array.");
      }
      if (!Array.isArray(answerData.words)) {
        throw new PuzzleDataError("answers.json must contain a words array.");
      }
      if (!Array.isArray(puzzleData.puzzles)) {
        throw new PuzzleDataError("puzzles.json must contain a puzzles array.");
      }

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
        puzzles: puzzleData.puzzles
      };
    });

    // Allow a later retry if local data failed to load.
    game1DataPromise.catch(() => {
      game1DataPromise = null;
    });
  }

  return game1DataPromise;
}

export function normalizePuzzleDate(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new PuzzleDataError("Puzzle date must use YYYY-MM-DD format.");
  }
  return normalized;
}

export function getTodayDateString() {
  return normalizePuzzleDate(new Date());
}

export function findPublishedPuzzle(puzzles, date, gameId = "game1") {
  const targetDate = normalizePuzzleDate(date);
  return puzzles.find(
    (puzzle) =>
      puzzle &&
      puzzle.game === gameId &&
      puzzle.date === targetDate &&
      puzzle.status === "published"
  ) || null;
}

export function validatePuzzleRecord(puzzle, validWords, answerWords) {
  if (!puzzle || typeof puzzle !== "object") {
    throw new PuzzleDataError("The selected puzzle record is invalid.");
  }

  if (puzzle.game !== "game1") {
    throw new PuzzleDataError("The selected puzzle is not a Game 1 puzzle.");
  }

  if (!/^[A-Z]{5}$/.test(String(puzzle.answer ?? "").trim().toUpperCase())) {
    throw new PuzzleDataError("The selected puzzle has an invalid five-letter answer.");
  }

  const answer = String(puzzle.answer).trim().toUpperCase();

  if (!validWords.has(answer)) {
    throw new PuzzleDataError("The puzzle answer is not in valid-guesses.json.");
  }

  if (!answerWords.has(answer)) {
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
    answer,
    clues: puzzle.clues.map((clue) => clue.trim())
  };
}

export async function getPublishedPuzzleForDate(date) {
  const data = await loadGame1Data();
  const puzzle = findPublishedPuzzle(data.puzzles, date, "game1");

  if (!puzzle) {
    return null;
  }

  return validatePuzzleRecord(puzzle, data.validWords, data.answerWords);
}

export async function getPublishedPuzzleForToday() {
  return getPublishedPuzzleForDate(getTodayDateString());
}

export async function getGame1ValidWords() {
  const data = await loadGame1Data();
  return data.validWords;
}
