/**
 * Data service boundary.
 *
 * Today this returns local prototype data. Later it can call a real API
 * without making the game UI or rules understand the database.
 */
import { game1Puzzle } from "../games/game1/game1-data.js";

export async function getPuzzle(gameId, puzzleDate) {
  if (gameId === "game1" && puzzleDate === game1Puzzle.date) return game1Puzzle;
  return null;
}

export async function saveGameResult(gameId, result) {
  // Future: send the result to the backend.
  void gameId;
  void result;
  return null;
}
