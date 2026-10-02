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
  // TEMPORARY / CONFIGURABLE: final closeness formula is not decided yet.
  seventhAttemptMinimumCorrectPositions: 2
});

export function createGame1State(validWords = new Set()) {
  return {
    attemptNumber: 1,
    guesses: [],
    feedback: [],
    clues: Array(GAME1_CONFIG.clueCount).fill("available"),
    cluesUsed: 0,
    seventhGuessUsed: false,
    status: "playing",
    result: null,
    answer: null,
    validWords
  };
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
  if (state.attemptNumber > GAME1_CONFIG.clueCount) {
    return { ok: false, message: "Attempt 6 is guess-only." };
  }
  if (clueNumber !== state.attemptNumber) {
    return { ok: false, message: "That clue is not available on this attempt." };
  }
  if (state.clues[clueNumber - 1] !== "available") {
    return { ok: false, message: "That clue is no longer available." };
  }

  state.clues[clueNumber - 1] = "used";
  state.cluesUsed += 1;
  state.attemptNumber += 1;
  return { ok: true };
}

function skipCurrentClue(state) {
  if (
    state.attemptNumber <= GAME1_CONFIG.clueCount &&
    state.clues[state.attemptNumber - 1] === "available"
  ) {
    state.clues[state.attemptNumber - 1] = "skipped";
  }
}

export function submitNormalGuess(state, guess, answer) {
  if (state.status !== "playing") return { ok: false, message: "The game has ended." };

  const normalized = normalizeGuess(guess);
  if (!isValidGuess(normalized, state.validWords)) {
    return { ok: false, message: "Not a valid word." };
  }

  const feedback = evaluateGuess(normalized, answer);
  state.guesses.push(normalized);
  state.feedback.push(feedback);
  skipCurrentClue(state);

  if (normalized === normalizeGuess(answer)) {
    state.status = "finished";
    state.result = GAME1_RESULT.SOLVED;
    state.answer = normalizeGuess(answer);
    return { ok: true, solved: true, feedback };
  }

  if (state.attemptNumber === GAME1_CONFIG.normalAttempts) {
    state.status = "awaiting-seventh";
    return { ok: true, solved: false, feedback, seventhStage: true };
  }

  state.attemptNumber += 1;
  return { ok: true, solved: false, feedback };
}

export function evaluateSeventhAttempt(guess, answer) {
  const feedback = evaluateGuess(guess, answer);
  const correctPositions = feedback.filter((value) => value === "correct").length;

  return {
    result:
      correctPositions >= GAME1_CONFIG.seventhAttemptMinimumCorrectPositions
        ? GAME1_RESULT.FAILED_CLOSE
        : GAME1_RESULT.FAILED_HARD,
    feedback,
    correctPositions
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

  const normalized = normalizeGuess(guess);
  if (!isValidGuess(normalized, state.validWords)) {
    return { ok: false, message: "Not a valid word." };
  }

  const evaluation = evaluateSeventhAttempt(normalized, answer);
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
    attemptsUsed: state.guesses.length,
    cluesUsed: state.cluesUsed,
    seventhGuessUsed: state.seventhGuessUsed
  };
}
