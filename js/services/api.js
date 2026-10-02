/**
 * Future backend API boundary.
 *
 * The prototype still uses local JSON. Keeping this module as the public API
 * seam means the game can switch to a server later without changing its UI.
 */
import { getPublishedPuzzleForDate } from "./puzzle-service.js";

export async function getPuzzle(gameId, puzzleDate) {
  if (gameId !== "game1") return null;
  return getPublishedPuzzleForDate(puzzleDate);
}

export async function saveGameResult(gameId, result) {
  // Future: send the result to the backend.
  void gameId;
  void result;
  return null;
}
