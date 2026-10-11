import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "../worker/index.js";
import { getTodayDateIndia, autoPublishDailyPuzzle } from "../worker/admin.js";
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

test("publication rules: today and future allowed, past rejected, already-published protected", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "AdminPlayer", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  const today = getTodayDateIndia();
  const tomorrow = getTodayDateIndia(new Date(Date.now() + 86400000 * 2));
  const yesterday = getTodayDateIndia(new Date(Date.now() - 86400000));
  const olderDate = "2020-01-01";

  // Create draft puzzles
  const createDraft = async (date, answer) => {
    const res = await worker.fetch(
      createAdminRequest("/api/admin/puzzles", {
        method: "POST",
        token: "admin-token-1",
        body: { date, answer, clues: ["c1", "c2", "c3", "c4", "c5"] }
      }),
      env
    );
    assert.equal(res.status, 201);
    const data = await res.json();
    return data.puzzle.puzzleId;
  };

  const yesterdayId = await createDraft(yesterday, "YESTR");
  const olderId = await createDraft(olderDate, "OLDER");
  const todayId = await createDraft(today, "TODAY");
  const tomorrowId = await createDraft(tomorrow, "TOMOR");

  // 1. Publishing yesterday's puzzle must be rejected with 400
  const pubYesterdayRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${yesterdayId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubYesterdayRes.status, 400);
  const pubYesterdayData = await pubYesterdayRes.json();
  assert.equal(pubYesterdayData.ok, false);
  assert.match(pubYesterdayData.message, /Past-dated puzzles cannot be newly published/i);

  // 2. Publishing older date puzzle must be rejected with 400
  const pubOlderRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${olderId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubOlderRes.status, 400);
  const pubOlderData = await pubOlderRes.json();
  assert.equal(pubOlderData.ok, false);
  assert.match(pubOlderData.message, /Past-dated puzzles cannot be newly published/i);

  // 3. Publishing today's puzzle is allowed
  const pubTodayRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${todayId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubTodayRes.status, 200);
  const pubTodayData = await pubTodayRes.json();
  assert.equal(pubTodayData.ok, true);
  assert.equal(pubTodayData.status, "published");

  // 4. Publishing an already-published puzzle is rejected
  const pubAlreadyRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${todayId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubAlreadyRes.status, 400);
  const pubAlreadyData = await pubAlreadyRes.json();
  assert.equal(pubAlreadyData.ok, false);
  assert.match(pubAlreadyData.message, /already published/i);

  // 5. Publishing future puzzle is allowed
  const pubTomorrowRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${tomorrowId}/publish`, {
      method: "POST",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(pubTomorrowRes.status, 200);
  const pubTomorrowData = await pubTomorrowRes.json();
  assert.equal(pubTomorrowData.ok, true);
  assert.equal(pubTomorrowData.status, "published");
});

test("automatic publication via cron: publishes today, protects future, protects backdated, idempotent", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  const today = getTodayDateIndia();
  const tomorrow = getTodayDateIndia(new Date(Date.now() + 86400000 * 2));
  const yesterday = getTodayDateIndia(new Date(Date.now() - 86400000));

  const now = Math.floor(Date.now() / 1000);
  const todayId = crypto.randomUUID();
  const tomorrowId = crypto.randomUUID();
  const yesterdayId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', ?, 'TODAY', '["c1","c2","c3","c4","c5"]', 'draft', ?, ?)
  `).run(todayId, today, now, now);

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', ?, 'TOMOR', '["c1","c2","c3","c4","c5"]', 'draft', ?, ?)
  `).run(tomorrowId, tomorrow, now, now);

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', ?, 'YESTR', '["c1","c2","c3","c4","c5"]', 'draft', ?, ?)
  `).run(yesterdayId, yesterday, now, now);

  // Trigger worker scheduled handler
  await worker.scheduled({}, env);

  // Verify today is published
  const todayRow = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(todayId);
  assert.equal(todayRow.status, "published");

  // Verify tomorrow was NOT published early
  const tomorrowRow = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(tomorrowId);
  assert.equal(tomorrowRow.status, "draft");

  // Verify yesterday was NOT published
  const yesterdayRow = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(yesterdayId);
  assert.equal(yesterdayRow.status, "draft");

  // Second cron run (e.g. hourly fallback) is idempotent
  await worker.scheduled({}, env);

  const todayRow2 = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(todayId);
  assert.equal(todayRow2.status, "published");
  const tomorrowRow2 = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(tomorrowId);
  assert.equal(tomorrowRow2.status, "draft");
  const yesterdayRow2 = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(yesterdayId);
  assert.equal(yesterdayRow2.status, "draft");

  // Invariant test: calling autoPublishDailyPuzzle directly with an explicit past target date must be refused
  const pastAutoPubResult = await autoPublishDailyPuzzle(env, { date: yesterday });
  assert.equal(pastAutoPubResult.ok, false);
  assert.equal(pastAutoPubResult.published, false);
  assert.equal(pastAutoPubResult.reason, "past_date_not_allowed");

  const yesterdayRowAfterExplicit = db.prepare("SELECT status FROM fivewink_puzzles WHERE puzzle_id = ?").get(yesterdayId);
  assert.equal(yesterdayRowAfterExplicit.status, "draft");
});

