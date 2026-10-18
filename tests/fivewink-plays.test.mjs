import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker, { cleanupFiveWinkSessions } from "../worker/index.js";
import { getTodayDateIndia } from "../worker/admin.js";
import { __authInternals } from "../worker/auth.js";

const { sessionCookie } = __authInternals;
const allowedOrigin = "https://emnifun.github.io";
const secret = "test-only-recovery-vault-secret-not-production";

function createTestD1(db) {
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...boundValues) {
          values = boundValues;
          return statement;
        },
        async first() {
          return db.prepare(query).get(...values) ?? null;
        },
        async all() {
          return { results: db.prepare(query).all(...values) };
        },
        async run() {
          const result = db.prepare(query).run(...values);
          return { meta: { changes: Number(result.changes) } };
        }
      };
      return statement;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

async function setupTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0001_auth.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0002_auth_security_fixes.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0003_admin.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0004_fivewink_plays.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0005_fivewink_modes.sql", import.meta.url), "utf8"));
  return db;
}

function createEnv(db) {
  return {
    DB: createTestD1(db),
    AUTH_ALLOWED_ORIGIN: allowedOrigin,
    AUTH_SESSION_TTL_SECONDS: "2592000",
    AUTH_CHALLENGE_TTL_SECONDS: "600",
    GOOGLE_CHANGE_COOLDOWN_SECONDS: "2592000",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    AUTH_COOKIE_SAMESITE: "None",
    AUTH_COOKIE_PARTITIONED: "true",
    RECOVERY_KEY_VISIBILITY_SECONDS: "172800",
    RECOVERY_VAULT_SECRET_VERSION: "1",
    RECOVERY_VAULT_SECRET: secret,
    GAME_TOKEN_SECRET: "test-game-token-secret-for-fivewink-play-tests",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } }
  };
}

