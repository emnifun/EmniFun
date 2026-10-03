/**
 * FiveWink gameplay checks using an injected vocabulary.
 */
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  createGame1State,
  getNextNormalAttemptIndex,
  isGuessAlreadyUsed,
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
  const state = createGame1State(validWords);
  submitNormalGuess(state, "APPLE", "HOUSE");
  assert(useClue(state, 2).ok, "Clue 2 must be usable after Row 1 is guessed.");
  assert(state.attempts[1] === "clue", "Clue 2 must consume Row 2.");
  assert(getNextNormalAttemptIndex(state) === 2, "After Row 1 guess + Clue 2, Row 3 must be next.");
  const third = submitNormalGuess(state, "CHAIR", "HOUSE");
  assert(third.attemptIndex === 2, "The next submitted guess must be stored on Row 3.");
  assert(state.guesses[1] === null, "Row 2 must remain unavailable for guesses after Clue 2.");
}

{
  const state = createGame1State(validWords);
  assert(!useClue(state, 2).ok, "Clue 2 must not be available on Attempt 1.");
  assert(!useClue(state, 3).ok, "Clue 3 must not be available on Attempt 1.");
  assert(!useClue(state, 4).ok, "Clue 4 must not be available on Attempt 1.");
  assert(!useClue(state, 5).ok, "Clue 5 must not be available on Attempt 1.");
  assert(useClue(state, 1).ok, "Only Clue 1 must be usable on Attempt 1.");
  assert(state.attempts[0] === "clue", "Clue 1 must consume Attempt 1.");
  assert(state.attemptNumber === 2, "Clue 1 must advance to Attempt 2.");
}

{
  const state = createGame1State(validWords);
  submitNormalGuess(state, "APPLE", "HOUSE");
  assert(state.attemptNumber === 2, "After guessing Attempt 1, Attempt 2 must become active.");

  assert(!useClue(state, 1).ok, "Clue 1 must not become available again.");
  assert(!useClue(state, 3).ok, "Clue 3 must not be available on Attempt 2.");
  assert(!useClue(state, 4).ok, "Clue 4 must not be available on Attempt 2.");
  assert(!useClue(state, 5).ok, "Clue 5 must not be available on Attempt 2.");
  assert(useClue(state, 2).ok, "Only Clue 2 must be usable on Attempt 2.");
  assert(state.attemptNumber === 3, "Clue 2 must advance to Attempt 3.");
}

{
  const state = createGame1State(validWords);
  assert(useClue(state, 1).ok, "Clue 1 must be usable on Attempt 1.");
  assert(!useClue(state, 3).ok, "Clue 3 must not be available on Attempt 2.");
  assert(useClue(state, 2).ok, "Clue 2 must be usable on Attempt 2.");
  assert(useClue(state, 3).ok, "Clue 3 must be usable on Attempt 3.");
  assert(useClue(state, 4).ok, "Clue 4 must be usable on Attempt 4.");
  assert(useClue(state, 5).ok, "Clue 5 must be usable on Attempt 5.");
  assert(state.attemptNumber === 6, "Using Clues 1–5 must leave Attempt 6 active.");
  assert(!useClue(state, 1).ok, "Previously used Clue 1 must stay unavailable.");
  assert(!useClue(state, 5).ok, "Previously used Clue 5 must stay unavailable.");
}

{
  const state = createGame1State(validWords);
  assert(useClue(state, 1).ok, "Clue 1 should consume Attempt 1.");
  assert(submitNormalGuess(state, "APPLE", "HOUSE").ok, "Guess should consume Attempt 2.");
  assert(useClue(state, 3).ok, "Clue 3 should consume Attempt 3.");
  assert(submitNormalGuess(state, "CHAIR", "HOUSE").ok, "Guess should consume Attempt 4.");
  assert(useClue(state, 5).ok, "Clue 5 should consume Attempt 5.");
  assert(state.attemptNumber === 6, "Mixed clue/guess play should advance to Attempt 6.");
  assert(!useClue(state, 1).ok, "Clue 1 must remain unavailable after use.");
  assert(!useClue(state, 3).ok, "Clue 3 must remain unavailable after use.");
  assert(!useClue(state, 5).ok, "Clue 5 must remain unavailable after use.");
  assert(!useClue(state, 6).ok, "Attempt 6 must have no clue.");
  const sixth = submitNormalGuess(state, "GRAPE", "HOUSE");
  assert(sixth.ok && sixth.seventhStage, "Incorrect Attempt 6 guess should open the existing seventh stage.");
}

{
  const state = createGame1State(validWords);
  assert(!useClue(state, 2).ok, "Future Clue 2 must be locked on Attempt 1.");
  assert(!useClue(state, 4).ok, "Future Clue 4 must be locked on Attempt 1.");
  assert(useClue(state, 1).ok, "Clue 1 must be usable.");
  submitNormalGuess(state, "APPLE", "HOUSE");
  assert(state.attemptNumber === 3, "Clue 1 plus Attempt 2 guess must move to Attempt 3.");
  assert(!useClue(state, 5).ok, "Future Clue 5 must remain locked on Attempt 3.");
  assert(useClue(state, 3).ok, "Clue 3 must be usable on Attempt 3.");
}


