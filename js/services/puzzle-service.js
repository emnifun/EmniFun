/**
 * FiveWink puzzle/data service.
 *
 * The UI talks to this service and does not know where puzzle data is stored.
 * Production gameplay data now comes from the Cloudflare Worker.
 */

import { getFiveWinkPuzzle } from "./api.js";

export const PUZZLE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
  ARCHIVED: "archived"
});

export class PuzzleDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "PuzzleDataError";
  }
}

export async function getPublishedPuzzleForToday() {
  try {
    const response = await getFiveWinkPuzzle();

    if (
      !response?.puzzleId ||
      response.date == null ||
      response.length !== 5 ||
      !Array.isArray(response.clues) ||
      response.clues.length !== 5 ||
      (typeof response.gameToken !== "string" && !response.completed)
    ) {
      throw new PuzzleDataError("The FiveWink backend returned invalid puzzle data.");
    }

    const resultObj = {
      id: response.puzzleId,
      game: "game1",
      date: response.date,
      clues: response.clues,
      gameToken: response.gameToken || null,
      resumed: Boolean(response.resumed),
      completed: Boolean(response.completed),
      alreadyPlayed: Boolean(response.alreadyPlayed),
      result: response.result || null,
      attempts: response.attempts || null,
      guesses: response.guesses || null,
      evaluations: response.evaluations || null,
      cluesState: response.cluesState || null,
      cluesUsed: response.cluesUsed || 0,
      seventhGuess: response.seventhGuess || null,
      seventhEvaluation: response.seventhEvaluation || null,
      status: response.status || null,
      mode: response.mode || "default",
      modeLocked: Boolean(response.modeLocked)
    };

    if (response.answer) {
      resultObj.answer = response.answer;
    }

    return resultObj;
  } catch (error) {
    if (error instanceof PuzzleDataError) throw error;

    const err = new PuzzleDataError(
      error?.message || "FiveWink puzzle data could not be loaded."
    );
    err.alreadyPlayed = Boolean(error?.alreadyPlayed);
    err.completedData = error?.completedData || null;
    throw err;
  }
}

export async function getCurrentGame1Puzzle() {
  return getPublishedPuzzleForToday();
}