test("duplicate answers: warning returned with all existing dates, creation allowed with confirmation, case-insensitive", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token-1" });

  // 1. Create first puzzle with "plant" on 2026-10-12
  const p1Res = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-10-12", answer: "plant", clues: ["c1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(p1Res.status, 201);
  const p1Data = await p1Res.json();
  assert.equal(p1Data.puzzle.answer, "PLANT");

  // 2. Attempt to create second puzzle with same answer "Plant" on 2026-11-03 without confirmation
  const p2WarnRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-03", answer: "Plant", clues: ["c1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(p2WarnRes.status, 409);
  const p2WarnData = await p2WarnRes.json();
  assert.equal(p2WarnData.ok, false);
  assert.equal(p2WarnData.duplicateWarning, true);
  assert.deepEqual(p2WarnData.duplicateDates, ["2026-10-12"]);
  assert.match(p2WarnData.message, /already exists on/i);

  // Verify 2026-11-03 was NOT created in DB
  const checkP2 = db.prepare("SELECT * FROM fivewink_puzzles WHERE date = '2026-11-03'").get();
  assert.equal(checkP2, undefined);

  // 3. Create second puzzle WITH confirmDuplicate: true
  const p2ConfirmRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-11-03", answer: "Plant", clues: ["c1", "c2", "c3", "c4", "c5"], confirmDuplicate: true }
    }),
    env
  );
  assert.equal(p2ConfirmRes.status, 201);
  const p2ConfirmData = await p2ConfirmRes.json();
  assert.equal(p2ConfirmData.puzzle.answer, "PLANT");

  // 4. Attempt to create third puzzle with "PLANT" on 2026-12-01 -> returns both previous dates
  const p3WarnRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-12-01", answer: "PLANT", clues: ["c1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(p3WarnRes.status, 409);
  const p3WarnData = await p3WarnRes.json();
  assert.deepEqual(p3WarnData.duplicateDates, ["2026-10-12", "2026-11-03"]);

  // 5. Query duplicates endpoint directly
  const dupCheckRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles/duplicates?answer=plant", {
      method: "GET",
      token: "admin-token-1"
    }),
    env
  );
  assert.equal(dupCheckRes.status, 200);
  const dupCheckData = await dupCheckRes.json();
  assert.equal(dupCheckData.isDuplicate, true);
  assert.deepEqual(dupCheckData.duplicateDates, ["2026-10-12", "2026-11-03"]);

  // 6. Editing puzzle 1 with the same normalized answer ("Plant") -> no duplicate warning
  const editSameRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Data.puzzle.puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-10-12", answer: "Plant", clues: ["n1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(editSameRes.status, 200);

  // 7. Create another puzzle with answer "CRANE" on 2026-12-25
  const craneRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles", {
      method: "POST",
      token: "admin-token-1",
      body: { date: "2026-12-25", answer: "CRANE", clues: ["c1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(craneRes.status, 201);

  // 8. Attempt to edit puzzle 1 to "crane" (different from current answer, exists on 2026-12-25) without confirmation -> 409 warning
  const editCraneWarnRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Data.puzzle.puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-10-12", answer: "crane", clues: ["n1", "c2", "c3", "c4", "c5"] }
    }),
    env
  );
  assert.equal(editCraneWarnRes.status, 409);
  const editCraneWarnData = await editCraneWarnRes.json();
  assert.equal(editCraneWarnData.duplicateWarning, true);
  assert.deepEqual(editCraneWarnData.duplicateDates, ["2026-12-25"]);

  // 9. Edit puzzle 1 to "crane" WITH confirmDuplicate: true -> 200 success
  const editCraneConfirmRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Data.puzzle.puzzleId}`, {
      method: "PUT",
      token: "admin-token-1",
      body: { date: "2026-10-12", answer: "crane", clues: ["n1", "c2", "c3", "c4", "c5"], confirmDuplicate: true }
    }),
    env
  );
  assert.equal(editCraneConfirmRes.status, 200);
  assert.equal((await editCraneConfirmRes.json()).puzzle.answer, "CRANE");
});

test("permanent puzzle deletion: draft, published, and archived deleted safely, non-admin blocked", async () => {
  const db = await setupTestDb();
  const env = createEnv(db);

  await seedAccount(db, { emnifeedId: "EF-admin1", gamerTag: "OwnerAdmin", isAdmin: 1 });
  await seedSession(db, { emnifeedId: "EF-admin1", token: "admin-token" });

  await seedAccount(db, { emnifeedId: "EF-user1", gamerTag: "NormalPlayer", isAdmin: 0 });
  await seedSession(db, { emnifeedId: "EF-user1", token: "user-token" });

  const now = Math.floor(Date.now() / 1000);
  const p1Id = crypto.randomUUID(); // draft
  const p2Id = crypto.randomUUID(); // published
  const p3Id = crypto.randomUUID(); // archived
  const p4Id = crypto.randomUUID(); // unrelated draft

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', '2026-12-10', 'DRAFT', '["1","2","3","4","5"]', 'draft', ?, ?)
  `).run(p1Id, now, now);

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', '2026-12-11', 'PUBED', '["1","2","3","4","5"]', 'published', ?, ?)
  `).run(p2Id, now, now);

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', '2026-12-12', 'ARCHV', '["1","2","3","4","5"]', 'archived', ?, ?)
  `).run(p3Id, now, now);

  db.prepare(`
    INSERT INTO fivewink_puzzles (puzzle_id, game, date, answer, clues_json, status, created_at, updated_at)
    VALUES (?, 'game1', '2026-12-13', 'OTHER', '["1","2","3","4","5"]', 'draft', ?, ?)
  `).run(p4Id, now, now);

  // Associated sessions for p1 and p2
  const s1Id = crypto.randomUUID();
  const s2Id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO fivewink_sessions (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, version, created_at, updated_at, expires_at)
    VALUES (?, ?, 'game1', '2026-12-10', '[]', '[]', '[]', 0, 'playing', 1, ?, ?, ?)
  `).run(s1Id, p1Id, now, now, now + 3600);
  db.prepare(`
    INSERT INTO fivewink_sessions (session_id, puzzle_id, game, date, attempts_json, guesses_json, clues_json, clues_used, status, version, created_at, updated_at, expires_at)
    VALUES (?, ?, 'game1', '2026-12-11', '[]', '[]', '[]', 0, 'playing', 1, ?, ?, ?)
  `).run(s2Id, p2Id, now, now, now + 3600);

  // 1. Non-admin cannot delete
  const userDelRes = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Id}`, { method: "DELETE", token: "user-token" }),
    env
  );
  assert.equal(userDelRes.status, 403);
  assert.ok(db.prepare("SELECT puzzle_id FROM fivewink_puzzles WHERE puzzle_id = ?").get(p1Id));

  // 2. Nonexistent puzzle returns 404
  const notFoundRes = await worker.fetch(
    createAdminRequest("/api/admin/puzzles/nonexistent-id", { method: "DELETE", token: "admin-token" }),
    env
  );
  assert.equal(notFoundRes.status, 404);

  // 3. Admin deletes draft puzzle p1
  const delP1Res = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p1Id}`, { method: "DELETE", token: "admin-token" }),
    env
  );
  assert.equal(delP1Res.status, 200);
  assert.equal(db.prepare("SELECT puzzle_id FROM fivewink_puzzles WHERE puzzle_id = ?").get(p1Id), undefined);
  assert.equal(db.prepare("SELECT session_id FROM fivewink_sessions WHERE session_id = ?").get(s1Id), undefined);

  // 4. Admin deletes published puzzle p2
  const delP2Res = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p2Id}`, { method: "DELETE", token: "admin-token" }),
    env
  );
  assert.equal(delP2Res.status, 200);
  assert.equal(db.prepare("SELECT puzzle_id FROM fivewink_puzzles WHERE puzzle_id = ?").get(p2Id), undefined);
  assert.equal(db.prepare("SELECT session_id FROM fivewink_sessions WHERE session_id = ?").get(s2Id), undefined);

  // 5. Admin deletes archived puzzle p3
  const delP3Res = await worker.fetch(
    createAdminRequest(`/api/admin/puzzles/${p3Id}`, { method: "DELETE", token: "admin-token" }),
    env
  );
  assert.equal(delP3Res.status, 200);
  assert.equal(db.prepare("SELECT puzzle_id FROM fivewink_puzzles WHERE puzzle_id = ?").get(p3Id), undefined);

  // 6. Unrelated puzzle p4 is untouched
  const p4Row = db.prepare("SELECT * FROM fivewink_puzzles WHERE puzzle_id = ?").get(p4Id);
  assert.ok(p4Row);
  assert.equal(p4Row.answer, "OTHER");
});