{
  const state = createGame1State(validWords);
  const first = submitNormalGuess(state, "APPLE", "HOUSE");
  assert(first.ok, "First valid guess should be accepted.");
  assert(isGuessAlreadyUsed(state, "APPLE"), "Accepted guesses must be tracked in the current session.");

  const beforeAttempts = state.attempts.slice();
  const beforeGuesses = state.guesses.slice();
  const duplicate = submitNormalGuess(state, "APPLE", "HOUSE");
  assert(!duplicate.ok && duplicate.duplicate, "The same word must be rejected as a duplicate.");
  assert(duplicate.message === "Already guessed! Try another.", "Duplicate should return the friendly duplicate message.");
  assert(
    JSON.stringify(state.attempts) === JSON.stringify(beforeAttempts),
    "A duplicate guess must not consume or advance an attempt."
  );
  assert(
    JSON.stringify(state.guesses) === JSON.stringify(beforeGuesses),
    "A duplicate guess must not be added to guess history."
  );
}

{
  const state = createGame1State(validWords);
  submitNormalGuess(state, "APPLE", "HOUSE");

  const lowercase = submitNormalGuess(state, "apple", "HOUSE");
  assert(!lowercase.ok && lowercase.duplicate, "Lowercase duplicate must be rejected.");

  const spaced = submitNormalGuess(state, "  APPLE  ", "HOUSE");
  assert(!spaced.ok && spaced.duplicate, "Whitespace/case variants must be rejected as duplicates.");

  assert(state.guesses.filter(Boolean).length === 1, "Duplicate variants must not add another submitted guess.");
}

{
  const state = createGame1State(validWords);
  const firstInvalid = submitNormalGuess(state, "ZZZZZ", "HOUSE");
  const secondInvalid = submitNormalGuess(state, "ZZZZZ", "HOUSE");
  assert(!firstInvalid.ok && !firstInvalid.duplicate, "An invalid word must keep the existing invalid-word behavior.");
  assert(!secondInvalid.ok && !secondInvalid.duplicate, "An invalid word must not become a duplicate merely by being repeated.");
  assert(state.guesses.filter(Boolean).length === 0, "Invalid words must not enter submitted-guess history.");
}

{
  const state = createGame1State(validWords);
  submitNormalGuess(state, "APPLE", "HOUSE");
  useClue(state, 2);

  const before = state.attempts.slice();
  const duplicate = submitNormalGuess(state, "APPLE", "HOUSE");
  assert(!duplicate.ok && duplicate.duplicate, "Duplicate must be rejected after clue use.");
  assert(JSON.stringify(state.attempts) === JSON.stringify(before), "Duplicate after clue use must not change attempt state.");
  assert(getNextNormalAttemptIndex(state) === 2, "Duplicate after Row 1 + Clue 2 must leave Row 3 active.");
}

{
  const firstSession = createGame1State(validWords);
  submitNormalGuess(firstSession, "APPLE", "HOUSE");
  assert(isGuessAlreadyUsed(firstSession, "APPLE"), "APPLE should be used in the first session.");

  const secondSession = createGame1State(validWords);
  assert(!isGuessAlreadyUsed(secondSession, "APPLE"), "A new FiveWink session must start with an empty duplicate set.");
  assert(submitNormalGuess(secondSession, "APPLE", "HOUSE").ok, "The same word must be allowed in a new session.");
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
  const exact = evaluateSeventhAttempt("HOUSE", "HOUSE");
  assert(exact.result === GAME1_RESULT.FAILED_CLOSE, "The exact answer should trigger FAILED_CLOSE in the seventh stage.");
  assert(exact.isClose === true, "The configured seventh close condition should be true for the exact answer.");

  const twoCorrectPositionsButNotExact = evaluateSeventhAttempt("APZZZ", "APPLE");
  assert(
    twoCorrectPositionsButNotExact.result === GAME1_RESULT.FAILED_HARD,
    "Two correct positions alone must NOT trigger FAILED_CLOSE."
  );
  assert(
    twoCorrectPositionsButNotExact.isClose === false,
    "A non-exact seventh guess must be FAILED_HARD under the current rule."
  );

  const state = createGame1State(validWords);
  state.status = "awaiting-seventh";
  const submitted = submitSeventhGuess(state, "HOUSE", "HOUSE");
  assert(submitted.ok && submitted.result === GAME1_RESULT.FAILED_CLOSE, "Seventh exact answer must still be a failure result.");
  assert(submitted.result !== GAME1_RESULT.SOLVED, "Seventh attempt can never be SOLVED.");
  assert(
    state.guesses[GAME1_CONFIG.normalAttempts] === "HOUSE",
    "The seventh guess must be stored separately from the six normal rows."
  );
}

assert(GAME1_CONFIG.normalAttempts === 6, "Six normal attempts must remain configured.");
assert(GAME1_CONFIG.clueCount === 5, "Five clues must remain configured.");
assert(GAME1_CONFIG.seventhAttemptCloseRule === "exact-answer", "The seventh close rule must use the configured exact-answer rule.");
console.log("FiveWink logic checks passed.");
