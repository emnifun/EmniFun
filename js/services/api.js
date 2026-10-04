/**
 * EmniFun backend API boundary.
 *
 * FiveWink gameplay remains separate from account authentication. Auth calls
 * use an HttpOnly cookie session and never reuse the FiveWink game token.
 */

const FIVEWINK_API_BASE =
  "https://emnifun.emnifun.workers.dev/api/fivewink";
const AUTH_API_BASE =
  "https://emnifun.emnifun.workers.dev/api";

export class FiveWinkApiError extends Error {
  constructor(message, status = 0, options = {}) {
    super(message);
    this.name = "FiveWinkApiError";
    this.status = status;
    this.duplicate = Boolean(options.duplicate);
  }
}

export class AuthApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "AuthApiError";
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
      response.status,
      { duplicate: data?.duplicate }
    );
  }

  return data;
}

async function requestAuthJson(path, options = {}) {
  let response;

  try {
    response = await fetch(AUTH_API_BASE + path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new AuthApiError(
      "EmniFun could not reach the authentication server."
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new AuthApiError(
      "EmniFun received an invalid authentication response.",
      response.status
    );
  }

  if (!response.ok || data?.ok === false) {
    throw new AuthApiError(
      data?.message || "Authentication could not be completed.",
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

export async function getAuthGoogleChallenge(nonce = null) {
  const query = nonce ? `?nonce=${encodeURIComponent(nonce)}` : "";
  return requestAuthJson(`/auth/google/challenge${query}`, {
    method: "GET",
    headers: {}
  });
}

export async function postGoogleAuth({ challengeId, credential }) {
  return requestAuthJson("/auth/google", {
    method: "POST",
    body: JSON.stringify({ challengeId, credential })
  });
}

export async function postRegisterAccount({
  registrationChallenge,
  gamerTag
}) {
  return requestAuthJson("/auth/register", {
    method: "POST",
    body: JSON.stringify({ registrationChallenge, gamerTag })
  });
}

export async function getCurrentAccount() {
  return requestAuthJson("/auth/me", {
    method: "GET",
    headers: {}
  });
}

export async function postLogout() {
  return requestAuthJson("/auth/logout", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function postRecoveryVerify({ gamerTag, recoveryKey, googleNonce }) {
  return requestAuthJson("/auth/recovery/verify", {
    method: "POST",
    body: JSON.stringify({ gamerTag, recoveryKey, googleNonce })
  });
}

export async function postRecoveryComplete({
  recoveryChallenge,
  credential
}) {
  return requestAuthJson("/auth/recovery/complete", {
    method: "POST",
    body: JSON.stringify({ recoveryChallenge, credential })
  });
}

export async function getAccountVault() {
  return requestAuthJson("/account/vault", {
    method: "GET",
    headers: {}
  });
}

/**
 * Existing result-save seam is intentionally preserved for the later
 * statistics/game-history backend phase.
 */
export async function saveGameResult(gameId, result) {
  void gameId;
  void result;
  return null;
}