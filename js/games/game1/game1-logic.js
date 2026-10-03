/**
 * Game 1 rules. UI code never belongs here.
 *
 * The word vocabulary is supplied by the data service. This module does not
 * know where the vocabulary or puzzle answer came from.
 */

export const GAME1_RESULT = Object.freeze({
  SOLVED: "SOLVED",
  FAILED_CLOSE: "FAILED_CLOSE",
  FAILED_HARD: "FAILED_HARD"
});

export const GAME1_CONFIG = Object.freeze({
  normalAttempts: 6,
  clueCount: 5,
  // Configurable 7th-stage rule. The exact answer is still a failure result.
  seventhAttemptCloseRule: "exact-answer"
});

export function createGame1State(validWords = new Set()) {
  const state = {
    // Authoritative regular-attempt state. Each slot is null, "clue", or "guess".
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
    validWords
  };

  // Derived helper for compatibility/readability. The attempts array remains
  // the single source of truth for the active regular row.
  Object.defineProperty(state, "attemptNumber", {
    enumerable: true,
    get() {
      const nextIndex = getNextNormalAttemptIndex(this);
      return nextIndex === -1 ? GAME1_CONFIG.normalAttempts + 1 : nextIndex + 1;
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

export function isValidGuess(guess, validWords) {
  const normalized = normalizeGuess(guess);
  return isEnglishFiveLetterWord(normalized) &&
    validWords instanceof Set &&
    validWords.has(normalized);
}

export function isGuessAlreadyUsed(state, guess) {
  const normalized = normalizeGuess(guess);
  return state?.usedGuesses instanceof Set && state.usedGuesses.has(normalized);
}

function validateNewGuess(state, guess) {
  const normalized = normalizeGuess(guess);

  if (!isEnglishFiveLetterWord(normalized)) {
    return { ok: false, message: "Not a valid word." };
  }

  if (isGuessAlreadyUsed(state, normalized)) {
    return {
      ok: false,
      duplicate: true,
      message: "Already guessed! Try another."
    };
  }

  if (!isValidGuess(normalized, state.validWords)) {
    return { ok: false, message: "Not a valid word." };
  }

  return { ok: true, word: normalized };
}

/**
 * Two passes ensure duplicate letters are counted correctly.
 */
export function evaluateGuess(guess, answer) {
  const word = normalizeGuess(guess);
  const target = normalizeGuess(answer);
  const result = Array(word.length).fill("absent");
  const remaining = {};

  for (const letter of target) remaining[letter] = (remaining[letter] || 0) + 1;

  for (let i = 0; i < word.length; i += 1) {
    if (word[i] === target[i]) {
      result[i] = "correct";
      remaining[word[i]] -= 1;
    }
  }

  for (let i = 0; i < word.length; i += 1) {
    if (result[i] === "correct") continue;
    const letter = word[i];
    if ((remaining[letter] || 0) > 0) {
      result[i] = "wrong-position";
      remaining[letter] -= 1;
    }
  }

  return result;
}

export function useClue(state, clueNumber) {
  if (state.status !== "playing") return { ok: false, message: "The game has ended." };

  if (
    !Number.isInteger(clueNumber) ||
    clueNumber < 1 ||
    clueNumber > GAME1_CONFIG.clueCount
  ) {
    return { ok: false, message: "That clue does not exist." };
  }

  const attemptIndex = clueNumber - 1;

  if (state.clues[attemptIndex] !== "available") {
    return { ok: false, message: "That clue is no longer available." };
  }

  if (state.attempts[attemptIndex] !== null) {
    return { ok: false, message: "That attempt has already been used." };
  }

  // A clue permanently consumes its associated regular attempt row.
  state.attempts[attemptIndex] = "clue";
  state.clues[attemptIndex] = "used";
  state.cluesUsed += 1;

  return { ok: true };
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

export function submitNormalGuess(state, guess, answer) {
  if (state.status !== "playing") return { ok: false, message: "The game has ended." };

  const validation = validateNewGuess(state, guess);
  if (!validation.ok) {
    return validation;
  }

  const normalized = validation.word;
  const attemptIndex = getNextNormalAttemptIndex(state);
  if (attemptIndex === -1) {
    return { ok: false, message: "No normal attempts remain." };
  }

  const feedback = evaluateGuess(normalized, answer);

  state.usedGuesses.add(normalized);
  state.attempts[attemptIndex] = "guess";
  state.guesses[attemptIndex] = normalized;
  state.feedback[attemptIndex] = feedback;
  skipClueForAttempt(state, attemptIndex);

  if (normalized === normalizeGuess(answer)) {
    state.status = "finished";
    state.result = GAME1_RESULT.SOLVED;
    state.answer = normalizeGuess(answer);
    return { ok: true, solved: true, feedback, attemptIndex };
  }

  if (getNextNormalAttemptIndex(state) === -1) {
    state.status = "awaiting-seventh";
    return { ok: true, solved: false, feedback, seventhStage: true, attemptIndex };
  }

  return { ok: true, solved: false, feedback, attemptIndex };
}

/**
 * The 7th-stage close rule is isolated so it can be replaced later without
 * changing normal-attempt or UI logic.
 *
 * Current rule: the exact answer triggers FAILED_CLOSE.
 * The seventh stage can never produce SOLVED.
 */
export function isSeventhAttemptClose(guess, answer, config = GAME1_CONFIG) {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedAnswer = normalizeGuess(answer);

  switch (config.seventhAttemptCloseRule) {
    case "exact-answer":
      return normalizedGuess === normalizedAnswer;
    default:
      return false;
  }
}

export function evaluateSeventhAttempt(guess, answer, config = GAME1_CONFIG) {
  const feedback = evaluateGuess(guess, answer);
  const isClose = isSeventhAttemptClose(guess, answer, config);

  return {
    result: isClose ? GAME1_RESULT.FAILED_CLOSE : GAME1_RESULT.FAILED_HARD,
    feedback,
    isClose
  };
}

export function skipSeventhAttempt(state, answer) {
  state.status = "finished";
  state.result = GAME1_RESULT.FAILED_HARD;
  state.answer = normalizeGuess(answer);
  state.seventhGuessUsed = false;
}

export function submitSeventhGuess(state, guess, answer) {
  if (state.status !== "awaiting-seventh") {
    return { ok: false, message: "The seventh attempt is not available." };
  }

  const validation = validateNewGuess(state, guess);
  if (!validation.ok) {
    return validation;
  }

  const normalized = validation.word;
  const evaluation = evaluateSeventhAttempt(normalized, answer);
  state.usedGuesses.add(normalized);
  state.status = "finished";
  state.result = evaluation.result;
  state.answer = normalizeGuess(answer);
  state.seventhGuessUsed = true;
  state.guesses.push(normalized);
  state.feedback.push(evaluation.feedback);

  return { ok: true, ...evaluation };
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
