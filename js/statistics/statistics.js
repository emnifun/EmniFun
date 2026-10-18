/**
 * Game-specific statistics. Prototype storage is in memory only.
 * A later API/backend can persist the same shape.
 */
const statisticsByGame = new Map();

export function createEmptyGameStatistics(gameId) {
  return {
    gameId,
    currentStreak: 0,
    longestStreak: 0,
    totalGames: 0,
    solved: 0,
    failedClose: 0,
    failedHard: 0,
    averageGuesses: 0,
    cluesUsed: 0
  };
}

export function getGameStatistics(gameId) {
  if (!statisticsByGame.has(gameId)) {
    statisticsByGame.set(gameId, createEmptyGameStatistics(gameId));
  }
  return statisticsByGame.get(gameId);
}

export function recordGameResult(gameId, record) {
  const stats = getGameStatistics(gameId);
  const previousGames = stats.totalGames;

  stats.totalGames += 1;
  stats.cluesUsed += record.cluesUsed || 0;

  if (record.result === "SOLVED") {
    stats.solved += 1;
    stats.currentStreak += 1;
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  } else if (record.result === "FAILED_CLOSE") {
    stats.failedClose += 1;
    stats.currentStreak = 0;
  } else if (record.result === "FAILED_HARD") {
    stats.failedHard += 1;
    stats.currentStreak = 0;
  }

  stats.averageGuesses = Number(
    (((stats.averageGuesses * previousGames) + record.attemptsUsed) / stats.totalGames).toFixed(2)
  );

  return stats;
}
