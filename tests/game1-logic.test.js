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
  sanitizeGuessInput,
  restoreGame1State,
  checkHardMode1Constraints,
  isSessionLocked,
  FIVEWINK_MODES,
  ALLOWED_GAMEPLAY_MODES
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

{
  // Test: Active session restoration correctly restores state and feedback is an array of tile statuses
  const state = createGame1State();
  const payload = {
    attempts: ["guess", null, null, null, null, null],
    guesses: ["PLANT"],
    evaluations: [["absent", "absent", "wrong-position", "wrong-position", "absent"]],
    cluesState: ["skipped", "available", "available", "available", "available"],
    cluesUsed: 0,
    status: "playing"
  };

  const res = restoreGame1State(state, payload);
  assert(res.ok, "Restoration must succeed.");
  assert(state.guesses[0] === "PLANT", "First row guess must be PLANT.");
  assert(state.attempts[0] === "guess", "First row attempt must be guess.");
  assert(Array.isArray(state.feedback[0]), "feedback[0] MUST be an Array, not a string.");
  assert(state.feedback[0].length === 5, "feedback[0] must have 5 tile evaluations.");
  assert(state.feedback[0][0] === "absent", "First tile status must be absent.");
  assert(state.feedback[0][2] === "wrong-position", "Third tile status must be wrong-position.");
  assert(state.status === "playing", "Status must be playing.");
  assert(getNextNormalAttemptIndex(state) === 1, "Next active row must be row 2 (index 1).");
  assert(isGuessAlreadyUsed(state, "PLANT"), "PLANT must be in usedGuesses.");

  // Test: Next guess application works smoothly on restored state without polluting future rows
  const secondResponse = {
    ok: true,
    attemptIndex: 1,
    feedback: ["absent", "absent", "absent", "correct", "absent"],
    solved: false,
    seventhStage: false,
    finished: false
  };

  const applied = applyNormalGuessResult(state, "SCRAP", secondResponse);
  assert(applied.ok, "Applying second guess must succeed.");
  assert(state.guesses[1] === "SCRAP", "Row 2 must be SCRAP.");
  assert(state.guesses[2] === null, "Row 3 must remain null (not copied from SCRAP).");
  assert(getNextNormalAttemptIndex(state) === 2, "Next active row must now be row 3 (index 2).");
}

{
  // Test: Completed puzzle restoration
  const state = createGame1State();
  const completedPayload = {
    attempts: ["guess", "guess", null, null, null, null],
    guesses: ["PLANT", "HUMAN"],
    evaluations: [
      ["absent", "absent", "wrong-position", "wrong-position", "absent"],
      ["correct", "correct", "correct", "correct", "correct"]
    ],
    cluesState: ["skipped", "skipped", "available", "available", "available"],
    cluesUsed: 0,
    status: "finished",
    result: GAME1_RESULT.SOLVED,
    answer: "HUMAN"
  };

  const res = restoreGame1State(state, completedPayload);
  assert(res.ok, "Completed restoration must succeed.");
  assert(state.status === "finished", "Status must be finished.");
  assert(state.result === GAME1_RESULT.SOLVED, "Result must be SOLVED.");
  assert(state.answer === "HUMAN", "Answer must be HUMAN.");
  assert(state.guesses[0] === "PLANT", "First guess must be PLANT.");
  assert(state.guesses[1] === "HUMAN", "Second guess must be HUMAN.");
  assert(Array.isArray(state.feedback[0]), "feedback[0] must be an array.");
  assert(Array.isArray(state.feedback[1]), "feedback[1] must be an array.");
}

