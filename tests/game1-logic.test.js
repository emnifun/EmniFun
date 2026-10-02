/**
 * Game 1 gameplay checks using an injected vocabulary.
 */
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  createGame1State,
  evaluateGuess,
  evaluateSeventhAttempt,
  isValidGuess,
  sanitizeGuessInput,
  submitNormalGuess,
  submitSeventhGuess,
  skipSeventhAttempt,
  useClue
} from "../js/games/game1/game1-logic.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const validWords = new Set([
  "APPLE","HOUSE","WHICH","THING","CHAIR","GRAPE","PLANT","STONE",
  "TRAIN","BRAVE","CLOUD","MANGO","SHEEP"
]);

{
  const state = createGame1State(validWords);
  assert(state.attemptNumber === 1, "Game starts on attempt 1.");
  assert(useClue(state, 1).ok, "Clue 1 must be usable.");
  assert(state.attemptNumber === 2, "Clue 1 consumes attempt 1.");

  const before = state.guesses.length;
  const invalid = submitNormalGuess(state, "ABCDE", "HOUSE");
  assert(!invalid.ok && state.guesses.length === before, "Invalid word must not consume an attempt.");

  assert(useClue(state, 2).ok, "Clue 2 must be usable.");
  assert(useClue(state, 3).ok, "Clue 3 must be usable.");
  assert(useClue(state, 4).ok, "Clue 4 must be usable.");
  assert(useClue(state, 5).ok, "Clue 5 must be usable.");
  assert(state.attemptNumber === 6, "Five clues must still leave attempt 6.");
  assert(!useClue(state, 6).ok, "Attempt 6 must be guess-only.");
  assert(submitNormalGuess(state, "HOUSE", "HOUSE").solved, "Correct attempt 6 guess must solve.");
}

{
  assert(isValidGuess("house", validWords), "A valid word other than APPLE must be accepted.");
  assert(isValidGuess("which", validWords), "A normal word outside the old tiny demo vocabulary must be accepted.");
  assert(isValidGuess("thing", validWords), "Another common word outside the old demo vocabulary must be accepted.");
  assert(!isValidGuess("QWERT", validWords), "Random word should be rejected when absent from vocabulary.");
  assert(!isValidGuess("AB1CD", validWords), "Numbers should be rejected.");
  assert(!isValidGuess("ABC!D", validWords), "Punctuation should be rejected.");
  assert(!isValidGuess("HOUSES", validWords), "Words longer than five letters should be rejected.");
  assert(!isValidGuess("HOME", validWords), "Words shorter than five letters should be rejected.");
  assert(sanitizeGuessInput("  ho!use99 ").slice(0, 5) === "HOUSE", "Pasted mixed text should be sanitized.");
}

{
  const feedback = evaluateGuess("SHEEP", "APPLE");
  assert(feedback.length === 5, "Feedback must contain five positions.");
  assert(feedback[3] === "absent", "Duplicate-letter evaluation must account for answer letter counts.");
}

{
  const state = createGame1State(validWords);
  for (const guess of ["APPLE","CHAIR","GRAPE","PLANT","STONE"]) {
    submitNormalGuess(state, guess, "HOUSE");
  }
  const sixth = submitNormalGuess(state, "TRAIN", "HOUSE");
  assert(sixth.seventhStage, "Incorrect sixth guess must open seventh stage.");
  assert(state.status === "awaiting-seventh", "State must await optional seventh guess.");
  skipSeventhAttempt(state, "HOUSE");
  assert(state.result === GAME1_RESULT.FAILED_HARD, "Skipping seventh guess must be FAILED_HARD.");
}

{
  const seventhExact = createGame1State(validWords);
  seventhExact.status = "awaiting-seventh";
  const exact = submitSeventhGuess(seventhExact, "HOUSE", "HOUSE");
  assert(exact.ok && exact.result !== GAME1_RESULT.SOLVED, "Seventh exact answer must still be failure.");

  const close = evaluateSeventhAttempt("HOUSE", "HOUSE");
  const hard = evaluateSeventhAttempt("MANGO", "HOUSE");
  assert(close.result === GAME1_RESULT.FAILED_CLOSE, "Close seventh guess should be close under temporary rule.");
  assert(hard.result === GAME1_RESULT.FAILED_HARD, "Distant seventh guess should be hard.");
}

assert(GAME1_CONFIG.normalAttempts === 6, "Six normal attempts must remain configured.");
console.log("Game 1 logic checks passed.");
