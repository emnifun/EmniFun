import { authenticateAdmin, authConfig } from "./auth.js";

function adminJsonResponse(data, status = 200, config, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": config.allowedOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders
    }
  });
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

function isValidDateString(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [y, m, d] = str.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function normalizeAnswer(str) {
  const trimmed = String(str ?? "").trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseAndValidateClues(clues) {
  if (!Array.isArray(clues) || clues.length !== 5) {
    return { ok: false, message: "A FiveWink puzzle must contain exactly 5 clues." };
  }
  const validated = [];
  for (let i = 0; i < 5; i += 1) {
    if (typeof clues[i] !== "string" || !clues[i].trim()) {
      return { ok: false, message: `Clue ${i + 1} cannot be empty.` };
    }
    validated.push(clues[i].trim());
  }
  return { ok: true, clues: validated };
}

async function parseJsonBody(request, maxBytes = 32 * 1024) {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw Object.assign(new Error("Request body is too large."), { status: 413 });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Invalid JSON request."), { status: 400 });
  }
}

function formatPuzzleRow(row) {
  let clues = [];
  try {
    clues = JSON.parse(row.clues_json);
  } catch {
    clues = [];
  }

  return {
    puzzleId: row.puzzle_id,
    game: row.game,
    date: row.date,
    answer: row.answer,
    clues,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function handleAdminRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    let config;
    try {
      config = authConfig(env);
    } catch {
      return new Response(null, { status: 500 });
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": config.allowedOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
      }
    });
  }

  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) {
    return auth.response;
  }
  const { session, config } = auth;

  try {
    // 1. Admin status verification
    if (path === "/api/admin/status" && request.method === "GET") {
      return adminJsonResponse(
        {
          ok: true,
          isAdmin: true,
          gamerTag: session.gamerTag,
          todayDate: getTodayDateIndia()
        },
        200,
        config
      );
    }

    // 2. List puzzles
    if (path === "/api/admin/puzzles" && request.method === "GET") {
      const statusFilter = url.searchParams.get("status");
      const searchQuery = url.searchParams.get("search")?.trim().toUpperCase();

      const result = await env.DB.prepare(
        `SELECT puzzle_id, game, date, answer, clues_json, status, created_at, updated_at
           FROM fivewink_puzzles
          ORDER BY date DESC`
      ).all();

      let puzzles = (result?.results || []).map(formatPuzzleRow);

      if (statusFilter && ["draft", "published", "unpublished", "archived"].includes(statusFilter)) {
        puzzles = puzzles.filter((p) => p.status === statusFilter);
      }

      if (searchQuery) {
        puzzles = puzzles.filter(
          (p) => p.date.includes(searchQuery) || p.answer.includes(searchQuery)
        );
      }

      return adminJsonResponse({ ok: true, puzzles }, 200, config);
    }

    // 3. Create puzzle
    if (path === "/api/admin/puzzles" && request.method === "POST") {
      const body = await parseJsonBody(request);
      const date = String(body?.date ?? "").trim();
      const answer = normalizeAnswer(body?.answer);
      const clueResult = parseAndValidateClues(body?.clues);

      if (!isValidDateString(date)) {
        return adminJsonResponse({ ok: false, message: "Valid date in YYYY-MM-DD format is required." }, 400, config);
      }

      if (!answer) {
        return adminJsonResponse({ ok: false, message: "Answer must be exactly five letters (A-Z)." }, 400, config);
      }

      if (!clueResult.ok) {
        return adminJsonResponse({ ok: false, message: clueResult.message }, 400, config);
      }

      const existingDate = await env.DB.prepare(
        "SELECT puzzle_id FROM fivewink_puzzles WHERE date = ?1 LIMIT 1"
      )
        .bind(date)
        .first();

      if (existingDate) {
        return adminJsonResponse({ ok: false, message: "A puzzle already exists for this date." }, 409, config);
      }

      const puzzleId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      await env.DB.prepare(
        `INSERT INTO fivewink_puzzles
          (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
         VALUES (?1, 'game1', ?2, ?3, ?4, 'draft', ?5, ?5)`
      )
        .bind(puzzleId, date, answer, JSON.stringify(clueResult.clues), now)
        .run();

      const created = {
        puzzleId,
        game: "game1",
        date,
        answer,
        clues: clueResult.clues,
        status: "draft",
        createdAt: now,
        updatedAt: now
      };

      return adminJsonResponse({ ok: true, puzzle: created }, 201, config);
    }

    // 4. Single puzzle routes (GET, PUT, publish, unpublish, archive)
    const puzzleMatch = path.match(/^\/api\/admin\/puzzles\/([^/]+)(?:\/(publish|unpublish|archive))?$/);
    if (puzzleMatch) {
      const puzzleId = decodeURIComponent(puzzleMatch[1]);
      const action = puzzleMatch[2];

      const row = await env.DB.prepare(
        `SELECT puzzle_id, game, date, answer, clues_json, status, created_at, updated_at
           FROM fivewink_puzzles
          WHERE puzzle_id = ?1
          LIMIT 1`
      )
        .bind(puzzleId)
        .first();

      if (!row) {
        return adminJsonResponse({ ok: false, message: "Puzzle not found." }, 404, config);
      }

      const puzzle = formatPuzzleRow(row);

      // GET single puzzle
      if (!action && request.method === "GET") {
        return adminJsonResponse({ ok: true, puzzle }, 200, config);
      }

      // PUT edit puzzle
      if (!action && request.method === "PUT") {
        if (puzzle.status === "published") {
          return adminJsonResponse(
            { ok: false, message: "Published puzzles are locked and cannot be edited." },
            409,
            config
          );
        }

        if (puzzle.status === "archived") {
          return adminJsonResponse(
            { ok: false, message: "Archived puzzles cannot be edited." },
            409,
            config
          );
        }

        const body = await parseJsonBody(request);
        const date = String(body?.date ?? puzzle.date).trim();
        const answer = normalizeAnswer(body?.answer ?? puzzle.answer);
        const clueResult = parseAndValidateClues(body?.clues ?? puzzle.clues);

        if (!isValidDateString(date)) {
          return adminJsonResponse({ ok: false, message: "Valid date in YYYY-MM-DD format is required." }, 400, config);
        }

        if (!answer) {
          return adminJsonResponse({ ok: false, message: "Answer must be exactly five letters (A-Z)." }, 400, config);
        }

        if (!clueResult.ok) {
          return adminJsonResponse({ ok: false, message: clueResult.message }, 400, config);
        }

        if (date !== puzzle.date) {
          const conflict = await env.DB.prepare(
            "SELECT puzzle_id FROM fivewink_puzzles WHERE date = ?1 AND puzzle_id != ?2 LIMIT 1"
          )
            .bind(date, puzzleId)
            .first();

          if (conflict) {
            return adminJsonResponse({ ok: false, message: "Another puzzle already exists for this date." }, 409, config);
          }
        }

        const now = Math.floor(Date.now() / 1000);

        await env.DB.prepare(
          `UPDATE fivewink_puzzles
              SET date = ?1,
                  answer = ?2,
                  clues_json = ?3,
                  updated_at = ?4
            WHERE puzzle_id = ?5`
        )
          .bind(date, answer, JSON.stringify(clueResult.clues), now, puzzleId)
          .run();

        const updated = {
          ...puzzle,
          date,
          answer,
          clues: clueResult.clues,
          updatedAt: now
        };

        return adminJsonResponse({ ok: true, puzzle: updated }, 200, config);
      }

      // POST publish
      if (action === "publish" && request.method === "POST") {
        if (!isValidDateString(puzzle.date)) {
          return adminJsonResponse({ ok: false, message: "Puzzle date is invalid." }, 400, config);
        }
        if (!normalizeAnswer(puzzle.answer)) {
          return adminJsonResponse({ ok: false, message: "Puzzle answer must be five letters." }, 400, config);
        }
        const clueCheck = parseAndValidateClues(puzzle.clues);
        if (!clueCheck.ok) {
          return adminJsonResponse({ ok: false, message: clueCheck.message }, 400, config);
        }

        const duplicatePublish = await env.DB.prepare(
          "SELECT puzzle_id FROM fivewink_puzzles WHERE date = ?1 AND status = 'published' AND puzzle_id != ?2 LIMIT 1"
        )
          .bind(puzzle.date, puzzleId)
          .first();

        if (duplicatePublish) {
          return adminJsonResponse(
            { ok: false, message: "Another puzzle is already published for this date." },
            409,
            config
          );
        }

        const now = Math.floor(Date.now() / 1000);

        await env.DB.prepare(
          "UPDATE fivewink_puzzles SET status = 'published', updated_at = ?1 WHERE puzzle_id = ?2"
        )
          .bind(now, puzzleId)
          .run();

        return adminJsonResponse({ ok: true, status: "published" }, 200, config);
      }

      // POST unpublish
      if (action === "unpublish" && request.method === "POST") {
        if (puzzle.status !== "published") {
          return adminJsonResponse({ ok: false, message: "Puzzle is not currently published." }, 400, config);
        }

        const now = Math.floor(Date.now() / 1000);

        await env.DB.prepare(
          "UPDATE fivewink_puzzles SET status = 'draft', updated_at = ?1 WHERE puzzle_id = ?2"
        )
          .bind(now, puzzleId)
          .run();

        return adminJsonResponse({ ok: true, status: "draft" }, 200, config);
      }

      // POST archive
      if (action === "archive" && request.method === "POST") {
        const now = Math.floor(Date.now() / 1000);

        await env.DB.prepare(
          "UPDATE fivewink_puzzles SET status = 'archived', updated_at = ?1 WHERE puzzle_id = ?2"
        )
          .bind(now, puzzleId)
          .run();

        return adminJsonResponse({ ok: true, status: "archived" }, 200, config);
      }
    }

    return adminJsonResponse({ ok: false, message: "Admin endpoint not found." }, 404, config);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return adminJsonResponse(
      { ok: false, message: status === 500 ? "Admin backend error." : error.message },
      status,
      config
    );
  }
}
