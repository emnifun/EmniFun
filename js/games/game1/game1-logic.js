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

export const FIVEWINK_MODES = Object.freeze({
  DEFAULT: "default",
  HARD1: "hard1",
  HARD2: "hard2",
  HARD3: "hard3"
});

export const ALLOWED_GAMEPLAY_MODES = new Set([
  FIVEWINK_MODES.DEFAULT,
  FIVEWINK_MODES.HARD1
]);

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
    answer: null,
    mode: FIVEWINK_MODES.DEFAULT,
    modeLocked: false
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

  if (response.mode) {
    state.mode = response.mode;
  }
  state.modeLocked = true;

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
  if (response.mode) {
    state.mode = response.mode;
  }
  state.modeLocked = true;

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
  state.mode = FIVEWINK_MODES.DEFAULT;
  state.modeLocked = true;

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
  if (response.mode) {
    state.mode = response.mode;
  }
  state.modeLocked = true;

  return { ok: true };
}

export function buildPlayerHistoryRecord(state, puzzle) {
  return {
    puzzleDate: puzzle.date,
    game: puzzle.game,
    result: state.result,
    attemptsUsed: state.guesses.filter(Boolean).length,
    cluesUsed: state.cluesUsed,
    seventhGuessUsed: state.seventhGuessUsed,
    mode: state.mode || "default"
  };
}

/**
 * Restore game state for active resumed or read-only completed puzzles.
 * Populates state.attempts, state.guesses, and state.feedback using authoritative evaluations.
 */
export function restoreGame1State(state, data) {
  if (!state || !data) return { ok: false, message: "Invalid restoration payload." };

  if (Array.isArray(data.attempts)) {
    let guessIndex = 0;
    data.attempts.forEach((att, rowIdx) => {
      if (rowIdx >= 0 && rowIdx < GAME1_CONFIG.normalAttempts) {
        state.attempts[rowIdx] = att || null;
        if (att === "guess") {
          const rawGuess = Array.isArray(data.guesses) ? data.guesses[guessIndex] : null;
          if (rawGuess) {
            const norm = normalizeGuess(rawGuess);
            state.guesses[rowIdx] = norm;
            state.usedGuesses.add(norm);
          }
          const evalItem = Array.isArray(data.evaluations) ? data.evaluations[guessIndex] : null;
          if (Array.isArray(evalItem) && evalItem.length === 5) {
            state.feedback[rowIdx] = evalItem;
          }
          guessIndex += 1;
        } else {
          state.guesses[rowIdx] = null;
          state.feedback[rowIdx] = null;
        }
      }
    });
  } else if (Array.isArray(data.guesses)) {
    // Fallback if attempts array is unavailable
    data.guesses.forEach((g, idx) => {
      if (g && idx >= 0 && idx < GAME1_CONFIG.normalAttempts) {
        const norm = normalizeGuess(g);
        state.attempts[idx] = "guess";
        state.guesses[idx] = norm;
        state.usedGuesses.add(norm);
        const evalItem = Array.isArray(data.evaluations) ? data.evaluations[idx] : null;
        if (Array.isArray(evalItem) && evalItem.length === 5) {
          state.feedback[idx] = evalItem;
        }
      }
    });
  }

  if (Array.isArray(data.cluesState)) {
    state.clues = data.cluesState.slice(0, GAME1_CONFIG.clueCount);
  }

  state.cluesUsed = Number(data.cluesUsed) || 0;

  if (data.status) {
    state.status = data.status;
  }

  if (data.result) {
    state.result = data.result;
  }

  if (data.answer) {
    state.answer = normalizeGuess(data.answer);
  }

  if (data.seventhGuess) {
    state.guesses[GAME1_CONFIG.normalAttempts] = normalizeGuess(data.seventhGuess);
    state.seventhGuessUsed = true;
    if (data.seventhEvaluation && Array.isArray(data.seventhEvaluation)) {
      state.feedback[GAME1_CONFIG.normalAttempts] = data.seventhEvaluation;
    }
  }

  if (data.mode) {
    state.mode = data.mode;
  }

  const hasActions = isSessionLocked(state);

  state.modeLocked = Boolean(
    data.modeLocked !== undefined ? data.modeLocked : hasActions
  );

  return { ok: true };
}