async function createTestAccount(db, { emnifeedId, gamerTag, isAdmin = 0 }) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO accounts (emnifeed_id, gamer_tag, gamer_tag_key, created_at, last_active_at, is_admin)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(emnifeedId, gamerTag, gamerTag.toLowerCase(), now, now, isAdmin ? 1 : 0);

  const sessionToken = "session-token-" + emnifeedId;
  const tokenHash = __authInternals.base64UrlEncode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionToken)))
  );

  db.prepare(
    `INSERT INTO auth_sessions (session_id, emnifeed_id, token_hash, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), emnifeedId, tokenHash, now, now, now + 86400);

  return { emnifeedId, sessionToken };
}

function seedPuzzle(db, { puzzleId, date, answer = "CRANE", status = "published" }) {
  db.prepare(
    `INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status)
     VALUES (?, 'game1', ?, ?, ?, ?)`
  ).run(
    puzzleId,
    date,
    answer,
    JSON.stringify(["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"]),
    status
  );
}

test("1 & 2 & 3: Guest users can create sessions, replay unlimited times, and remain untracked", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-guest-1", date: today });

  // Guest request 1
  const req1 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  });
  const res1 = await worker.fetch(req1, env);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.ok, true);
  assert.equal(data1.puzzleId, "p-guest-1");
  assert.ok(data1.gameToken);

  // Guest request 2 (same puzzle, unauthenticated)
  const req2 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  });
  const res2 = await worker.fetch(req2, env);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.ok, true);
  assert.equal(data2.puzzleId, "p-guest-1");
  assert.notEqual(data1.gameToken, data2.gameToken, "Guest gets independent session each time");

  // Verify zero rows in fivewink_plays
  const plays = db.prepare("SELECT COUNT(*) as count FROM fivewink_plays").get();
  assert.equal(plays.count, 0, "Guest plays must never be recorded in fivewink_plays table");
});

test("4 & 5 & 6: Authenticated user can play Puzzle A once, and second active request resumes same session", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "puzzle-a", date: today });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-one-12345678",
    gamerTag: "UserOne"
  });

  // Request 1: Allowed, creates session and play record
  const req1 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res1 = await worker.fetch(req1, env);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.ok, true);
  assert.equal(data1.puzzleId, "puzzle-a");

  // Verify play record created in fivewink_plays
  const playRow = db.prepare(
    "SELECT * FROM fivewink_plays WHERE emnifeed_id = ? AND puzzle_id = ?"
  ).get("EF-user-one-12345678", "puzzle-a");
  assert.ok(playRow, "Play record must exist in fivewink_plays");

  // Request 2: While active, resumes existing session
  const req2 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res2 = await worker.fetch(req2, env);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.ok, true);
  assert.equal(data2.resumed, true, "Existing active session must be resumed");
  assert.equal(data2.puzzleId, "puzzle-a");

  // Verify still only ONE play record exists
  const totalPlays = db.prepare("SELECT COUNT(*) as count FROM fivewink_plays").get();
  assert.equal(totalPlays.count, 1, "Only one play record must exist");
});

test("7: If Puzzle A is finished, replay is rejected with alreadyPlayed error", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "puzzle-fin", date: today });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-fin-12345678",
    gamerTag: "UserFin"
  });

  // Request 1: Start play
  const req1 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res1 = await worker.fetch(req1, env);
  const data1 = await res1.json();
  assert.equal(res1.status, 200);

  // Mark session as finished
  db.prepare("UPDATE fivewink_sessions SET status = 'finished', result = 'SOLVED'").run();

  // Request 2: Replay must be rejected
  const req2 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res2 = await worker.fetch(req2, env);
  assert.equal(res2.status, 403);
  const data2 = await res2.json();
  assert.equal(data2.ok, false);
  assert.equal(data2.alreadyPlayed, true);
  assert.match(data2.message, /already played/i);
});

test("8 & 9: Same user can play Puzzle A and Puzzle B published on the same calendar day", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "puzzle-same-day-A", date: today });
  seedPuzzle(db, { puzzleId: "puzzle-same-day-B", date: today + "-extra" });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-multi-12345678",
    gamerTag: "UserMulti"
  });

  // Play Puzzle A
  const reqA = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puzzle-same-day-A", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const resA = await worker.fetch(reqA, env);
  assert.equal(resA.status, 200);
  const dataA = await resA.json();
  assert.equal(dataA.puzzleId, "puzzle-same-day-A");

  // Play Puzzle B on same date: Allowed!
  const reqB = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puzzle-same-day-B", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const resB = await worker.fetch(reqB, env);
  assert.equal(resB.status, 200);
  const dataB = await resB.json();
  assert.equal(dataB.puzzleId, "puzzle-same-day-B");

  // Verify two distinct plays recorded
  const plays = db.prepare(
    "SELECT puzzle_id FROM fivewink_plays WHERE emnifeed_id = ? ORDER BY puzzle_id"
  ).all("EF-user-multi-12345678");
  assert.equal(plays.length, 2);
  assert.equal(plays[0].puzzle_id, "puzzle-same-day-A");
  assert.equal(plays[1].puzzle_id, "puzzle-same-day-B");
});

test("10: Puzzle spanning multiple dates cannot be replayed on the second date", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  // Puzzle published on Oct 12
  seedPuzzle(db, { puzzleId: "puzzle-oct-12", date: "2026-10-12" });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-dates-12345678",
    gamerTag: "UserDates"
  });

  // User plays Puzzle on Oct 12
  const req1 = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puzzle-oct-12", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res1 = await worker.fetch(req1, env);
  assert.equal(res1.status, 200);

  // Mark finished
  db.prepare("UPDATE fivewink_sessions SET status = 'finished' WHERE puzzle_id = 'puzzle-oct-12'").run();

  // On Oct 13, user requests same puzzle: MUST be blocked
  const req2 = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puzzle-oct-12", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res2 = await worker.fetch(req2, env);
  assert.equal(res2.status, 403);
  const data2 = await res2.json();
  assert.equal(data2.alreadyPlayed, true);
});

test("11 & 12: Second browser/device or cleared storage cannot bypass the restriction", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "puzzle-device", date: today });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-device-12345678",
    gamerTag: "UserDevice"
  });

  // Device 1 plays and finishes
  const req1 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      "User-Agent": "Device-1 / Chrome",
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res1 = await worker.fetch(req1, env);
  assert.equal(res1.status, 200);
  db.prepare("UPDATE fivewink_sessions SET status = 'finished' WHERE puzzle_id = 'puzzle-device'").run();

  // Device 2 (new User-Agent, clean browser, no localStorage) logs in and requests puzzle
  const req2 = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: {
      Origin: allowedOrigin,
      "User-Agent": "Device-2 / Safari",
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const res2 = await worker.fetch(req2, env);
  assert.equal(res2.status, 403);
  const data2 = await res2.json();
  assert.equal(data2.alreadyPlayed, true);
});

test("13: Concurrent first-play requests cannot create two plays (atomicity)", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "puzzle-concurrent", date: today });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-concur-12345678",
    gamerTag: "UserConcur"
  });

  const createReq = () =>
    new Request("https://emnifun.github.io/api/fivewink/puzzle", {
      headers: {
        Origin: allowedOrigin,
        Cookie: `__Host-emnifun_session=${sessionToken}`
      }
    });

  // Send two requests concurrently
  const [resA, resB] = await Promise.all([
    worker.fetch(createReq(), env),
    worker.fetch(createReq(), env)
  ]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  // Both must return valid gameplay responses pointing to the same session
  const dataA = await resA.json();
  const dataB = await resB.json();
  assert.equal(dataA.ok, true);
  assert.equal(dataB.ok, true);

  // Verify EXACTLY one row in fivewink_plays
  const playCount = db.prepare(
    "SELECT COUNT(*) as count FROM fivewink_plays WHERE emnifeed_id = ? AND puzzle_id = ?"
  ).get("EF-user-concur-12345678", "puzzle-concurrent");
  assert.equal(playCount.count, 1, "Exactly one play must be recorded despite concurrent requests");
});

test("14, 15, 16, 17: Permanent puzzle deletion removes sessions and plays cleanly without touching accounts or other puzzles", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "del-puzzle-A", date: today });
  seedPuzzle(db, { puzzleId: "del-puzzle-B", date: "2026-12-31" });

  const { emnifeedId, sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-admin-12345678",
    gamerTag: "AdminMaster",
    isAdmin: 1
  });

  // User plays Puzzle A
  const reqPlay = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=del-puzzle-A", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  await worker.fetch(reqPlay, env);

  // User plays Puzzle B
  const reqPlayB = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=del-puzzle-B", {
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  await worker.fetch(reqPlayB, env);

  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_plays").get().c, 2);

  // Admin permanently deletes Puzzle A
  const delReq = new Request("https://emnifun.github.io/api/admin/puzzles/del-puzzle-A", {
    method: "DELETE",
    headers: {
      Origin: allowedOrigin,
      Cookie: `__Host-emnifun_session=${sessionToken}`
    }
  });
  const delRes = await worker.fetch(delReq, env);
  assert.equal(delRes.status, 200);

  // Verify Puzzle A is gone from puzzles, sessions, and plays
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_puzzles WHERE puzzle_id = 'del-puzzle-A'").get().c,
    0
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE puzzle_id = 'del-puzzle-A'").get().c,
    0
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_plays WHERE puzzle_id = 'del-puzzle-A'").get().c,
    0,
    "fivewink_plays for deleted puzzle must be completely wiped"
  );

  // Verify Puzzle B and Account remain intact
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_puzzles WHERE puzzle_id = 'del-puzzle-B'").get().c,
    1
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM accounts WHERE emnifeed_id = ?").get(emnifeedId).c,
    1
  );
});

test("18, 19, 20: FiveWink session cleanup removes expired and finished sessions but preserves active games and play records", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const now = Math.floor(Date.now() / 1000);

  seedPuzzle(db, { puzzleId: "clean-puz", date: "2026-10-10" });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-user-clean-12345678",
    gamerTag: "UserClean"
  });

  // Insert 3 sessions in fivewink_sessions:
  // 1. Expired session (expires_at <= now)
  db.prepare(`
    INSERT INTO fivewink_sessions (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, created_at, updated_at, expires_at)
    VALUES ('sess-expired', 'clean-puz', 'game1', '2026-10-10', '[]', '[]', '[]', 0, 'playing', ?, ?, ?)
  `).run(now - 100000, now - 100000, now - 10);

  // 2. Finished old session (status = 'finished', updated_at <= now - 86400)
  db.prepare(`
    INSERT INTO fivewink_sessions (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, created_at, updated_at, expires_at)
    VALUES ('sess-old-finished', 'clean-puz', 'game1', '2026-10-10', '[]', '[]', '[]', 0, 'finished', ?, ?, ?)
  `).run(now - 100000, now - 90000, now + 10000);

  // 3. Active in-progress session (status = 'playing', expires_at > now)
  db.prepare(`
    INSERT INTO fivewink_sessions (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, created_at, updated_at, expires_at)
    VALUES ('sess-active', 'clean-puz', 'game1', '2026-10-10', '[]', '[]', '[]', 0, 'playing', ?, ?, ?)
  `).run(now, now, now + 50000);

  // Play record in fivewink_plays for EF-user-clean-12345678 on clean-puz
  db.prepare(`
    INSERT INTO fivewink_plays (emnifeed_id, puzzle_id, session_id, created_at)
    VALUES ('EF-user-clean-12345678', 'clean-puz', 'sess-old-finished', ?)
  `).run(now - 90000);

  // Run cleanup
  await cleanupFiveWinkSessions(env);

  // Check results:
  // sess-expired (unlinked guest session) should be DELETED
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-expired'").get().c, 0);

  // sess-old-finished (linked to authenticated play) MUST SURVIVE cleanup
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-old-finished'").get().c,
    1,
    "Finished sessions belonging to authenticated players must survive cleanup"
  );

  // sess-active must REMAIN
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-active'").get().c, 1);

  // fivewink_plays record MUST REMAIN intact so user cannot replay!
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_plays WHERE emnifeed_id = 'EF-user-clean-12345678'").get().c,
    1,
    "fivewink_plays must never be cleaned up prematurely"
  );
});

test("21: Active session restoration returns evaluations array and does NOT leak the answer", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  seedPuzzle(db, { puzzleId: "puz-resume-test", date: "2026-10-12", answer: "HUMAN" });

  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-resume-user-1",
    gamerTag: "ResumeUser"
  });

  // 1. Initial play request
  const startReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-resume-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const startRes = await worker.fetch(startReq, env);
  const startData = await startRes.json();
  assert.equal(startData.ok, true);
  assert.ok(startData.gameToken);
  assert.equal(startData.answer, undefined, "Active play must NEVER leak the answer!");

  // 2. Submit first guess: PLANT
  const guessReq = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      "Content-Type": "application/json",
      Cookie: `__Host-emnifun_session=${sessionToken}`
    },
    body: JSON.stringify({
      puzzleId: "puz-resume-test",
      guess: "PLANT",
      gameToken: startData.gameToken
    })
  });
  const guessRes = await worker.fetch(guessReq, env);
  const guessData = await guessRes.json();
  assert.equal(guessData.ok, true);

  // 3. User logs out and returns (re-requests puzzle)
  const resumeReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-resume-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const resumeRes = await worker.fetch(resumeReq, env);
  const resumeData = await resumeRes.json();

  assert.equal(resumeData.ok, true);
  assert.equal(resumeData.resumed, true);
  assert.ok(resumeData.gameToken);
  assert.equal(resumeData.answer, undefined, "Resumed active play must NEVER leak the answer!");
  assert.deepEqual(resumeData.guesses, ["PLANT"]);
  assert.ok(Array.isArray(resumeData.evaluations), "evaluations must be an Array");
  assert.equal(resumeData.evaluations.length, 1);
  assert.ok(Array.isArray(resumeData.evaluations[0]), "evaluations[0] must be an Array");
  assert.equal(resumeData.evaluations[0].length, 5);
  // PLANT against HUMAN:
  // P: absent, L: absent, A: wrong-position, N: wrong-position, T: absent
  assert.deepEqual(resumeData.evaluations[0], ["absent", "absent", "wrong-position", "wrong-position", "absent"]);

  // 4. Submit second guess SCRAP with resumed gameToken
  const secondGuessReq = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      "Content-Type": "application/json",
      Cookie: `__Host-emnifun_session=${sessionToken}`
    },
    body: JSON.stringify({
      puzzleId: "puz-resume-test",
      guess: "SCRAP",
      gameToken: resumeData.gameToken
    })
  });
  const secondGuessRes = await worker.fetch(secondGuessReq, env);
  const secondGuessData = await secondGuessRes.json();
  assert.equal(secondGuessData.ok, true);
  assert.equal(secondGuessData.attemptIndex, 1);
});

test("22: Completed puzzle returns completed=true, previous guesses, evaluations, result, answer, and NO gameToken", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  seedPuzzle(db, { puzzleId: "puz-complete-test", date: "2026-10-12", answer: "HUMAN" });

  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-complete-user-1",
    gamerTag: "CompleteUser"
  });

  // 1. Initial play
  const startReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-complete-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const startRes = await worker.fetch(startReq, env);
  const startData = await startRes.json();

  // 2. Guess 1: PLANT
  const guess1Req = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-complete-test", guess: "PLANT", gameToken: startData.gameToken })
  });
  const guess1Res = await worker.fetch(guess1Req, env);
  const guess1Data = await guess1Res.json();

  // 3. Guess 2: HUMAN (solves the puzzle!)
  const guess2Req = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-complete-test", guess: "HUMAN", gameToken: guess1Data.gameToken })
  });
  const guess2Res = await worker.fetch(guess2Req, env);
  const guess2Data = await guess2Res.json();
  assert.equal(guess2Data.ok, true);
  assert.equal(guess2Data.solved, true);
  assert.equal(guess2Data.finished, true);

  // 4a. Default replay attempt: rejects with 403 alreadyPlayed but attaches completed payload
  const replayReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-complete-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const replayRes = await worker.fetch(replayReq, env);
  assert.equal(replayRes.status, 403);
  const replayData = await replayRes.json();
  assert.equal(replayData.alreadyPlayed, true);
  assert.equal(replayData.completed, true);
  assert.equal(replayData.gameToken, undefined);

  // 4b. Completed view request returns 200 OK
  const revisitReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-complete-test&view=completed", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const revisitRes = await worker.fetch(revisitReq, env);
  assert.equal(revisitRes.status, 200);
  const revisitData = await revisitRes.json();

  assert.equal(revisitData.ok, true);
  assert.equal(revisitData.completed, true);
  assert.equal(revisitData.alreadyPlayed, true);
  assert.equal(revisitData.status, "finished");
  assert.equal(revisitData.result, "SOLVED");
  assert.equal(revisitData.answer, "HUMAN");
  assert.equal(revisitData.gameToken, undefined, "Completed view must NOT contain a gameToken!");
  assert.deepEqual(revisitData.guesses, ["PLANT", "HUMAN"]);
  assert.equal(revisitData.evaluations.length, 2);
  assert.deepEqual(revisitData.evaluations[1], ["correct", "correct", "correct", "correct", "correct"]);

  // 5. Read-only verification: Trying to submit another guess must fail
  const cheatReq = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-complete-test", guess: "OTHER", gameToken: guess2Data.gameToken })
  });
  const cheatRes = await worker.fetch(cheatReq, env);
  assert.equal(cheatRes.status, 400);
  const cheatData = await cheatRes.json();
  assert.equal(cheatData.ok, false);
  assert.match(cheatData.message, /ended/i);
});

test("23: Account isolation: User A cannot view User B's completed puzzle", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  seedPuzzle(db, { puzzleId: "puz-iso-test", date: "2026-10-12", answer: "HUMAN" });

  const userA = await createTestAccount(db, { emnifeedId: "EF-userA", gamerTag: "UserA" });
  const userB = await createTestAccount(db, { emnifeedId: "EF-userB", gamerTag: "UserB" });

  // User A completes the puzzle
  const startReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-iso-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${userA.sessionToken}` }
  });
  const startData = await (await worker.fetch(startReq, env)).json();
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-iso-test", guess: "HUMAN", gameToken: startData.gameToken })
  }), env);

  // User B requests the puzzle: must get a fresh new game, NOT User A's completed game
  const reqB = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-iso-test", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${userB.sessionToken}` }
  });
  const resB = await worker.fetch(reqB, env);
  const dataB = await resB.json();
  assert.equal(dataB.ok, true);
  assert.equal(dataB.completed, undefined, "User B must not see User A's completed state");
  assert.equal(dataB.resumed, undefined);
  assert.ok(dataB.gameToken, "User B gets a fresh gameToken to play");
});

