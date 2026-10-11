import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "../worker/index.js";
import { __authInternals } from "../worker/auth.js";
import { autoPublishTodayPuzzle, getReleaseDate, getTodayDateIndia } from "../worker/admin.js";

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
    GAME_TOKEN_SECRET: "test-game-token-secret-for-admin-tests",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } }
  };
}

function createAdminRequest(path, options = {}) {
  const headers = {
    Origin: allowedOrigin,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (options.token) {
    headers.Cookie = `__Host-emnifun_session=${options.token}`;
  }

  return new Request(`https://emnifun.example${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

async function seedAccount(db, { emnifeedId, gamerTag, isAdmin = 0 }) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO accounts (emnifeed_id, gamer_tag, gamer_tag_key, created_at, last_active_at, is_admin)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(emnifeedId, gamerTag, gamerTag.toLowerCase(), now, now, isAdmin);
}

async function seedSession(db, { emnifeedId, token }) {
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = __authInternals.base64UrlEncode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))
  );

  db.prepare(`
    INSERT INTO auth_sessions (session_id, emnifeed_id, token_hash, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), emnifeedId, tokenHash, now, now, now + 3600);
}

test("admin API rejects unauthenticated requests", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  const res = await worker.fetch(createAdminRequest("/api/admin/status"), env);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.message, "Authentication required.");
});

test("admin API rejects authenticated non-admin users", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-user1", gamerTag: "NormalPlayer", isAdmin: 0 });
  await seedSession(db, { emnifeedId: "EF-user1", token: "valid-user-token" });

  const res = await worker.fetch(
    createAdminRequest("/api/admin/status", { token: "valid-user-token" }),
    env
  );
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.message, "Administrator access required.");
});

test("admin API rejects requests with invalid Origin", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "AdminPlayer", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "valid-admin-token" });

  const req = new Request("https://emnifun.example/api/admin/status", {
    method: "GET",
    headers: {
      Origin: "https://evil.example",
      Cookie: "__Host-emnifun_session=valid-admin-token"
    }
  });

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 403);
});

test("authorized admin can check status and read puzzle list", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // 1. Status check
  const statusRes = await worker.fetch(
    createAdminRequest("/api/admin/status", { token: "admin-token-1" }),
    env
  );
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.ok, true);
  assert.equal(statusData.isAdmin, true);
  assert.equal(statusData.gamerTag, "OwnerAdmin");
  assert.match(statusData.todayDate, /^\d{4}-\d{2}-\d{2}$/);

  // 2. Read empty list
  const listRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", { token: "admin-token-1" }),
    env
  );
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.ok, true);
  assert.equal(Array.isArray(listData.puzzles), true);
  assert.equal(listData.puzzles.length, 0);
});

test("admin can create a valid draft puzzle", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  const createRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: {
        date: "2026-11-01",
        answer: "crane",
        clues: ["First clue", "Second clue", "Third clue", "Fourth clue", "Fifth clue"]
      }
    }),
    env
  );

  assert.equal(createRes.status, 201);
  const createData = await createRes.json();
  assert.equal(createData.ok, true);
  assert.equal(createData.puzzle.date, "2026-11-01");
  assert.equal(createData.puzzle.answer, "CRANE");
  assert.equal(createData.puzzle.status, "draft");
  assert.equal(createData.puzzle.clues.length, 5);
  assert.equal(createData.puzzle.clues[0], "First clue");
});

test("admin cannot create puzzle with invalid data or duplicate date", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // Invalid date format
  const badDateRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "invalid-date", answer: "CRANE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  assert.equal(badDateRes.status, 400);

  // Invalid answer length
  const badAnswerRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-02", answer: "WORD", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  assert.equal(badAnswerRes.status, 400);

  // Missing clues (only 3)
  const badCluesRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-02", answer: "CRANE", clues: ["1", "2", "3"] }
    }),
    env
  );
  assert.equal(badCluesRes.status, 400);

  // Create initial puzzle
  await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-03", answer: "CRANE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );

  // Duplicate date creation
  const duplicateRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-03", answer: "SLATE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  assert.equal(duplicateRes.status, 409);
  const dupData = await duplicateRes.json();
  assert.equal(dupData.ok, false);
});

