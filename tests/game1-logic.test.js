/**
 * Lightweight Game 1 logic checks.
 *
 * These are plain assertions so the rules can be reviewed without a test framework.
 */
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  createGame1State,
  evaluateGuess,
  evaluateSeventhAttempt,
  isValidGuess,
  submitNormalGuess,
  submitSeventhGuess,
  skipSeventhAttempt,
  useClue
} from "../js/games/game1/game1-logic.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1, 2, 3, 4, 5, 6: normal solve positions and clue rule.
{
  const state = createGame1State();
  assert(state.attemptNumber === 1, "Game must start on attempt 1.");

  assert(useClue(state, 1).ok, "Clue 1 should be usable on attempt 1.");
  assert(state.attemptNumber === 2, "Using clue 1 must consume attempt 1.");

  const invalidBefore = state.guesses.length;
  const invalid = submitNormalGuess(state, "ABCDE", "APPLE");
  assert(!invalid.ok && state.guesses.length === invalidBefore, "Invalid word must not consume an attempt.");

  assert(useClue(state, 2).ok, "Clue 2 should be usable on attempt 2.");
  assert(useClue(state, 3).ok, "Clue 3 should be usable on attempt 3.");
  assert(useClue(state, 4).ok, "Clue 4 should be usable on attempt 4.");
  assert(useClue(state, 5).ok, "Clue 5 should be usable on attempt 5.");
  assert(state.attemptNumber === 6, "After five clues, the player must still reach attempt 6.");
  assert(useClue(state, 6).ok === false, "Attempt 6 must not have a clue.");

  const solved = submitNormalGuess(state, "APPLE", "APPLE");
  assert(solved.solved && state.result === GAME1_RESULT.SOLVED, "Correct attempt 6 guess must solve.");
}

// Duplicate-letter evaluation.
{
  const feedback = evaluateGuess("SHEEP", "APPLE");
  assert(feedback.length === 5, "Feedback must contain five positions.");
  assert(feedback[0] === "wrong-position", "P should not be falsely treated as present at S.");
  assert(isValidGuess("APPLE"), "APPLE should be a valid local guess.");
  assert(!isValidGuess("QWERT"), "Unknown word must not be a valid guess.");
  assert(!isValidGuess("ABCD1"), "Non-English character input must be rejected.");
}

// Attempt 7 appears only after an incorrect sixth guess.
{
  const state = createGame1State();
  for (const guess of ["HOUSE", "CHAIR", "GRAPE", "PLANT", "STONE"]) {
    submitNormalGuess(state, guess, "APPLE");
  }
  assert(state.attemptNumber === 6, "Fifth wrong guess must leave attempt 6.");
  const sixth = submitNormalGuess(state, "BRAVE", "APPLE");
  assert(sixth.seventhStage, "Incorrect sixth guess must open the seventh stage.");
  assert(state.status === "awaiting-seventh", "State must await optional seventh guess.");

  skipSeventhAttempt(state, "APPLE");
  assert(state.result === GAME1_RESULT.FAILED_HARD, "Skipping seventh guess must be FAILED_HARD.");
}

// Exact seventh answer is still a failure.
{
  const state = createGame1State();
  state.status = "awaiting-seventh";
  const result = submitSeventhGuess(state, "APPLE", "APPLE");
  assert(result.ok && result.result !== GAME1_RESULT.SOLVED, "Seventh exact answer must not solve.");
}

// Both close and hard outcomes must be available from the configurable rule.
{
  const close = evaluateSeventhAttempt("APPLE", "APPLE");
  const hard = evaluateSeventhAttempt("MANGO", "APPLE");
  assert(close.result === GAME1_RESULT.FAILED_CLOSE, "A sufficiently close seventh guess should be close.");
  assert(hard.result === GAME1_RESULT.FAILED_HARD, "A distant seventh guess should be hard.");
  assert(GAME1_CONFIG.seventhAttemptMinimumCorrectPositions >= 0, "Closeness threshold must be configurable.");
}

console.log("Game 1 logic checks passed.");