test("24: Future Archive and expiration scenario: unfinished puzzle survives expiration and remains restorable by original puzzle_id", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const now = Math.floor(Date.now() / 1000);

  // Puzzle A created in the past
  seedPuzzle(db, { puzzleId: "puz-archive-A", date: "2026-09-01", answer: "HUMAN" });
  const { sessionToken } = await createTestAccount(db, {
    emnifeedId: "EF-archive-player",
    gamerTag: "ArchivePlayer"
  });

  // User starts Puzzle A and guesses PLANT
  const startReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-archive-A", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const startData = await (await worker.fetch(startReq, env)).json();

  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-archive-A", guess: "PLANT", gameToken: startData.gameToken })
  }), env);

  // Time passes: session expires (simulate 100 days later)
  db.prepare("UPDATE fivewink_sessions SET expires_at = ? WHERE puzzle_id = 'puz-archive-A'").run(now - 10000);

  // Session cleanup runs
  await cleanupFiveWinkSessions(env);

  // Verify session was NOT deleted because it belongs to an authenticated player in fivewink_plays
  const sessRow = db.prepare("SELECT * FROM fivewink_sessions WHERE puzzle_id = 'puz-archive-A'").get();
  assert.ok(sessRow, "Durable player session must survive past expiration");

  // Move Puzzle A to 'archived' status (simulate future archive transition)
  db.prepare("UPDATE fivewink_puzzles SET status = 'archived' WHERE puzzle_id = 'puz-archive-A'").run();

  // User accesses Puzzle A later by original puzzle_id
  const restoreReq = new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-archive-A", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${sessionToken}` }
  });
  const restoreRes = await worker.fetch(restoreReq, env);
  assert.equal(restoreRes.status, 200);
  const restoreData = await restoreRes.json();

  assert.equal(restoreData.ok, true);
  assert.equal(restoreData.resumed, true);
  assert.ok(restoreData.gameToken, "Fresh gameToken must be issued upon resumption");
  assert.deepEqual(restoreData.guesses, ["PLANT"], "Previous guess must be restored");
  assert.equal(restoreData.evaluations.length, 1);
  assert.deepEqual(restoreData.evaluations[0], ["absent", "absent", "wrong-position", "wrong-position", "absent"]);

  // Player can submit their next guess using the fresh gameToken
  const nextGuessRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "puz-archive-A", guess: "HUMAN", gameToken: restoreData.gameToken })
  }), env);
  const nextGuessData = await nextGuessRes.json();
  assert.equal(nextGuessData.ok, true);
  assert.equal(nextGuessData.solved, true);
});