export function isSessionLocked(state) {
  if (!state) return false;
  const hasAttemptAction = Array.isArray(state.attempts) && state.attempts.some((val) => val !== null);
  const hasGuesses = Array.isArray(state.guesses) && state.guesses.filter(Boolean).length > 0;
  const hasCluesUsed = Number(state.cluesUsed || 0) > 0;
  const isNotPlaying = state.status !== "playing";
  return hasAttemptAction || hasGuesses || hasCluesUsed || isNotPlaying;
}

/**
 * Validate a candidate guess against Hard Mode: Strict (Hard Mode 1) rules.
 *
 * Rules:
 * 1. Blue letters (status === "correct"):
 *    Any position confirmed blue in a previous guess must have the exact same
 *    letter in that position in every subsequent guess.
 * 2. Orange letters (status === "wrong-position"):
 *    A letter confirmed orange in a previous guess cannot be placed in any position
 *    where it was confirmed orange.
 * 3. Duplicate-letter and presence correctness:
 *    Any letter confirmed orange or blue must be present in the new guess.
 *    If a previous guess confirmed multiple occurrences of a letter (e.g. 2 E's
 *    as blue or orange), the new guess must contain at least that many occurrences.
 */
export function checkHardMode1Constraints(guess, previousGuesses, previousEvaluations) {
  const normalizedGuess = normalizeGuess(guess);
  if (!isEnglishFiveLetterWord(normalizedGuess)) {
    return { valid: false, message: "Enter a five-letter word." };
  }

  if (!Array.isArray(previousGuesses) || !Array.isArray(previousEvaluations)) {
    return { valid: true };
  }

  const letterCountsInNewGuess = {};
  for (const char of normalizedGuess) {
    letterCountsInNewGuess[char] = (letterCountsInNewGuess[char] || 0) + 1;
  }

  // 1. Blue letters (correct in exact position: lowest position index first)
  for (let pos = 0; pos < 5; pos += 1) {
    for (let gIdx = 0; gIdx < previousGuesses.length; gIdx += 1) {
      const prevWord = previousGuesses[gIdx];
      const prevEval = previousEvaluations[gIdx];
      if (!prevWord || !Array.isArray(prevEval)) continue;

      if (prevEval[pos] === "correct") {
        const requiredLetter = prevWord[pos];
        if (normalizedGuess[pos] !== requiredLetter) {
          return {
            valid: false,
            message: `Position ${pos + 1} must be ${requiredLetter}.`
          };
        }
      }
    }
  }

  // 2. Orange letters (wrong position: cannot be placed in the same position, lowest position index first)
  for (let pos = 0; pos < 5; pos += 1) {
    for (let gIdx = 0; gIdx < previousGuesses.length; gIdx += 1) {
      const prevWord = previousGuesses[gIdx];
      const prevEval = previousEvaluations[gIdx];
      if (!prevWord || !Array.isArray(prevEval)) continue;

      if (prevEval[pos] === "wrong-position") {
        const orangeLetter = prevWord[pos];
        if (normalizedGuess[pos] === orangeLetter) {
          return {
            valid: false,
            message: `Letter ${orangeLetter} cannot be in position ${pos + 1}.`
          };
        }
      }
    }
  }

  // 3. Orange / Blue presence and duplicate-letter counts
  // For each letter, find the maximum confirmed count in any single previous guess
  const maxConfirmedCounts = {};
  for (let gIdx = 0; gIdx < previousGuesses.length; gIdx += 1) {
    const prevWord = previousGuesses[gIdx];
    const prevEval = previousEvaluations[gIdx];
    if (!prevWord || !Array.isArray(prevEval)) continue;

    const countsInThisGuess = {};
    for (let pos = 0; pos < 5; pos += 1) {
      if (prevEval[pos] === "correct" || prevEval[pos] === "wrong-position") {
        const char = prevWord[pos];
        countsInThisGuess[char] = (countsInThisGuess[char] || 0) + 1;
      }
    }

    for (const [char, count] of Object.entries(countsInThisGuess)) {
      maxConfirmedCounts[char] = Math.max(maxConfirmedCounts[char] || 0, count);
    }
  }

  for (const [char, reqCount] of Object.entries(maxConfirmedCounts)) {
    const actualCount = letterCountsInNewGuess[char] || 0;
    if (actualCount < reqCount) {
      if (reqCount === 1) {
        return {
          valid: false,
          message: `Guess must contain ${char}.`
        };
      }
      return {
        valid: false,
        message: `Guess must contain at least ${reqCount} of letter ${char}.`
      };
    }
  }

  return { valid: true };
}