{
  // Test: Completed puzzle restoration faithfully preserves attempts timeline and clue-consumed rows
  const state = createGame1State();
  const scoutEval = ["correct", "correct", "correct", "correct", "correct"];
  const humanEval = ["absent", "wrong-position", "absent", "absent", "absent"];
  const plantEval = ["absent", "absent", "wrong-position", "wrong-position", "absent"];
  const payload = {
    attempts: ["guess", "guess", "clue", "clue", "clue", "guess"],
    guesses: ["HUMAN", "PLANT", "SCOUT"],
    evaluations: [humanEval, plantEval, scoutEval],
    cluesState: ["skipped", "skipped", "used", "used", "used"],
    cluesUsed: 3,
    status: "finished",
    result: GAME1_RESULT.SOLVED,
    answer: "SCOUT"
  };

  const res = restoreGame1State(state, payload);
  assert(res.ok, "Restoration with clues must succeed.");
  assert(state.guesses[0] === "HUMAN", "Row 1 must be HUMAN.");
  assert(state.guesses[1] === "PLANT", "Row 2 must be PLANT.");
  assert(state.guesses[2] === null, "Row 3 must be null (clue-consumed).");
  assert(state.guesses[3] === null, "Row 4 must be null (clue-consumed).");
  assert(state.guesses[4] === null, "Row 5 must be null (clue-consumed).");
  assert(state.guesses[5] === "SCOUT", "Row 6 must be SCOUT.");

  assert(state.feedback[2] === null, "Row 3 feedback must be null.");
  assert(state.feedback[3] === null, "Row 4 feedback must be null.");
  assert(state.feedback[4] === null, "Row 5 feedback must be null.");
  assert(Array.isArray(state.feedback[5]), "Row 6 feedback must be an array.");
  assert(state.feedback[5] === scoutEval, "SCOUT evaluation must be at state.feedback[5], not state.feedback[2].");
}

{
  // Test: Resumed active game where a clue was used restores to correct next attempt row
  const state = createGame1State();
  const humanEval = ["absent", "wrong-position", "absent", "absent", "absent"];
  const payload = {
    attempts: ["guess", "clue", null, null, null, null],
    guesses: ["HUMAN"],
    evaluations: [humanEval],
    cluesState: ["skipped", "used", "available", "available", "available"],
    cluesUsed: 1,
    status: "playing"
  };

  const res = restoreGame1State(state, payload);
  assert(res.ok, "Resumed active restoration with clue must succeed.");
  assert(state.guesses[0] === "HUMAN", "Row 1 must be HUMAN.");
  assert(state.guesses[1] === null, "Row 2 must be null (clue-consumed).");
  assert(state.attempts[0] === "guess", "Attempt 0 must be guess.");
  assert(state.attempts[1] === "clue", "Attempt 1 must be clue.");
  assert(state.attempts[2] === null, "Attempt 2 must be null.");
  assert(getNextNormalAttemptIndex(state) === 2, "Next normal attempt must be row 3 (index 2).");
}

{
  // Test: Initial state has default mode and is not locked
  const state = createGame1State();
  assert(state.mode === FIVEWINK_MODES.DEFAULT, "Initial mode must be default.");
  assert(state.modeLocked === false, "Initial mode must not be locked.");

  // Test: Normal guess locks mode and respects mode in response
  const guessRes = {
    ok: true,
    attemptIndex: 0,
    feedback: ["correct", "absent", "absent", "absent", "absent"],
    solved: false,
    seventhStage: false,
    mode: "hard1"
  };
  applyNormalGuessResult(state, "CRANE", guessRes);
  assert(state.mode === "hard1", "Mode must update to hard1 from response.");
  assert(state.modeLocked === true, "Mode must lock on first guess.");
}

{
  // Test: Clue usage locks mode to default
  const state = createGame1State();
  applyClueResult(state, 1);
  assert(state.mode === "default", "Mode must be default when clue is used.");
  assert(state.modeLocked === true, "Mode must lock when clue is used.");
}

{
  // Test: Restoration preserves mode and locked state
  const state = createGame1State();
  const payload = {
    attempts: ["guess", null, null, null, null, null],
    guesses: ["CRANE"],
    evaluations: [["correct", "absent", "absent", "absent", "absent"]],
    mode: "hard1",
    status: "playing"
  };
  restoreGame1State(state, payload);
  assert(state.mode === "hard1", "Restoration must preserve mode.");
  assert(state.modeLocked === true, "Restoration must mark modeLocked true when guesses exist.");
}