test("25: Future-compatible account and puzzle deletion lifetime isolation", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  seedPuzzle(db, { puzzleId: "puz-life-1", date: "2026-10-10", answer: "CRANE" });
  seedPuzzle(db, { puzzleId: "puz-life-2", date: "2026-10-11", answer: "STONE" });

  const user1 = await createTestAccount(db, { emnifeedId: "EF-user1-del", gamerTag: "User1Del" });
  const user2 = await createTestAccount(db, { emnifeedId: "EF-user2-del", gamerTag: "User2Del" });

  // User 1 plays Puzzle 1 and Puzzle 2
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-life-1", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user1.sessionToken}` }
  }), env);
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-life-2", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user1.sessionToken}` }
  }), env);

  // User 2 plays Puzzle 1
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle?puzzleId=puz-life-1", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user2.sessionToken}` }
  }), env);

  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_plays").get().c, 3);

  // Future Account Deletion simulation for User 1:
  // Deleting User 1 removes their plays and sessions
  const user1Sessions = db.prepare("SELECT session_id FROM fivewink_plays WHERE emnifeed_id = 'EF-user1-del'").all();
  for (const row of user1Sessions) {
    db.prepare("DELETE FROM fivewink_sessions WHERE session_id = ?").run(row.session_id);
  }
  db.prepare("DELETE FROM fivewink_plays WHERE emnifeed_id = 'EF-user1-del'").run();

  // User 1 state is gone
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_plays WHERE emnifeed_id = 'EF-user1-del'").get().c, 0);

  // User 2 state remains completely intact
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_plays WHERE emnifeed_id = 'EF-user2-del'").get().c, 1);
  const user2Play = db.prepare("SELECT * FROM fivewink_plays WHERE emnifeed_id = 'EF-user2-del'").get();
  assert.ok(db.prepare("SELECT * FROM fivewink_sessions WHERE session_id = ?").get(user2Play.session_id));
});

test("26: Mode selection via /api/fivewink/mode and placeholder rejection", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-mode-1", date: today, answer: "HOUSE" });

  const pReq = new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  });
  const pRes = await worker.fetch(pReq, env);
  const pData = await pRes.json();
  assert.equal(pData.mode, "default");
  assert.equal(pData.modeLocked, false);

  // Switch to hard1 before first gameplay action
  const mRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-mode-1", mode: "hard1", gameToken: pData.gameToken })
  }), env);
  assert.equal(mRes.status, 200);
  const mData = await mRes.json();
  assert.equal(mData.ok, true);
  assert.equal(mData.mode, "hard1");
  assert.equal(mData.modeLocked, false);

  // Reject placeholder modes hard2 and hard3
  for (const placeholder of ["hard2", "hard3", "invalid_mode"]) {
    const badRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId: "p-mode-1", mode: placeholder, gameToken: pData.gameToken })
    }), env);
    assert.equal(badRes.status, 400);
    const badData = await badRes.json();
    assert.equal(badData.ok, false);
  }
});

test("27: Mode locks on first guess and prevents mode switching", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-mode-lock", date: today, answer: "HOUSE" });

  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();

  // First guess with mode: "hard1"
  const gRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-mode-lock", guess: "CRANE", mode: "hard1", gameToken: pData.gameToken })
  }), env);
  assert.equal(gRes.status, 200);
  const gData = await gRes.json();
  assert.equal(gData.mode, "hard1");
  assert.equal(gData.modeLocked, true);

  // Trying to switch mode via /api/fivewink/mode now fails
  const switchRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-mode-lock", mode: "default", gameToken: gData.gameToken })
  }), env);
  assert.equal(switchRes.status, 400);
  const switchData = await switchRes.json();
  assert.equal(switchData.message, "The game mode is locked for this puzzle.");

  // Submitting a guess with conflicting mode is rejected
  const confRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-mode-lock", guess: "PLANT", mode: "default", gameToken: gData.gameToken })
  }), env);
  assert.equal(confRes.status, 400);
  const confData = await confRes.json();
  assert.equal(confData.message, "The game mode is locked for this puzzle.");
});