test("admin can edit draft puzzle, but published puzzle content is strictly locked", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // 1. Create a draft puzzle
  const createRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-05", answer: "SHINE", clues: ["c1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  const { puzzle } = await createRes.json();
  const puzzleId = puzzle.puzzleId;

  // 2. Edit draft puzzle
  const editRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-11-05", answer: "SPARK", clues: ["n1", "n2", "n3", "n4", "n5"] }
    }),
    env
  );
  assert.equal(editRes.status, 200);
  const editData = await editRes.json();
  assert.equal(editData.puzzle.answer, "SPARK");
  assert.equal(editData.puzzle.clues[0], "n1");

  // 3. Publish the puzzle
  const pubRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubRes.status, 200);

  // 4. Try editing published puzzle -> must be rejected with 409 locked
  const editPubRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-11-05", answer: "OTHER", clues: ["n1", "n2", "n3", "n4", "n5"] }
    }),
    env
  );
  assert.equal(editPubRes.status, 409);
  const editPubData = await editPubRes.json();
  assert.equal(editPubData.ok, false);
  assert.equal(editPubData.message, "Published puzzles are locked and cannot be edited.");
});

test("duplicate daily publication is prevented", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE fivewink_puzzles (
      puzzle_id TEXT PRIMARY KEY,
      game TEXT NOT NULL CHECK (game = 'game1'),
      date TEXT NOT NULL,
      answer TEXT NOT NULL CHECK (length(answer) = 5),
      clues_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
      created_at INTEGER,
      updated_at INTEGER
    );
  `);
  db.exec(await readFile(new URL("../worker/migrations/0001_auth.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0002_auth_security_fixes.sql", import.meta.url), "utf8"));
  db.exec(`ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`);

  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  const date = "2026-11-10";

  // Create puzzle 1
  const p1Res = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date, answer: "FIRST", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const p1Id = (await p1Res.json()).puzzle.puzzleId;

  // Publish puzzle 1
  const pub1Res = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Id}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pub1Res.status, 200);

  // Directly insert puzzle 2 for same date with status 'draft'
  const p2Id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', ?, 'SECND', '["1","2","3","4","5"]', 'draft', 100, 100)
  `).run(p2Id, date);

  // Try to publish p2 for same date -> must fail with 409
  const pub2Res = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p2Id}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pub2Res.status, 409);
  const pub2Data = await pub2Res.json();
  assert.equal(pub2Data.ok, false);
  assert.equal(pub2Data.message, "Another puzzle is already published for this date.");
});

test("admin can safely unpublish and archive puzzles", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  const createRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-15", answer: "CYCLE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const puzzleId = (await createRes.json()).puzzle.puzzleId;

  // Publish
  await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );

  // Unpublish back to draft
  const unpubRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}/unpublish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(unpubRes.status, 200);
  assert.equal((await unpubRes.json()).status, "draft");

  // Archive
  const archiveRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}/archive`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(archiveRes.status, 200);
  assert.equal((await archiveRes.json()).status, "archived");

  // Cannot edit archived puzzle
  const editArchiveRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-11-15", answer: "CYCLE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  assert.equal(editArchiveRes.status, 409);
});

test("admin can permanently delete draft, published, and archived puzzles during testing", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // 1. Create and delete a draft puzzle
  const p1Res = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-20", answer: "DRAFT", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const p1Id = (await p1Res.json()).puzzle.puzzleId;

  const delDraftRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Id}`, {
      method: "DELETE",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(delDraftRes.status, 200);
  assert.equal((await delDraftRes.json()).deleted, true);

  // Check it is gone
  const getDraftRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Id}`, { token: "admin-token-1" }),
    env
  );
  assert.equal(getDraftRes.status, 404);

  // 2. Create, publish, and delete a published puzzle
  const p2Res = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-21", answer: "PUBLI", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const p2Id = (await p2Res.json()).puzzle.puzzleId;

  await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p2Id}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );

  const delPubRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p2Id}`, {
      method: "DELETE",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(delPubRes.status, 200);
  assert.equal((await delPubRes.json()).deleted, true);

  // 3. Create, archive, and delete an archived puzzle
  const p3Res = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-22", answer: "ARCHI", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const p3Id = (await p3Res.json()).puzzle.puzzleId;

  await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p3Id}/archive`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );

  const delArchRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p3Id}`, {
      method: "DELETE",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(delArchRes.status, 200);
  assert.equal((await delArchRes.json()).deleted, true);

  // 4. Deleting a nonexistent puzzle returns 404
  const delNonexistent = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/nonexistent-id-12345`, {
      method: "DELETE",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(delNonexistent.status, 404);
});

test("permanent deletion requires admin authorization, valid session, and allowed origin", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  await seedAccount(db, { emnifeedId: "EF-user1", gamerTag: "NormalPlayer", isAdmin: 0 });
  await seedSession(db, { emnifeedId: "EF-user1", token: "user-token-1" });

  // Create a puzzle
  const pRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-25", answer: "GUARD", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  const puzzleId = (await pRes.json()).puzzle.puzzleId;

  // Unauthenticated deletion rejected
  const unauthRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}`, { method: "DELETE" }),
    env
  );
  assert.equal(unauthRes.status, 401);

  // Non-admin deletion rejected
  const nonAdminRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${puzzleId}`, { method: "DELETE", token: "user-token-1" }),
    env
  );
  assert.equal(nonAdminRes.status, 403);

  // Invalid origin deletion rejected
  const invalidOriginReq = new Request(`https://emnifun.example/api/admin/puzzles/${puzzleId}`, {
    method: "DELETE",
    headers: {
      Origin: "https://evil.example",
      Cookie: "__Host-emnifun_session=admin-token-1"
    }
  });
  const invalidOriginRes = await worker.fetch(invalidOriginReq, env);
  assert.equal(invalidOriginRes.status, 403);

  // Verify accounts and auth sessions were NOT touched
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM accounts").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get().count, 2);
});

