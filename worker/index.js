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

function parseSession(row) {
  let attempts;
  let guesses;
  let clues;

  try {
    attempts = JSON.parse(row.attempts_json);
    guesses = JSON.parse(row.guesses_json);
    clues = JSON.parse(row.clues_json);
  } catch (error) {
    throw new Error("Game session data is invalid.");
  }

  if (
    !Array.isArray(attempts) ||
    attempts.length !== 6 ||
    !Array.isArray(guesses) ||
    guesses.length > 6 ||
    !Array.isArray(clues) ||
    clues.length !== 5 ||
    !Number.isInteger(row.clues_used) ||
    row.clues_used < 0 ||
    row.clues_used > 5 ||
    !["playing", "awaiting-seventh", "finished"].includes(row.status) ||
    (row.seventh_guess !== null && !/^[A-Z]{5}$/.test(row.seventh_guess))
  ) {
    throw new Error("Game session data is invalid.");
  }

  const allowedAttemptValues = new Set(["guess", "clue"]);
  if (attempts.some((value) => value !== null && !allowedAttemptValues.has(value))) {
    throw new Error("Game session data is invalid.");
  }

  if (
    attempts.filter((value) => value === "guess").length !== guesses.length ||
    attempts.filter((value) => value === "clue").length !== row.clues_used
  ) {
    throw new Error("Game session data is invalid.");
  }

  if (
    guesses.some((guess) => !/^[A-Z]{5}$/.test(guess)) ||
    new Set(guesses).size !== guesses.length
  ) {
    throw new Error("Game session data is invalid.");
  }

  if (row.seventh_guess !== null && guesses.includes(row.seventh_guess)) {
    throw new Error("Game session data is invalid.");
  }

  if (
    clues.some((value) => !["available", "used", "skipped"].includes(value))
  ) {
    throw new Error("Game session data is invalid.");
  }

  if (
    clues.filter((value) => value === "used").length !== row.clues_used
  ) {
    throw new Error("Game session data is invalid.");
  }

  return {
    sessionId: row.session_id,
    puzzleId: row.puzzle_id,
    game: row.game,
    date: row.date,
    attempts,
    guesses,
    clues,
    cluesUsed: row.clues_used,
    status: row.status,
    result: row.result,
    seventhGuess: row.seventh_guess,
    version: row.version,
    expiresAt: row.expires_at
  };
}