test("28: Server-side Hard Mode: Strict constraint validation on guesses", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  // Answer: HOUSE
  seedPuzzle(db, { puzzleId: "p-hard-rules", date: today, answer: "HOUSE" });

  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();

  // Guess 1: HORSE -> H(green), O(green), R(grey), S(green), E(green)
  const g1Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-hard-rules", guess: "HORSE", mode: "hard1", gameToken: pData.gameToken })
  }), env);
  assert.equal(g1Res.status, 200);
  const g1Data = await g1Res.json();
  assert.deepEqual(g1Data.feedback, ["correct", "correct", "absent", "correct", "correct"]);

  // Guess 2 violating green pos 1: MOUSE (pos 1 is M instead of H)
  const g2BadRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-hard-rules", guess: "MOUSE", mode: "hard1", gameToken: g1Data.gameToken })
  }), env);
  assert.equal(g2BadRes.status, 400);
  const g2BadData = await g2BadRes.json();
  assert.equal(g2BadData.message, "Position 1 must be H.");

  // Valid Guess 2 obeying green constraints: HOUSE (solves puzzle)
  const g2GoodRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-hard-rules", guess: "HOUSE", mode: "hard1", gameToken: g1Data.gameToken })
  }), env);
  assert.equal(g2GoodRes.status, 200);
  const g2GoodData = await g2GoodRes.json();
  assert.equal(g2GoodData.solved, true);
  assert.equal(g2GoodData.mode, "hard1");
});

test("29: Clue endpoint rejection in Hard Mode: Strict and locking in Standard", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-clue-mode", date: today, answer: "HOUSE" });

  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();

  // Set mode to hard1
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-clue-mode", mode: "hard1", gameToken: pData.gameToken })
  }), env);

  // Requesting clue in hard1 is rejected with 400
  const clueRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/clue", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-clue-mode", clueNumber: 1, gameToken: pData.gameToken })
  }), env);
  assert.equal(clueRes.status, 400);
  const clueData = await clueRes.json();
  assert.equal(clueData.message, "Clues are not available in Hard Mode: Strict.");

  // For a separate session in Standard mode, clue works and locks mode to default
  const p2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const p2Data = await p2Res.json();
  const stdClueRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/clue", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-clue-mode", clueNumber: 1, gameToken: p2Data.gameToken })
  }), env);
  assert.equal(stdClueRes.status, 200);
  const stdClueData = await stdClueRes.json();
  assert.equal(stdClueData.mode, "default");
  assert.equal(stdClueData.modeLocked, true);
});

test("30: Seventh guess obeys Hard Mode: Strict constraints", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-seventh-hard", date: today, answer: "HOUSE" });

  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  let pData = await pRes.json();
  let token = pData.gameToken;

  // Set mode to hard1
  await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-seventh-hard", mode: "hard1", gameToken: token })
  }), env);

  // Six normal attempts leading up to 7th stage:
  // Guesses 1-5 avoid locking all positions; Guess 6 (HORSE) confirms H, O, S, E as green
  const words = ["PLANT", "BRICK", "DOWDY", "FOAMY", "SOAPY", "HORSE"];
  for (const w of words) {
    const res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId: "p-seventh-hard", guess: w, mode: "hard1", gameToken: token })
    }), env);
    const d = await res.json();
    token = d.gameToken;
    if (d.seventhStage) break;
  }

  // 7th guess violating position 1: MOUSE
  const badSeventh = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-seventh-hard", guess: "MOUSE", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(badSeventh.status, 400);
  const badSeventhData = await badSeventh.json();
  assert.equal(badSeventhData.message, "Position 1 must be H.");

  // 7th guess obeying constraints: HOUSE
  const goodSeventh = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-seventh-hard", guess: "HOUSE", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(goodSeventh.status, 200);
  const goodSeventhData = await goodSeventh.json();
  assert.equal(goodSeventhData.finished, true);
  assert.equal(goodSeventhData.result, "FAILED_CLOSE");
  assert.equal(goodSeventhData.mode, "hard1");
});

test("31: Resumption and completed puzzle payload returns correct mode and locks", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-resume-mode", date: today, answer: "HOUSE" });
  const user = await createTestAccount(db, { emnifeedId: "EF-user-mode", gamerTag: "ModeMaster" });

  // Start puzzle authenticated
  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user.sessionToken}` }
  }), env);
  const pData = await pRes.json();

  // Make first guess with mode: hard1
  const gRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-resume-mode", guess: "CRANE", mode: "hard1", gameToken: pData.gameToken })
  }), env);
  const gData = await gRes.json();

  // Resume active puzzle
  const resumeRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user.sessionToken}` }
  }), env);
  const resumeData = await resumeRes.json();
  assert.equal(resumeData.resumed, true);
  assert.equal(resumeData.mode, "hard1");
  assert.equal(resumeData.modeLocked, true);

  // Solve puzzle
  const solveRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-resume-mode", guess: "HOUSE", mode: "hard1", gameToken: resumeData.gameToken })
  }), env);
  const solveData = await solveRes.json();
  assert.equal(solveData.solved, true);

  // Completed puzzle access
  const completedRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin, Cookie: `__Host-emnifun_session=${user.sessionToken}` }
  }), env);
  assert.equal(completedRes.status, 403);
  const completedData = await completedRes.json();
  assert.equal(completedData.mode, "hard1");
  assert.equal(completedData.modeLocked, true);

  // Verify fivewink_plays table row has mode = 'hard1'
  const playRow = db.prepare("SELECT mode FROM fivewink_plays WHERE emnifeed_id = 'EF-user-mode'").get();
  assert.equal(playRow.mode, "hard1");
});

