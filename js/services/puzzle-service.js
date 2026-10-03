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
      typeof response.gameToken !== "string"
    ) {
      throw new PuzzleDataError("The FiveWink backend returned invalid puzzle data.");
    }

    return {
      id: response.puzzleId,
      game: "game1",
      date: response.date,
      clues: response.clues,
      gameToken: response.gameToken
    };
  } catch (error) {
    if (error instanceof PuzzleDataError) throw error;

    throw new PuzzleDataError(
      error?.message || "FiveWink puzzle data could not be loaded."
    );
  }
}

export async function getCurrentGame1Puzzle() {
  return getPublishedPuzzleForToday();
}
