export const FIVEWINK_RESULTS = Object.freeze({
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
  if (!isFiveLetterGuess(normalizedGuess)) {
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