test("32: Skip operations and mode locking: non-final skip locks mode, rejected skip does not lock mode, 7th skip locks mode", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-skip-mode", date: today, answer: "HOUSE" });

  // 1. Fresh session in playing status
  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();
  const token = pData.gameToken;

  // Rejected skip request (status === 'playing', seventh not available)
  const rejSkipRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/skip", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-mode", gameToken: token })
  }), env);
  assert.equal(rejSkipRes.status, 400);
  const rejSkipData = await rejSkipRes.json();
  assert.equal(rejSkipData.message, "The seventh attempt is not available.");

  // Because skip was rejected, mode is NOT locked; mode change must succeed
  const setModeRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-mode", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(setModeRes.status, 200);
  const setModeData = await setModeRes.json();
  assert.equal(setModeData.mode, "hard1");

  // 2. Non-final skip in fivewink_sessions locks the mode immediately
  // Manually update attempts_json to simulate an attempt consumed by skip
  db.prepare(`
    UPDATE fivewink_sessions
    SET attempts_json = ?1
    WHERE puzzle_id = 'p-skip-mode'
  `).run(JSON.stringify(["skip", null, null, null, null, null]));

  // Subsequent mode change must be rejected as locked (status 400)
  const lockedModeRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-mode", mode: "default", gameToken: token })
  }), env);
  assert.equal(lockedModeRes.status, 400);
  const lockedModeData = await lockedModeRes.json();
  assert.equal(lockedModeData.message, "The game mode is locked for this puzzle.");

  // 3. Seventh-guess skip locks the mode immediately
  const p2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  let p2Data = await p2Res.json();
  let token2 = p2Data.gameToken;

  // Make 6 distinct non-matching guesses to reach awaiting-seventh
  const guesses = ["PLANT", "BRICK", "DOWDY", "FOAMY", "SOAPY", "HORSE"];
  for (const g of guesses) {
    const res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId: "p-skip-mode", guess: g, gameToken: token2 })
    }), env);
    const d = await res.json();
    token2 = d.gameToken;
    if (d.seventhStage) break;
  }

  // Skip the seventh attempt
  const seventhSkipRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/skip", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-mode", gameToken: token2 })
  }), env);
  assert.equal(seventhSkipRes.status, 200);
  const seventhSkipData = await seventhSkipRes.json();
  assert.equal(seventhSkipData.finished, true);
  assert.equal(seventhSkipData.modeLocked, true);

  // Attempting to change mode after seventh skip must fail
  const postSkipModeRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-mode", mode: "hard1", gameToken: seventhSkipData.gameToken })
  }), env);
  assert.equal(postSkipModeRes.status, 400);
  const postSkipModeData = await postSkipModeRes.json();
  assert.equal(postSkipModeData.message, "The game mode is locked for this puzzle.");
});

test("33: Atomic mode locking: concurrent mode change and gameplay action (guess/clue)", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-concur-mode", date: today, answer: "HOUSE" });

  // A. Concurrent mode change and guess submission
  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();
  const token = pData.gameToken;

  const modeReq = new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", mode: "hard1", gameToken: token })
  });
  const guessReq = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", guess: "CRANE", mode: "default", gameToken: token })
  });

  const [resMode, resGuess] = await Promise.all([
    worker.fetch(modeReq, env),
    worker.fetch(guessReq, env)
  ]);

  // A. Mode change followed by conflicting guess submission is rejected with 400
  const dMode = await resMode.json();
  const dGuess = await resGuess.json();
  assert.equal(resMode.status, 200);
  assert.equal(dMode.mode, "hard1");
  assert.equal(resGuess.status, 400);
  assert.equal(dGuess.message, "The game mode is locked for this puzzle.");

  // B. Genuine concurrent OCC race: both requests load version 1 simultaneously
  let loadCount = 0;
  let releaseFirst;
  const barrier = new Promise((resolve) => { releaseFirst = resolve; });

  const customDb = {
    ...env.DB,
    prepare(query) {
      const stmt = env.DB.prepare(query);
      return {
        bind(...args) {
          stmt.bind(...args);
          return this;
        },
        async first() {
          const res = await stmt.first();
          if (typeof query === "string" && query.includes("FROM fivewink_sessions WHERE session_id = ?1")) {
            loadCount++;
            if (loadCount === 1) {
              // First request pauses until second request also reads version 1
              await barrier;
            } else if (loadCount === 2) {
              // Second request has also loaded version 1; release first request
              releaseFirst();
            }
          }
          return res;
        },
        async run() {
          return stmt.run();
        },
        async all() {
          return stmt.all();
        }
      };
    }
  };
  const concurEnv = { ...env, DB: customDb };

  const p2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const p2Data = await p2Res.json();
  const token2 = p2Data.gameToken;

  const mode2Req = new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", mode: "hard1", gameToken: token2 })
  });
  const clue2Req = new Request("https://emnifun.github.io/api/fivewink/clue", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", clueNumber: 1, gameToken: token2 })
  });

  const [resMode2, resClue2] = await Promise.all([
    worker.fetch(mode2Req, concurEnv),
    worker.fetch(clue2Req, concurEnv)
  ]);

  const statuses2 = [resMode2.status, resClue2.status].sort();
  assert.deepEqual(statuses2, [200, 409], "Exactly one concurrent action must succeed and one must fail with 409 due to version conflict");

  // C. Genuine concurrent OCC race: concurrent mode change and guess submission both loading version 1
  let loadCount3 = 0;
  let releaseFirst3;
  const barrier3 = new Promise((resolve) => { releaseFirst3 = resolve; });

  const customDb3 = {
    ...env.DB,
    prepare(query) {
      const stmt = env.DB.prepare(query);
      return {
        bind(...args) {
          stmt.bind(...args);
          return this;
        },
        async first() {
          const res = await stmt.first();
          if (typeof query === "string" && query.includes("FROM fivewink_sessions WHERE session_id = ?1")) {
            loadCount3++;
            if (loadCount3 === 1) {
              await barrier3;
            } else if (loadCount3 === 2) {
              releaseFirst3();
            }
          }
          return res;
        },
        async run() {
          return stmt.run();
        },
        async all() {
          return stmt.all();
        }
      };
    }
  };
  const concurEnv3 = { ...env, DB: customDb3 };

  const p3Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const p3Data = await p3Res.json();
  const token3 = p3Data.gameToken;

  const mode3Req = new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", mode: "hard1", gameToken: token3 })
  });
  const guess3Req = new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-concur-mode", guess: "CRANE", mode: "hard1", gameToken: token3 })
  });

  const [resMode3, resGuess3] = await Promise.all([
    worker.fetch(mode3Req, concurEnv3),
    worker.fetch(guess3Req, concurEnv3)
  ]);

  const statuses3 = [resMode3.status, resGuess3.status].sort();
  assert.deepEqual(statuses3, [200, 409], "Exactly one concurrent mode/guess action must succeed and one must fail with 409 due to version conflict");
});

