import {
  currentNormalAttemptIndex,
  evaluateGuess,
  FIVEWINK_RESULTS,
  getSeventhResult,
  isFiveLetterGuess,
  normalizeGuess,
  parseClues
} from "./game1.js";
import {
  createFreshGameTokenPayload,
  createGameToken,
  verifyGameToken
} from "./token.js";

const VALID_GUESSES_URL =
  "https://raw.githubusercontent.com/emnifun/EmniFun/main/data/game1/vocabulary/valid-guesses.json";

let validWordsPromise = null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function requireConfiguredEnvironment(env) {
  if (!env?.DB) {
    throw new Error("The FiveWink D1 database binding is not configured.");
  }

  if (!env.GAME_TOKEN_SECRET) {
    throw new Error("The FiveWink game token secret is not configured.");
  }
}

async function loadValidWords() {
  if (!validWordsPromise) {
    validWordsPromise = fetch(VALID_GUESSES_URL, {
      cf: { cacheEverything: true, cacheTtl: 86400 }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("The FiveWink guess vocabulary could not be loaded.");
      }

      const data = await response.json();

      if (!Array.isArray(data?.words)) {
        throw new Error("The FiveWink guess vocabulary is invalid.");
      }

      const words = new Set(
        data.words
          .map((word) => normalizeGuess(word))
          .filter((word) => isFiveLetterGuess(word))
      );

      if (words.size < 10000) {
        throw new Error("The FiveWink guess vocabulary is unexpectedly small.");
      }

      return words;
    });

    validWordsPromise.catch(() => {
      validWordsPromise = null;
    });
  }

  return validWordsPromise;
}

function getTodayDateIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return values.year + "-" + values.month + "-" + values.day;
}

function parseRequestJson(request) {
  return request.json().catch(() => {
    throw Object.assign(new Error("Invalid JSON request."), { status: 400 });
  });
}

async function getPuzzleById(env, puzzleId) {
  return env.DB.prepare(
    "SELECT puzzle_id, game, date, answer, clues_json, status FROM fivewink_puzzles WHERE puzzle_id = ?1 LIMIT 1"
  )
    .bind(puzzleId)
    .first();
}

async function getCurrentPublishedPuzzle(env) {
  const today = getTodayDateIndia();

  return env.DB.prepare(
    "SELECT puzzle_id, game, date, answer, clues_json, status FROM fivewink_puzzles WHERE game = 'game1' AND date = ?1 AND status = 'published' LIMIT 1"
  )
    .bind(today)
    .first();
}

async function issueTokenForPuzzle(puzzle, secret) {
  const payload = createFreshGameTokenPayload(puzzle.puzzle_id, puzzle.date);
  return createGameToken(payload, secret);
}

function validateSessionForPuzzle(session, puzzleId) {
  if (session.puzzleId !== puzzleId) {
    return { ok: false, message: "Game session does not match this puzzle." };
  }

  return { ok: true };
}

function updateAfterNormalGuess(session, guess, feedback, answer) {
  const attemptIndex = currentNormalAttemptIndex(session.attempts);

  if (attemptIndex === -1 || session.status !== "playing") {
    return { ok: false, message: "No normal attempts remain." };
  }

  session.attempts[attemptIndex] = "guess";
  session.guesses.push(guess);

  if (attemptIndex < 5 && session.clues[attemptIndex] === "available") {
    session.clues[attemptIndex] = "skipped";
  }

  if (guess === answer) {
    session.status = "finished";
    return {
      ok: true,
      solved: true,
      finished: true,
      result: FIVEWINK_RESULTS.SOLVED,
      attemptIndex,
      feedback,
      answer
    };
  }

  if (attemptIndex === 5) {
    session.status = "awaiting-seventh";
    return {
      ok: true,
      solved: false,
      seventhStage: true,
      finished: false,
      attemptIndex,
      feedback
    };
  }

  return {
    ok: true,
    solved: false,
    seventhStage: false,
    finished: false,
    attemptIndex,
    feedback
  };
}

async function handlePuzzle(request, env) {
  requireConfiguredEnvironment(env);

  const puzzle = await getCurrentPublishedPuzzle(env);

  if (!puzzle) {
    return jsonResponse(
      {
        ok: false,
        message: "There is no published FiveWink puzzle for today."
      },
      404
    );
  }

  const clues = parseClues(puzzle.clues_json);
  const gameToken = await issueTokenForPuzzle(puzzle, env.GAME_TOKEN_SECRET);

  return jsonResponse({
    ok: true,
    puzzleId: puzzle.puzzle_id,
    date: puzzle.date,
    length: 5,
    clues,
    gameToken
  });
}

