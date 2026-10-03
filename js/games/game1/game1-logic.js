/**
 * FiveWink client-side gameplay state helpers.
 *
 * The client does not know the answer and does not evaluate guesses.
 * The Cloudflare Worker is authoritative for puzzle validation and feedback.
 */

export const GAME1_RESULT = Object.freeze({
  SOLVED: "SOLVED",
  FAILED_CLOSE: "FAILED_CLOSE",
  FAILED_HARD: "FAILED_HARD"
});

export const GAME1_CONFIG = Object.freeze({
  normalAttempts: 6,
  clueCount: 5,
  seventhAttemptCloseRule: "exact-answer"
});

export function createGame1State() {
  const state = {
    attempts: Array(GAME1_CONFIG.normalAttempts).fill(null),
    guesses: Array(GAME1_CONFIG.normalAttempts).fill(null),
    feedback: Array(GAME1_CONFIG.normalAttempts).fill(null),
    clues: Array(GAME1_CONFIG.clueCount).fill("available"),
    cluesUsed: 0,
    usedGuesses: new Set(),
    seventhGuessUsed: false,
    status: "playing",
    result: null,
    answer: null
  };

  Object.defineProperty(state, "attemptNumber", {
    enumerable: true,
    get() {
      const nextIndex = getNextNormalAttemptIndex(this);
      return nextIndex === -1
        ? GAME1_CONFIG.normalAttempts + 1
        : nextIndex + 1;
    }
  });

  return state;
}

export function getNextNormalAttemptIndex(state) {
  if (!state || !Array.isArray(state.attempts)) return -1;
  return state.attempts.findIndex((slot) => slot === null);
}

export function normalizeGuess(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function sanitizeGuessInput(value) {
  return normalizeGuess(value).replace(/[^A-Z]/g, "").slice(0, 5);
}

export function isEnglishFiveLetterWord(guess) {
  return /^[A-Z]{5}$/.test(normalizeGuess(guess));
}

export function isGuessAlreadyUsed(state, guess) {
  const normalized = normalizeGuess(guess);
  return state?.usedGuesses instanceof Set &&
    state.usedGuesses.has(normalized);
}

function skipClueForAttempt(state, attemptIndex) {
  if (
    attemptIndex >= 0 &&
    attemptIndex < GAME1_CONFIG.clueCount &&
    state.clues[attemptIndex] === "available"
  ) {
    state.clues[attemptIndex] = "skipped";
  }
}

/**
 * Apply an authoritative Worker response for a normal guess to the local UI state.
 */
export function applyNormalGuessResult(state, guess, response) {
  if (!state || !response?.ok) {
    return { ok: false, message: response?.message || "Guess could not be submitted." };
  }

  const normalized = normalizeGuess(guess);
  const attemptIndex = Number.isInteger(response.attemptIndex)
    ? response.attemptIndex
    : getNextNormalAttemptIndex(state);

  if (
    attemptIndex < 0 ||
    attemptIndex >= GAME1_CONFIG.normalAttempts ||
    !Array.isArray(response.feedback) ||
    response.feedback.length !== 5
  ) {
    return { ok: false, message: "The backend returned an invalid game state." };
  }

  state.usedGuesses.add(normalized);
  state.attempts[attemptIndex] = "guess";
  state.guesses[attemptIndex] = normalized;
  state.feedback[attemptIndex] = response.feedback;
  skipClueForAttempt(state, attemptIndex);

  if (response.solved) {
    state.status = "finished";
    state.result = GAME1_RESULT.SOLVED;
    state.answer = response.answer ? normalizeGuess(response.answer) : null;
  } else if (response.seventhStage) {
    state.status = "awaiting-seventh";
  } else {
    state.status = "playing";
  }

  return { ok: true };
}

/**
 * Apply an authoritative Worker response for the optional seventh guess.
 */
export function applySeventhGuessResult(state, guess, response) {
  if (!state || !response?.ok) {
    return { ok: false, message: response?.message || "Guess could not be submitted." };
  }

  if (
    !Array.isArray(response.feedback) ||
    response.feedback.length !== 5 ||
    ![GAME1_RESULT.FAILED_CLOSE, GAME1_RESULT.FAILED_HARD].includes(response.result)
  ) {
    return { ok: false, message: "The backend returned an invalid game state." };
  }

  const normalized = normalizeGuess(guess);
  state.status = "finished";
  state.result = response.result;
  state.answer = response.answer ? normalizeGuess(response.answer) : null;
  state.seventhGuessUsed = true;

  state.usedGuesses.add(normalized);
  state.guesses.push(normalized);
  state.feedback.push(response.feedback);

  return { ok: true };
}

/**
 * Apply an authoritative Worker response for a clue action.
 */
export function applyClueResult(state, clueNumber) {
  if (
    !Number.isInteger(clueNumber) ||
    clueNumber < 1 ||
    clueNumber > GAME1_CONFIG.clueCount
  ) {
    return { ok: false, message: "That clue does not exist." };
  }

  const attemptIndex = clueNumber - 1;
  if (
    state.status !== "playing" ||
    getNextNormalAttemptIndex(state) !== attemptIndex ||
    state.clues[attemptIndex] !== "available"
  ) {
    return { ok: false, message: "That clue is not available on this attempt." };
  }

  state.attempts[attemptIndex] = "clue";
  state.clues[attemptIndex] = "used";
  state.cluesUsed += 1;

  return { ok: true };
}

export function applySeventhSkipResult(state, response) {
  if (!state || !response?.ok) {
    return { ok: false, message: response?.message || "The final guess could not be skipped." };
  }

  if (response.result !== GAME1_RESULT.FAILED_HARD || !response.answer) {
    return { ok: false, message: "The backend returned an invalid game state." };
  }

  state.status = "finished";
  state.result = GAME1_RESULT.FAILED_HARD;
  state.answer = normalizeGuess(response.answer);
  state.seventhGuessUsed = false;

  return { ok: true };
}

export function buildPlayerHistoryRecord(state, puzzle) {
  return {
    puzzleDate: puzzle.date,
    game: puzzle.game,
    result: state.result,
    attemptsUsed: state.guesses.filter(Boolean).length,
    cluesUsed: state.cluesUsed,
    seventhGuessUsed: state.seventhGuessUsed
  };
}