test("admin search filter and input behavior: filters correctly without DOM re-render cursor bug", async () => {
  const adminJsContent = await readFile(new URL("../admin/admin.js", import.meta.url), "utf8");

  // Ensure render() is not called on input events of #input-search
  // Instead, renderTable() is called which preserves the search input DOM element and cursor
  assert.match(adminJsContent, /searchInput\?\.addEventListener\("input",/);
  assert.match(adminJsContent, /renderTable\(\)/);
  assert.doesNotMatch(adminJsContent, /searchInput\?\.addEventListener\("input",[^}]*render\(\);[^}]*focus\(\)/);

  // Verify delete button is present in puzzle row actions
  assert.match(adminJsContent, /btn-delete/);
  assert.match(adminJsContent, /deletePuzzle/);
});

test("admin panel table functions: renderTable, getFilteredPuzzles, and attachTableActionHandlers are at top-level module scope", async () => {
  const adminJsContent = await readFile(new URL("../admin/admin.js", import.meta.url), "utf8");

  // Verify function declarations exist at top-level module scope before function render()
  const renderIndex = adminJsContent.indexOf("function render()");
  assert.ok(renderIndex > 0, "function render() must exist");

  const beforeRender = adminJsContent.slice(0, renderIndex);
  assert.match(beforeRender, /function renderTable\(\)/, "renderTable must be defined before render()");
  assert.match(beforeRender, /function getFilteredPuzzles\(\)/, "getFilteredPuzzles must be defined before render()");
  assert.match(beforeRender, /function attachTableActionHandlers\(\)/, "attachTableActionHandlers must be defined before render()");

  // Ensure render() does not contain duplicate nested definitions
  const afterRender = adminJsContent.slice(renderIndex);
  const renderEndIndex = afterRender.indexOf("function renderPuzzleRow");
  const renderBody = afterRender.slice(0, renderEndIndex);
  assert.doesNotMatch(renderBody, /function renderTable\(\)/, "renderTable must not be nested inside render()");
  assert.doesNotMatch(renderBody, /function getFilteredPuzzles\(\)/, "getFilteredPuzzles must not be nested inside render()");
  assert.doesNotMatch(renderBody, /function attachTableActionHandlers\(\)/, "attachTableActionHandlers must not be nested inside render()");
});

