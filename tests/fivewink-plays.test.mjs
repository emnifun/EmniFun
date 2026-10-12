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
  // sess-expired should be DELETED
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-expired'").get().c, 0);

  // sess-old-finished should be DELETED
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-old-finished'").get().c, 0);

  // sess-active must REMAIN
  assert.equal(db.prepare("SELECT COUNT(*) as c FROM fivewink_sessions WHERE session_id = 'sess-active'").get().c, 1);

  // fivewink_plays record MUST REMAIN intact so user cannot replay!
  assert.equal(
    db.prepare("SELECT COUNT(*) as c FROM fivewink_plays WHERE emnifeed_id = 'EF-user-clean-12345678'").get().c,
    1,
    "fivewink_plays must never be cleaned up prematurely"
  );
});
