export const FIVEWINK_RESULTS = Object.freeze({
  SOLVED: "SOLVED",
  FAILED_CLOSE: "FAILED_CLOSE",
  FAILED_HARD: "FAILED_HARD"
});

export const FIVEWINK_CONFIG = Object.freeze({
  normalAttempts: 6,
  clueCount: 5,
  seventhAttemptCloseRule: "exact-answer"
});

export function normalizeGuess(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function isFiveLetterGuess(value) {
  return /^[A-Z]{5}$/.test(normalizeGuess(value));
}

/**
 * Two passes preserve the existing FiveWink duplicate-letter semantics.
 */
export function evaluateGuess(guess, answer) {
  const word = normalizeGuess(guess);
  const target = normalizeGuess(answer);
  const result = Array(word.length).fill("absent");
  const remaining = {};

  for (const letter of target) {
    remaining[letter] = (remaining[letter] || 0) + 1;
  }

  for (let index = 0; index < word.length; index += 1) {
    if (word[index] === target[index]) {
      result[index] = "correct";
      remaining[word[index]] -= 1;
    }
  }

  for (let index = 0; index < word.length; index += 1) {
    if (result[index] === "correct") continue;

    const letter = word[index];
    if ((remaining[letter] || 0) > 0) {
      result[index] = "wrong-position";
      remaining[letter] -= 1;
    }
  }

  return result;
}

export function isSeventhAttemptClose(guess, answer) {
  return (
    FIVEWINK_CONFIG.seventhAttemptCloseRule === "exact-answer" &&
    normalizeGuess(guess) === normalizeGuess(answer)
  );
}

export function getSeventhResult(guess, answer) {
  return isSeventhAttemptClose(guess, answer)
    ? FIVEWINK_RESULTS.FAILED_CLOSE
    : FIVEWINK_RESULTS.FAILED_HARD;
}

export function parseClues(value) {
  let clues;

  try {
    clues = typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error("Puzzle clues are invalid.");
  }

  if (
    !Array.isArray(clues) ||
    clues.length !== FIVEWINK_CONFIG.clueCount ||
    clues.some((clue) => typeof clue !== "string" || !clue.trim())
  ) {
    throw new Error("Puzzle must contain exactly five valid clues.");
  }

  return clues.map((clue) => clue.trim());
}

export function currentNormalAttemptIndex(attempts) {
  if (!Array.isArray(attempts)) return -1;
  return attempts.findIndex((value) => value === null);
}