test("admin table filtering logic correctly filters by status and date/answer query", () => {
  const puzzles = [
    { puzzleId: "1", date: "2026-10-10", answer: "TRAIN", status: "published" },
    { puzzleId: "2", date: "2026-10-11", answer: "BRAIN", status: "draft" },
    { puzzleId: "3", date: "2026-10-12", answer: "CRANE", status: "unpublished" },
    { puzzleId: "4", date: "2026-10-13", answer: "STONE", status: "archived" },
  ];

  function filterPuzzles(list, filterStatus, searchQuery) {
    return list.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toUpperCase();
        return p.date.includes(q) || p.answer.toUpperCase().includes(q);
      }
      return true;
    });
  }

  // Status filtering
  assert.equal(filterPuzzles(puzzles, "all", "").length, 4);
  assert.equal(filterPuzzles(puzzles, "published", "").length, 1);
  assert.equal(filterPuzzles(puzzles, "draft", "").length, 1);
  assert.equal(filterPuzzles(puzzles, "unpublished", "").length, 1);
  assert.equal(filterPuzzles(puzzles, "archived", "").length, 1);

  // Search filtering by answer
  const trainResults = filterPuzzles(puzzles, "all", "train");
  assert.equal(trainResults.length, 1);
  assert.equal(trainResults[0].answer, "TRAIN");

  // Search filtering by date
  const dateResults = filterPuzzles(puzzles, "all", "2026-10-12");
  assert.equal(dateResults.length, 1);
  assert.equal(dateResults[0].answer, "CRANE");
});