async function handleGuess(request, env) {
  requireConfiguredEnvironment(env);

  const body = await parseRequestJson(request);
  const puzzleId = String(body?.puzzleId ?? "").trim();
  const guess = normalizeGuess(body?.guess);
  const tokenResult = await verifyGameToken(
    body?.gameToken,
    env.GAME_TOKEN_SECRET
  );

  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, message: tokenResult.message }, 400);
  }

  const session = tokenResult.payload;
  const sessionCheck = validateSessionForPuzzle(session, puzzleId);

  if (!sessionCheck.ok) {
    return jsonResponse({ ok: false, message: sessionCheck.message }, 400);
  }

  const puzzle = await getPuzzleById(env, puzzleId);
  if (!puzzle) {
    return jsonResponse({ ok: false, message: "This puzzle no longer exists." }, 404);
  }

  if (!isFiveLetterGuess(guess)) {
    return jsonResponse({ ok: false, message: "Not a valid word." }, 400);
  }

  if (session.guesses.includes(guess) || session.seventhGuess === guess) {
    return jsonResponse(
      {
        ok: false,
        duplicate: true,
        message: "Already guessed! Try another."
      },
      400
    );
  }

  if (session.status === "finished") {
    return jsonResponse({ ok: false, message: "The game has ended." }, 400);
  }

  const validWords = await loadValidWords();

  if (!validWords.has(guess)) {
    return jsonResponse({ ok: false, message: "Not a valid word." }, 400);
  }

  const feedback = evaluateGuess(guess, puzzle.answer);

  if (session.status === "playing") {
    const result = updateAfterNormalGuess(
      session,
      guess,
      feedback,
      normalizeGuess(puzzle.answer)
    );

    if (!result.ok) {
      return jsonResponse(result, 400);
    }

    const gameToken = await createGameToken(
      session,
      env.GAME_TOKEN_SECRET
    );

    return jsonResponse({
      ...result,
      gameToken
    });
  }

  if (session.status === "awaiting-seventh") {
    const result = getSeventhResult(guess, puzzle.answer);
    session.status = "finished";
    session.seventhGuessUsed = true;
    session.seventhGuess = guess;

    const gameToken = await createGameToken(
      session,
      env.GAME_TOKEN_SECRET
    );

    return jsonResponse({
      ok: true,
      feedback,
      result,
      isClose: result === FIVEWINK_RESULTS.FAILED_CLOSE,
      solved: false,
      finished: true,
      seventhGuessUsed: true,
      answer: normalizeGuess(puzzle.answer),
      gameToken
    });
  }

  return jsonResponse({ ok: false, message: "The game state is invalid." }, 400);
}

async function handleClue(request, env) {
  requireConfiguredEnvironment(env);

  const body = await parseRequestJson(request);
  const puzzleId = String(body?.puzzleId ?? "").trim();
  const clueNumber = Number(body?.clueNumber);

  const tokenResult = await verifyGameToken(
    body?.gameToken,
    env.GAME_TOKEN_SECRET
  );

  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, message: tokenResult.message }, 400);
  }

  const session = tokenResult.payload;
  const sessionCheck = validateSessionForPuzzle(session, puzzleId);

  if (!sessionCheck.ok) {
    return jsonResponse({ ok: false, message: sessionCheck.message }, 400);
  }

  if (session.status !== "playing") {
    return jsonResponse({ ok: false, message: "The game has ended." }, 400);
  }

  if (
    !Number.isInteger(clueNumber) ||
    clueNumber < 1 ||
    clueNumber > 5
  ) {
    return jsonResponse({ ok: false, message: "That clue does not exist." }, 400);
  }

  const attemptIndex = currentNormalAttemptIndex(session.attempts);

  if (attemptIndex === -1 || clueNumber !== attemptIndex + 1) {
    return jsonResponse(
      { ok: false, message: "That clue is not available on this attempt." },
      400
    );
  }

  if (session.clues[attemptIndex] !== "available") {
    return jsonResponse(
      { ok: false, message: "That clue is no longer available." },
      400
    );
  }

  session.attempts[attemptIndex] = "clue";
  session.clues[attemptIndex] = "used";
  session.cluesUsed += 1;

  const gameToken = await createGameToken(
    session,
    env.GAME_TOKEN_SECRET
  );

  return jsonResponse({
    ok: true,
    clueNumber,
    gameToken
  });
}

async function handleSkip(request, env) {
  requireConfiguredEnvironment(env);

  const body = await parseRequestJson(request);
  const puzzleId = String(body?.puzzleId ?? "").trim();

  const tokenResult = await verifyGameToken(
    body?.gameToken,
    env.GAME_TOKEN_SECRET
  );

  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, message: tokenResult.message }, 400);
  }

  const session = tokenResult.payload;
  const sessionCheck = validateSessionForPuzzle(session, puzzleId);

  if (!sessionCheck.ok) {
    return jsonResponse({ ok: false, message: sessionCheck.message }, 400);
  }

  if (session.status !== "awaiting-seventh") {
    return jsonResponse(
      { ok: false, message: "The seventh attempt is not available." },
      400
    );
  }

  const puzzle = await getPuzzleById(env, puzzleId);
  if (!puzzle) {
    return jsonResponse({ ok: false, message: "This puzzle no longer exists." }, 404);
  }

  session.status = "finished";
  session.result = FIVEWINK_RESULTS.FAILED_HARD;
  session.seventhGuessUsed = false;
  session.seventhGuess = null;

  const gameToken = await createGameToken(
    session,
    env.GAME_TOKEN_SECRET
  );

  return jsonResponse({
    ok: true,
    finished: true,
    result: FIVEWINK_RESULTS.FAILED_HARD,
    seventhGuessUsed: false,
    answer: normalizeGuess(puzzle.answer),
    gameToken
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  if (request.method === "GET" && path === "/api/health") {
    return jsonResponse({ ok: true, service: "emnifun" });
  }

  if (request.method === "GET" && path === "/api/fivewink/puzzle") {
    return handlePuzzle(request, env);
  }

  if (request.method === "POST" && path === "/api/fivewink/guess") {
    return handleGuess(request, env);
  }

  if (request.method === "POST" && path === "/api/fivewink/clue") {
    return handleClue(request, env);
  }

  if (request.method === "POST" && path === "/api/fivewink/skip") {
    return handleSkip(request, env);
  }

  return jsonResponse({ ok: false, message: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return jsonResponse(
        {
          ok: false,
          message:
            status === 500
              ? "FiveWink backend error. Please try again."
              : error.message
        },
        status
      );
    }
  }
};