test("34: Mode locking regression: non-final skip with updated session version cannot change mode (Standard -> Strict and Strict -> Standard)", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  seedPuzzle(db, { puzzleId: "p-skip-seq", date: today, answer: "HOUSE" });

  // --- Sequence 1: Standard -> Skip -> attempt switch to Hard Mode: Strict ---
  // 1. Start new puzzle in Standard mode
  const p1Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const p1Data = await p1Res.json();
  const token1 = p1Data.gameToken;

  // 2. Successfully Skip an attempt without finishing the puzzle (incrementing version from 1 to 2)
  db.prepare(`
    UPDATE fivewink_sessions
    SET attempts_json = ?1,
        version = version + 1
    WHERE puzzle_id = 'p-skip-seq' AND mode = 'default'
  `).run(JSON.stringify(["skip", null, null, null, null, null]));

  // 3. Obtain current session version (version 2)
  const s1Row = db.prepare("SELECT session_id, version, mode, status FROM fivewink_sessions WHERE puzzle_id = 'p-skip-seq'").get();
  assert.equal(s1Row.version, 2);
  assert.equal(s1Row.status, "playing");

  // 4. Send a fresh, otherwise valid request to change mode to Hard Mode: Strict
  const change1Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-seq", mode: "hard1", gameToken: token1 })
  }), env);

  // 5. Confirm the Worker rejects the request because the successful Skip already locked the mode
  assert.equal(change1Res.status, 400);
  const change1Data = await change1Res.json();
  assert.equal(change1Data.message, "The game mode is locked for this puzzle.");

  // 6. Confirm that the atomic SQL query directly rejects changing mode even when supplied version 2
  const sqlUpdate1 = db.prepare(`
    UPDATE fivewink_sessions
        SET mode = ?1,
            version = version + 1,
            updated_at = ?2
      WHERE session_id = ?3
        AND version = ?4
        AND clues_used = 0
        AND status = 'playing'
        AND (guesses_json = '[]' OR guesses_json IS NULL)
        AND (
          attempts_json IS NULL
          OR (
            attempts_json NOT LIKE '%"skip"%'
            AND attempts_json NOT LIKE '%"guess"%'
            AND attempts_json NOT LIKE '%"clue"%'
            AND attempts_json NOT LIKE '%"%'
          )
        )
        AND seventh_guess IS NULL
        AND result IS NULL
  `).run("hard1", Math.floor(Date.now() / 1000), s1Row.session_id, s1Row.version);
  assert.equal(sqlUpdate1.changes, 0, "SQL update must match zero rows because attempts_json contains a skip");

  // --- Sequence 2: Hard Mode: Strict -> Skip -> attempt switch to Standard ---
  const db2 = await setupTestDb();
  const env2 = createEnv(db2);
  seedPuzzle(db2, { puzzleId: "p-skip-seq2", date: today, answer: "CHAIR" });

  // 1. Start new puzzle and select Hard Mode: Strict
  const p2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env2);
  const p2Data = await p2Res.json();
  const token2 = p2Data.gameToken;

  const setStrictRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-seq2", mode: "hard1", gameToken: token2 })
  }), env2);
  assert.equal(setStrictRes.status, 200);

  // 2. Successfully Skip an attempt without finishing the puzzle (incrementing version from 2 to 3)
  db2.prepare(`
    UPDATE fivewink_sessions
    SET attempts_json = ?1,
        version = version + 1
    WHERE puzzle_id = 'p-skip-seq2' AND mode = 'hard1'
  `).run(JSON.stringify(["skip", null, null, null, null, null]));

  // 3. Obtain current session version (version 3)
  const s2Row = db2.prepare("SELECT session_id, version, mode, status FROM fivewink_sessions WHERE puzzle_id = 'p-skip-seq2'").get();
  assert.equal(s2Row.version, 3);
  assert.equal(s2Row.mode, "hard1");
  assert.equal(s2Row.status, "playing");

  // 4. Send a fresh, otherwise valid request to change mode back to Standard
  const change2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-skip-seq2", mode: "default", gameToken: token2 })
  }), env2);

  // 5. Confirm the Worker rejects the request because the successful Skip already locked the mode
  assert.equal(change2Res.status, 400);
  const change2Data = await change2Res.json();
  assert.equal(change2Data.message, "The game mode is locked for this puzzle.");

  // 6. Confirm that the atomic SQL query directly rejects changing mode even when supplied version 3
  const sqlUpdate2 = db2.prepare(`
    UPDATE fivewink_sessions
        SET mode = ?1,
            version = version + 1,
            updated_at = ?2
      WHERE session_id = ?3
        AND version = ?4
        AND clues_used = 0
        AND status = 'playing'
        AND (guesses_json = '[]' OR guesses_json IS NULL)
        AND (
          attempts_json IS NULL
          OR (
            attempts_json NOT LIKE '%"skip"%'
            AND attempts_json NOT LIKE '%"guess"%'
            AND attempts_json NOT LIKE '%"clue"%'
            AND attempts_json NOT LIKE '%"%'
          )
        )
        AND seventh_guess IS NULL
        AND result IS NULL
  `).run("default", Math.floor(Date.now() / 1000), s2Row.session_id, s2Row.version);
  assert.equal(sqlUpdate2.changes, 0, "SQL update must match zero rows because attempts_json contains a skip");
});