test("search filtering works correctly in puzzle listing API", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // Create two puzzles
  await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-12-01", answer: "APPLE", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );
  await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-12-02", answer: "BERRY", clues: ["1", "2", "3", "4", "5"] }
    }),
    env
  );

  // Search by answer
  const searchApple = await worker.fetch(
    createAdminRequest("/api/admin/puzzles?search=apple", { token: "admin-token-1" }),
    env
  );
  const appleList = (await searchApple.json()).puzzles;
  assert.equal(appleList.length, 1);
  assert.equal(appleList[0].answer, "APPLE");

  // Search by date
  const searchDate = await worker.fetch(
    createAdminRequest("/api/admin/puzzles?search=2026-12-02", { token: "admin-token-1" }),
    env
  );
  const dateList = (await searchDate.json()).puzzles;
  assert.equal(dateList.length, 1);
  assert.equal(dateList[0].answer, "BERRY");
});

test("automatic publication publishes draft puzzle for current IST date and handles edge cases", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  const todayIST = getTodayDateIndia();
  assert.match(todayIST, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(getReleaseDate("Asia/Kolkata"), todayIST);

  // Case 1: When no puzzle exists for today -> returns no_puzzle, does not throw
  const resNoPuzzle = await autoPublishTodayPuzzle(env);
  assert.equal(resNoPuzzle.ok, true);
  assert.equal(resNoPuzzle.published, false);
  assert.equal(resNoPuzzle.reason, "no_puzzle");

  // Case 2: Draft puzzle exists for today -> auto publishes
  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', ?, 'TODAY', '["1","2","3","4","5"]', 'draft', 100, 100)
  `).run("puzzle-today", todayIST);

  const resPublish = await autoPublishTodayPuzzle(env);
  assert.equal(resPublish.ok, true);
  assert.equal(resPublish.published, true);
  assert.equal(resPublish.puzzleId, "puzzle-today");

  const rowAfter = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get("puzzle-today");
  assert.equal(rowAfter.status, "published");

  // Case 3: Already published puzzle -> does not publish again
  const resAlready = await autoPublishTodayPuzzle(env);
  assert.equal(resAlready.ok, true);
  assert.equal(resAlready.published, false);
  assert.equal(resAlready.reason, "already_published");

  // Case 4: Future date puzzle is NOT published early
  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', '2099-01-01', 'LATER', '["1","2","3","4","5"]', 'draft', 100, 100)
  `).run("puzzle-future");

  await autoPublishTodayPuzzle(env);
  const futureRow = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get("puzzle-future");
  assert.equal(futureRow.status, "draft");

  // Case 5: Archived puzzle for today is NOT published
  db.prepare("UPDATE fivewink_puzzles SET status = 'archived' WHERE puzzle_id = ?").run("puzzle-today");
  const resArch = await autoPublishTodayPuzzle(env);
  assert.equal(resArch.ok, true);
  assert.equal(resArch.published, false);
  assert.equal(resArch.reason, "archived");
});

test("main site game navigation components and placeholders exist", async () => {
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(indexHtml, /class="game-tabs"/);
  assert.match(indexHtml, /data-game-tab="games\/game1"/);
  assert.match(indexHtml, /data-game-tab="games\/game2"/);
  assert.match(indexHtml, /data-game-tab="games\/game3"/);
  assert.match(indexHtml, /FiveWink/);
  assert.match(indexHtml, /Game 2/);
  assert.match(indexHtml, /Game 3/);

  const appJs = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(appJs, /"games\/game1", "games\/game2", "games\/game3"/);
  assert.match(appJs, /\.game-tab/);

  const game2Ui = await readFile(new URL("../js/games/game2/game2-ui.js", import.meta.url), "utf8");
  assert.match(game2Ui, /Game 2 is in development/);
  assert.match(game2Ui, /It will be here once it is ready/);

  const game3Ui = await readFile(new URL("../js/games/game3/game3-ui.js", import.meta.url), "utf8");
  assert.match(game3Ui, /Game 3 is in development/);
  assert.match(game3Ui, /It will be here once it is ready/);
});