async function loadSession(env, sessionId) {
  const row = await env.DB.prepare(
    "SELECT session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, result, seventh_guess, version, expires_at FROM fivewink_sessions WHERE session_id = ?1 LIMIT 1"
  )
    .bind(sessionId)
    .first();

  if (!row) {
    return { ok: false, message: "Game session was not found." };
  }

  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    return { ok: false, message: "Game session has expired." };
  }

  try {
    return { ok: true, session: parseSession(row) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

async function saveSession(env, session) {
  const result = await env.DB.prepare(\`UPDATE fivewink_sessions
     SET attempts_json = ?1,
         guesses_json = ?2,
         clues_json = ?3,
         clues_used = ?4,
         status = ?5,
         result = ?6,
         seventh_guess = ?7,
         version = version + 1,
         updated_at = ?8
     WHERE session_id = ?9 AND version = ?10\`)
    .bind(
      JSON.stringify(session.attempts),
      JSON.stringify(session.guesses),
      JSON.stringify(session.clues),
      session.cluesUsed,
      session.status,
      session.result,
      session.seventhGuess,
      Math.floor(Date.now() / 1000),
      session.sessionId,
      session.version
    )
    .run();

  if (result.meta?.changes !== 1) {
    return { ok: false, message: "The game state changed. Please try again." };
  }

  session.version += 1;
  return { ok: true };
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

async function createSession(env, puzzle) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 36 * 60 * 60;
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(
    \`INSERT INTO fivewink_sessions
      (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json,
       clues_used, status, result, seventh_guess, version, created_at, updated_at, expires_at)
     VALUES (?1, ?2, 'game1', ?3, ?4, ?5, ?6, 0, 'playing', NULL, NULL, 1, ?7, ?7, ?8)\`
  )
    .bind(
      sessionId,
      puzzle.puzzle_id,
      puzzle.date,
      JSON.stringify(Array(6).fill(null)),
      JSON.stringify([]),
      JSON.stringify(Array(5).fill("available")),
      now,
      expiresAt
    )
    .run();

  return { sessionId, expiresAt };
}

async function createSessionToken(session, secret) {
  return createGameToken(
    createFreshGameTokenPayload(
      session.sessionId,
      session.puzzleId,
      session.date
    ),
    secret
  );
}

function validatePuzzleForPlay(puzzle) {
  if (
    !puzzle ||
    puzzle.game !== "game1" ||
    puzzle.status !== "published" ||
    typeof puzzle.puzzle_id !== "string" ||
    typeof puzzle.date !== "string" ||
    !isFiveLetterGuess(puzzle.answer)
  ) {
    throw new Error("The FiveWink puzzle data is invalid.");
  }

  return parseClues(puzzle.clues_json);
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
    session.result = FIVEWINK_RESULTS.SOLVED;

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

async function handlePuzzle(env) {
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

  const clues = validatePuzzleForPlay(puzzle);
  const session = await createSession(env, puzzle);

  const gameToken = await createSessionToken(
    {
      sessionId: session.sessionId,
      puzzleId: puzzle.puzzle_id,
      date: puzzle.date
    },
    env.GAME_TOKEN_SECRET
  );

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

  if (tokenResult.payload.puzzleId !== puzzleId) {
    return jsonResponse(
      { ok: false, message: "Game session does not match this puzzle." },
      400
    );
  }

  const sessionResult = await loadSession(
    env,
    tokenResult.payload.sessionId
  );

  if (!sessionResult.ok) {
    return jsonResponse(
      { ok: false, message: sessionResult.message },
      400
    );
  }

  const session = sessionResult.session;

  if (
    session.puzzleId !== tokenResult.payload.puzzleId ||
    session.date !== tokenResult.payload.date
  ) {
    return jsonResponse({ ok: false, message: "Game session is invalid." }, 400);
  }

  if (session.status === "finished") {
    return jsonResponse({ ok: false, message: "The game has ended." }, 400);
  }

  const puzzle = await getPuzzleById(env, puzzleId);
  if (!puzzle) {
    return jsonResponse(
      { ok: false, message: "This puzzle no longer exists." },
      404
    );
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

  const validWords = await loadValidWords();

  if (!validWords.has(guess)) {
    return jsonResponse({ ok: false, message: "Not a valid word." }, 400);
  }

  const answer = normalizeGuess(puzzle.answer);
  const feedback = evaluateGuess(guess, answer);

  if (session.status === "playing") {
    const result = updateAfterNormalGuess(
      session,
      guess,
      feedback,
      answer
    );

    if (!result.ok) {
      return jsonResponse(result, 400);
    }

    const saveResult = await saveSession(env, session);
    if (!saveResult.ok) {
      return jsonResponse(saveResult, 409);
    }

    const gameToken = await createSessionToken(session, env.GAME_TOKEN_SECRET);

    return jsonResponse({
      ...result,
      gameToken
    });
  }

  if (session.status === "awaiting-seventh") {
    const result = getSeventhResult(guess, answer);

    session.status = "finished";
    session.result = result;
    session.seventhGuessUsed = true;
    session.seventhGuess = guess;

    const saveResult = await saveSession(env, session);
    if (!saveResult.ok) {
      return jsonResponse(saveResult, 409);
    }

    const gameToken = await createSessionToken(session, env.GAME_TOKEN_SECRET);

    return jsonResponse({
      ok: true,
      feedback,
      result,
      isClose: result === FIVEWINK_RESULTS.FAILED_CLOSE,
      solved: false,
      finished: true,
      seventhGuessUsed: true,
      answer,
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

  if (tokenResult.payload.puzzleId !== puzzleId) {
    return jsonResponse(
      { ok: false, message: "Game session does not match this puzzle." },
      400
    );
  }

  const sessionResult = await loadSession(
    env,
    tokenResult.payload.sessionId
  );

  if (!sessionResult.ok) {
    return jsonResponse(
      { ok: false, message: sessionResult.message },
      400
    );
  }

  const session = sessionResult.session;

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

  const saveResult = await saveSession(env, session);
  if (!saveResult.ok) {
    return jsonResponse(saveResult, 409);
  }

  const gameToken = await createSessionToken(session, env.GAME_TOKEN_SECRET);

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

  if (tokenResult.payload.puzzleId !== puzzleId) {
    return jsonResponse(
      { ok: false, message: "Game session does not match this puzzle." },
      400
    );
  }

  const sessionResult = await loadSession(
    env,
    tokenResult.payload.sessionId
  );

  if (!sessionResult.ok) {
    return jsonResponse(
      { ok: false, message: sessionResult.message },
      400
    );
  }

  const session = sessionResult.session;

  if (session.status !== "awaiting-seventh") {
    return jsonResponse(
      { ok: false, message: "The seventh attempt is not available." },
      400
    );
  }

  const puzzle = await getPuzzleById(env, puzzleId);
  if (!puzzle) {
    return jsonResponse(
      { ok: false, message: "This puzzle no longer exists." },
      404
    );
  }

  const answer = normalizeGuess(puzzle.answer);
  session.status = "finished";
  session.result = FIVEWINK_RESULTS.FAILED_HARD;
  session.seventhGuessUsed = false;
  session.seventhGuess = null;

  const saveResult = await saveSession(env, session);
  if (!saveResult.ok) {
    return jsonResponse(saveResult, 409);
  }

  const gameToken = await createSessionToken(session, env.GAME_TOKEN_SECRET);

  return jsonResponse({
    ok: true,
    finished: true,
    result: FIVEWINK_RESULTS.FAILED_HARD,
    seventhGuessUsed: false,
    answer,
    gameToken
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\\/+$/, "") || "/";

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
    return handlePuzzle(env);
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