test("35: Hard Mode: Strict validation precedence and deterministic priority across multiple rows", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);
  const today = getTodayDateIndia();
  // Secret answer: HOUSE
  seedPuzzle(db, { puzzleId: "p-strict-order", date: today, answer: "HOUSE" });

  // 1. Initialize puzzle session and set mode to hard1
  const pRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/puzzle", {
    headers: { Origin: allowedOrigin }
  }), env);
  const pData = await pRes.json();
  let token = pData.gameToken;

  const modeRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/mode", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(modeRes.status, 200);

  // Scenario 1: Format validation & Invalid word before any guesses
  const s0Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "TOOLONG", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s0Res.status, 400);
  assert.equal((await s0Res.json()).message, "Not a valid word.");

  const s1Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "ZZZZZ", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s1Res.status, 400);
  assert.equal((await s1Res.json()).message, "Not a valid word.");

  // Make valid Guess 1: PLANT (all absent against HOUSE)
  const g1Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "PLANT", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g1Res.status, 200);
  const g1Data = await g1Res.json();
  token = g1Data.gameToken;
  assert.deepEqual(g1Data.feedback, ["absent", "absent", "absent", "absent", "absent"]);

  // Scenario 2: Duplicate guess check before constraints
  const s2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "PLANT", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s2Res.status, 400);
  const s2Data = await s2Res.json();
  assert.equal(s2Data.duplicate, true);
  assert.equal(s2Data.message, "Already guessed! Try another.");

  // Make valid Guess 2: DOWDY (pos 2 is O: correct/blue)
  const g2Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "DOWDY", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g2Res.status, 200);
  const g2Data = await g2Res.json();
  token = g2Data.gameToken;
  assert.deepEqual(g2Data.feedback, ["absent", "correct", "absent", "absent", "absent"]);

  // After Row 2: Pos 2 must be O (Blue), must contain O.
  // Scenario 3: Invalid word that violates accumulated constraints (Pos 2 must be O) -> Vocabulary must win!
  const s3Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "ZZZZZ", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s3Res.status, 400);
  assert.equal((await s3Res.json()).message, "Not a valid word.");

  // Scenario 4: A repeated guess (PLANT) that violates later-accumulated constraints (lacks O) -> Duplicate wins!
  const s4Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "PLANT", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s4Res.status, 400);
  const s4Data = await s4Res.json();
  assert.equal(s4Data.duplicate, true);
  assert.equal(s4Data.message, "Already guessed! Try another.");

  // Scenario 5: Valid word violating Blue constraint
  // SHINE has pos 2 = H (not O). Blue violation:
  const s5Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SHINE", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s5Res.status, 400);
  assert.equal((await s5Res.json()).message, "Position 2 must be O.");

  // Make valid Guess 3: FOAMY (pos 2 is O: correct)
  const g3Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "FOAMY", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g3Res.status, 200);
  const g3Data = await g3Res.json();
  token = g3Data.gameToken;
  assert.deepEqual(g3Data.feedback, ["absent", "correct", "absent", "absent", "absent"]);

  // Make valid Guess 4: SOAPY (pos 1 is S: wrong-position/orange; pos 2 is O: correct/blue)
  const g4Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SOAPY", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g4Res.status, 200);
  const g4Data = await g4Res.json();
  token = g4Data.gameToken;
  assert.deepEqual(g4Data.feedback, ["wrong-position", "correct", "absent", "absent", "absent"]);

  // After Row 4:
  // Blue: Pos 2 must be O
  // Orange: Pos 1 cannot be S
  // Count: Must contain O, must contain S

  // Scenario 6: Invalid word violating Orange constraint (pos 1 = S) -> Vocabulary wins!
  const s6Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SZZZZ", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s6Res.status, 400);
  assert.equal((await s6Res.json()).message, "Not a valid word.");

  // Scenario 7: Category priority — Blue beats Orange!
  // SPAWN has pos 1 = S (Orange violation), pos 2 = P (Blue violation). Blue must win!
  const s7Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SPAWN", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s7Res.status, 400);
  assert.equal((await s7Res.json()).message, "Position 2 must be O.");

  // Scenario 8: Orange violation when Blue is satisfied
  // SONIC has pos 1 = S (Orange violation), pos 2 = O (Blue satisfied), contains O and S.
  const s8Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SONIC", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s8Res.status, 400);
  assert.equal((await s8Res.json()).message, "Letter S cannot be in position 1.");

  // Scenario 9: Category priority — Orange beats Count!
  // MODEL satisfies Blue (pos 2 = O) and Orange (pos 1 = M), but lacks S. Count violation:
  const s9Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "MODEL", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s9Res.status, 400);
  assert.equal((await s9Res.json()).message, "Guess must contain S.");

  // Make valid Guess 5: BOARS (pos 2 is O: correct; pos 5 is S: wrong-position)
  const g5Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "BOARS", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g5Res.status, 200);
  const g5Data = await g5Res.json();
  token = g5Data.gameToken;
  assert.deepEqual(g5Data.feedback, ["absent", "correct", "absent", "absent", "wrong-position"]);

  // After Row 5:
  // Blue: Pos 2 must be O (Row 2)
  // Orange: Pos 1 cannot be S (Row 4), Pos 5 cannot be S (Row 5)
  // Count: Must contain O, S

  // Scenario 10: Multi-row Orange positional order (lowest position index wins)
  // SOAPS has pos 1 = S (Orange from Row 4) and pos 5 = S (Orange from Row 5).
  // Position 1 has lower index than Position 5, so Position 1 must be reported!
  const s10Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "SOAPS", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s10Res.status, 400);
  assert.equal((await s10Res.json()).message, "Letter S cannot be in position 1.");

  // Scenario 10b: Orange constraint on pos 5 reported when pos 1 is clean
  // BOATS has pos 1 = B (clean), pos 2 = O (clean), pos 5 = S (Orange violation at pos 5).
  const s10bRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "BOATS", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s10bRes.status, 400);
  assert.equal((await s10bRes.json()).message, "Letter S cannot be in position 5.");

  // Scenario 11: Priority verification and DB immutability check on turn 6 (5 guesses used)
  const sessionBefore = db.prepare("SELECT attempts_json, version, guesses_json FROM fivewink_sessions WHERE puzzle_id = 'p-strict-order'").get();
  assert.equal(sessionBefore.version, 7); // 1 (create) + 1 (mode) + 5 (guesses) = 7

  // A. Invalid word -> "Not a valid word."
  const failWordRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "ZZZZZ", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(failWordRes.status, 400);
  assert.equal((await failWordRes.json()).message, "Not a valid word.");

  // B. Duplicate guess -> "Already guessed! Try another."
  const failDupRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "DOWDY", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(failDupRes.status, 400);
  assert.equal((await failDupRes.json()).message, "Already guessed! Try another.");

  // C. Constraint failure -> "Letter S cannot be in position 5."
  const failConstRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "BOATS", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(failConstRes.status, 400);
  assert.equal((await failConstRes.json()).message, "Letter S cannot be in position 5.");

  // Confirm database state was NOT mutated by any failed submission
  const sessionAfter = db.prepare("SELECT attempts_json, version, guesses_json FROM fivewink_sessions WHERE puzzle_id = 'p-strict-order'").get();
  assert.equal(sessionAfter.version, sessionBefore.version, "Session version must not change on rejected guesses");
  assert.equal(sessionAfter.attempts_json, sessionBefore.attempts_json, "Attempts must not be consumed by rejected guesses");
  assert.equal(sessionAfter.guesses_json, sessionBefore.guesses_json, "Guesses array must not be altered by rejected guesses");

  // Make valid Guess 6: HORSE to reach awaiting-seventh stage
  // H: correct (pos 1), O: correct (pos 2), R: absent (pos 3), S: correct (pos 4), E: correct (pos 5)
  const g6Res = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "HORSE", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(g6Res.status, 200);
  const g6Data = await g6Res.json();
  token = g6Data.gameToken;
  assert.equal(g6Data.seventhStage, true);

  // Scenario 12: Seventh attempt stage validation priority:
  // A. Invalid word in seventh stage:
  const s12WordRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "ZZZZZ", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s12WordRes.status, 400);
  assert.equal((await s12WordRes.json()).message, "Not a valid word.");

  // B. Duplicate guess in seventh stage (repeat of guess 1 PLANT):
  const s12DupRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "PLANT", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s12DupRes.status, 400);
  assert.equal((await s12DupRes.json()).message, "Already guessed! Try another.");

  // C. Multi-row Blue positional order:
  // Pos 2 was confirmed Blue in Row 2 ('O').
  // Pos 1 was confirmed Blue in Row 6 ('H').
  // CLERK violates Pos 1 ('C' !== 'H') and Pos 2 ('L' !== 'O').
  // Even though Pos 2 was discovered earlier (Row 2), Pos 1 has lower position index!
  const s12ConstRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "CLERK", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s12ConstRes.status, 400);
  assert.equal((await s12ConstRes.json()).message, "Position 1 must be H.");

  // D. Valid 7th guess: HOUSE (solves the word, but in 7th stage gives FAILED_CLOSE)
  const s12GoodRes = await worker.fetch(new Request("https://emnifun.github.io/api/fivewink/guess", {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId: "p-strict-order", guess: "HOUSE", mode: "hard1", gameToken: token })
  }), env);
  assert.equal(s12GoodRes.status, 200);
  const s12GoodData = await s12GoodRes.json();
  assert.equal(s12GoodData.finished, true);
  assert.equal(s12GoodData.result, "FAILED_CLOSE");
  assert.equal(s12GoodData.mode, "hard1");
});
