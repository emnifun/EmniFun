/**
 * Statistics boundary.
 *
 * Statistics are intentionally designed around a gameId so each game can have
 * independent statistics later (for example, Game 1 and Game 2 need not share
 * the same scoring rules).
 */

export function createEmptyGameStatistics(gameId) {
  return {
    gameId,
    currentStreak: 0,
    longestStreak: 0,
    totalGames: 0,
    averageGuesses: null,
    cluesUsed: 0
  };
}

export function getGameStatistics(gameId) {
  // Future: load this game's statistics from the backend.
  return createEmptyGameStatistics(gameId);
}
