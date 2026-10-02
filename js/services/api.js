/**
 * Data service boundary for EmniFun.
 *
 * Game code should ask this service for puzzle/user data instead of talking
 * directly to a database. In Phase 1 there is no backend, so these functions
 * are placeholders for the future API.
 */

export async function getPuzzle(gameId, puzzleDate) {
  // Future: request a published puzzle from the backend/API.
  void gameId;
  void puzzleDate;
  return null;
}

export async function saveGameResult(gameId, result) {
  // Future: send a completed game result to the backend.
  void gameId;
  void result;
  return null;
}
