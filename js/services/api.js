/**
 * EmniFun backend API boundary.
 *
 * FiveWink gameplay calls the Cloudflare Worker for authoritative puzzle
 * validation. No answer data is returned until the game has legitimately ended.
 */

const FIVEWINK_API_BASE =
  "https://emnifun.emnifun.workers.dev/api/fivewink";

export class FiveWinkApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "FiveWinkApiError";
    this.status = status;
  }
}

async function requestJson(path, options = {}) {
  let response;

  try {
    response = await fetch(FIVEWINK_API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new FiveWinkApiError(
      "FiveWink could not reach the game server."
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new FiveWinkApiError(
      "FiveWink received an invalid server response.",
      response.status
    );
  }

  if (!response.ok || data?.ok === false) {
    throw new FiveWinkApiError(
      data?.message || "FiveWink could not complete that action.",
      response.status
    );
  }

  return data;
}

export async function getFiveWinkPuzzle() {
  return requestJson("/puzzle");
}

export async function submitFiveWinkGuess({
  puzzleId,
  guess,
  gameToken
}) {
  return requestJson("/guess", {
    method: "POST",
    body: JSON.stringify({
      puzzleId,
      guess,
      gameToken
    })
  });
}

export async function useFiveWinkClue({
  puzzleId,
  clueNumber,
  gameToken
}) {
  return requestJson("/clue", {
    method: "POST",
    body: JSON.stringify({
      puzzleId,
      clueNumber,
      gameToken
    })
  });
}

export async function skipFiveWinkSeventh({
  puzzleId,
  gameToken
}) {
  return requestJson("/skip", {
    method: "POST",
    body: JSON.stringify({
      puzzleId,
      gameToken
    })
  });
}

/**
 * Existing result-save seam is intentionally preserved for the later
 * statistics/account backend phase.
 */
export async function saveGameResult(gameId, result) {
  void gameId;
  void result;
  return null;
}
