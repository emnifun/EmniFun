/**
 * FiveWink client-state checks.
 *
 * Answer evaluation is now a server concern. These tests verify that the
 * browser state can consume authoritative Worker responses without knowing
 * the answer.
 */
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  applyClueResult,
  applyNormalGuessResult,
  applySeventhGuessResult,
  applySeventhSkipResult,
  buildPlayerHistoryRecord,
  createGame1State,
  getNextNormalAttemptIndex,
  isEnglishFiveLetterWord,
  isGuessAlreadyUsed,
  sanitizeGuessInput
} from "../js/games/game1/game1-logic.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

{
  const state = createGame1State();
  assert(state.attemptNumber === 1, "Game must start on attempt 1.");
  assert(getNextNormalAttemptIndex(state) === 0, "First normal row must be active.");
  assert(state.answer === null, "Client must not start with the answer.");
}

{
  const state = createGame1State();

  const clue = applyClueResult(state, 1);
  assert(clue.ok, "Clue 1 should be applicable on attempt 1.");
  assert(state.attempts[0] === "clue", "Clue 1 must consume attempt 1.");
  assert(state.clues[0] === "used", "Clue 1 must become used.");
  assert(state.cluesUsed === 1, "Clue use count must increment.");
  assert(state.attemptNumber === 2, "Clue 1 must advance to attempt 2.");

  assert(
    !applyClueResult(state, 3).ok,
    "Future clues must remain unavailable."
  );
}

{
  const state = createGame1State();

  const response = {
    ok: true,
    attemptIndex: 0,
    feedback: ["correct", "wrong-position", "absent", "absent", "correct"],
    solved: false,
    seventhStage: false,
    finished: false,
    gameToken: "next-token"
  };

  const applied = applyNormalGuessResult(state, "CRANE", response);
  assert(applied.ok, "A valid Worker guess response must apply.");
  assert(state.guesses[0] === "CRANE", "Guess must be stored in the same row.");
  assert(
    JSON.stringify(state.feedback[0]) === JSON.stringify(response.feedback),
    "Worker feedback must be rendered unchanged."
  );
  assert(state.attempts[0] === "guess", "Normal guess must consume its row.");
  assert(state.clues[0] === "skipped", "Unused clue must be marked skipped.");
  assert(isGuessAlreadyUsed(state, "crane"), "Accepted guesses must be tracked locally.");
  assert(state.answer === null, "Unsolved response must not reveal the answer.");
  assert(state.status === "playing", "Normal unsolved guess must keep the game playing.");
}

{
  const state = createGame1State();
  for (let index = 0; index < 5; index += 1) {
    const response = {
      ok: true,
      attemptIndex: index,
      feedback: ["absent", "absent", "absent", "absent", "absent"],
      solved: false,
      seventhStage: false,
      finished: false
    };
    assert(
      applyNormalGuessResult(state, "ABCDE".replace("A", String.fromCharCode(65 + index)), response).ok,
      "Normal response should apply while attempts remain."
    );
  }

  const sixthResponse = {
    ok: true,
    attemptIndex: 5,
    feedback: ["absent", "absent", "absent", "absent", "absent"],
    solved: false,
    seventhStage: true,
    finished: false,
    gameToken: "seventh-token"
  };

  const applied = applyNormalGuessResult(state, "STARE", sixthResponse);
  assert(applied.ok, "Sixth response must apply.");
  assert(state.status === "awaiting-seventh", "Sixth failure must open seventh stage.");
}

{
  const state = createGame1State();
  const seventh = {
    ok: true,
    feedback: ["correct", "correct", "correct", "correct", "correct"],
    result: GAME1_RESULT.FAILED_CLOSE,
    finished: true,
    answer: "HOUSE",
    seventhGuessUsed: true,
    gameToken: "finished-token"
  };

  const applied = applySeventhGuessResult(state, "HOUSE", seventh);
  assert(applied.ok, "Seventh response must apply.");
  assert(state.status === "finished", "Seventh response must finish the game.");
  assert(state.result === GAME1_RESULT.FAILED_CLOSE, "Seventh exact-answer result must remain FAILED_CLOSE.");
  assert(state.answer === "HOUSE", "Answer may be revealed only in the finishing response.");
  assert(state.seventhGuessUsed === true, "Seventh guess usage must be recorded.");
  assert(state.guesses[6] === "HOUSE", "Seventh guess must remain visible in the seventh row.");
  assert(state.feedback[6][0] === "correct", "Seventh feedback must remain visible.");
}

{
  const state = createGame1State();
  const skipped = applySeventhSkipResult(state, {
    ok: true,
    result: GAME1_RESULT.FAILED_HARD,
    finished: true,
    answer: "HOUSE",
    seventhGuessUsed: false,
    gameToken: "finished-token"
  });

  assert(skipped.ok, "Server skip response must apply.");
  assert(state.status === "finished", "Skip must finish the game.");
  assert(state.result === GAME1_RESULT.FAILED_HARD, "Skip must remain FAILED_HARD.");
  assert(state.answer === "HOUSE", "Skip may reveal the answer after finishing.");
  assert(state.seventhGuessUsed === false, "Skipped seventh guess must remain unused.");
}

{
  assert(isEnglishFiveLetterWord("HOUSE"), "Five-letter A-Z words should pass client shape validation.");
  assert(!isEnglishFiveLetterWord("HOUSES"), "Six-letter words should fail client shape validation.");
  assert(!isEnglishFiveLetterWord("AB1CD"), "Non-letter input should fail client shape validation.");
  assert(sanitizeGuessInput("  ho!use99 ") === "HOUSE", "Input should be sanitized for UI entry.");
}

{
  const state = createGame1State();
  const record = buildPlayerHistoryRecord(state, {
    date: "2026-10-04",
    game: "game1"
  });

  assert(record.puzzleDate === "2026-10-04", "History must keep the puzzle date.");
  assert(record.game === "game1", "History must keep the game ID.");
  assert(record.attemptsUsed === 0, "Fresh game must have zero submitted guesses.");
}

assert(GAME1_CONFIG.normalAttempts === 6, "FiveWink must keep six normal attempts.");
assert(GAME1_CONFIG.clueCount === 5, "FiveWink must keep five clues.");
assert(GAME1_CONFIG.seventhAttemptCloseRule === "exact-answer", "Seventh close rule must remain unchanged.");

console.log("FiveWink client-state checks passed.");