{
  // Test: Client checkHardMode1Constraints enforcement
  const prevGuesses = ["CRANE"];
  const prevFeedback = [["correct", "wrong-position", "absent", "absent", "absent"]]; // C blue at 1, R orange at 2

  // Blue constraint check
  assert(
    !checkHardMode1Constraints("PLANT", prevGuesses, prevFeedback).valid,
    "Missing blue C at position 1 must fail."
  );

  // Orange position check
  assert(
    !checkHardMode1Constraints("CROSS", prevGuesses, prevFeedback).valid,
    "Orange R at same position 2 must fail."
  );

  // Orange inclusion check
  assert(
    !checkHardMode1Constraints("CLOWN", prevGuesses, prevFeedback).valid,
    "Missing orange R must fail."
  );

  // Valid guess satisfying both
  assert(
    checkHardMode1Constraints("CHORE", prevGuesses, prevFeedback).valid,
    "CHORE has C at pos 1 and R at pos 4, satisfying constraints."
  );

  // Multi-row Blue constraints: lowest position index wins deterministically
  const multiBluePrev = ["STONE", "PLANT"];
  const multiBlueEval = [
    ["absent", "absent", "absent", "correct", "absent"], // N blue at 4
    ["correct", "absent", "absent", "correct", "absent"]  // P blue at 1
  ];
  const multiBlueFail = checkHardMode1Constraints("CRATE", multiBluePrev, multiBlueEval);
  assert(
    !multiBlueFail.valid && multiBlueFail.message === "Position 1 must be P.",
    "Lowest position index 1 must take priority over position 4 regardless of row order."
  );

  // Multi-row Orange constraints: lowest position index wins deterministically
  const multiOrangePrev = ["TRAIN", "POINT"];
  const multiOrangeEval = [
    ["absent", "absent", "absent", "absent", "wrong-position"], // N orange at 5
    ["wrong-position", "absent", "absent", "absent", "absent"]  // P orange at 1
  ];
  const multiOrangeFail = checkHardMode1Constraints("PRONN", multiOrangePrev, multiOrangeEval);
  assert(
    !multiOrangeFail.valid && multiOrangeFail.message === "Letter P cannot be in position 1.",
    "Lowest position index 1 in Orange must take priority over position 5 regardless of row order."
  );

  // Cross-row category hierarchy: Blue outranks Orange regardless of row timing
  const crossCatPrev = ["POINT", "STONE"];
  const crossCatEval = [
    ["wrong-position", "absent", "absent", "absent", "absent"], // P orange at 1
    ["absent", "absent", "absent", "correct", "absent"]  // N blue at 4
  ];
  const crossCatFail = checkHardMode1Constraints("PRIZE", crossCatPrev, crossCatEval);
  assert(
    !crossCatFail.valid && crossCatFail.message === "Position 4 must be N.",
    "Blue violation from Row 2 must outrank Orange violation from Row 1."
  );
}

{
  // Test: buildPlayerHistoryRecord includes mode
  const state = createGame1State();
  state.mode = "hard1";
  state.result = GAME1_RESULT.SOLVED;
  const history = buildPlayerHistoryRecord(state, { date: "2026-10-13", game: "game1" });
  assert(history.mode === "hard1", "Player history record must include mode.");
}

{
  // Test: Non-final successful Skip locks mode immediately even with zero guesses and zero clues
  const state = createGame1State();
  const payload = {
    attempts: ["skip", null, null, null, null, null],
    guesses: [],
    evaluations: [],
    cluesUsed: 0,
    status: "playing",
    mode: "hard1"
  };
  const res = restoreGame1State(state, payload);
  assert(res.ok, "Restoring state with non-final skip must succeed.");
  assert(isSessionLocked(state) === true, "isSessionLocked must return true when an attempt was skipped.");
  assert(state.modeLocked === true, "Non-final skip must immediately lock the mode.");
}

{
  // Test: Seventh-guess skip locks the mode immediately
  const state = createGame1State();
  state.status = "awaiting-seventh";
  state.mode = "hard1";
  const skipResult = applySeventhSkipResult(state, {
    ok: true,
    result: GAME1_RESULT.FAILED_HARD,
    answer: "HOUSE"
  });
  assert(skipResult.ok, "Applying 7th skip must succeed.");
  assert(state.modeLocked === true, "Seventh-guess skip must immediately lock the mode.");
  assert(isSessionLocked(state) === true, "Seventh-guess skip must mark session locked.");
}

console.log("FiveWink client-state checks passed.");
