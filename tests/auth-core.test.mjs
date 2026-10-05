import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { __authInternals } from "../worker/auth.js";

const {
  normalizeGamerTag,
  gamerTagKey,
  generateRecoveryKey,
  generateEmniFeedId,
  hashRecoveryKey,
  encryptRecoveryKey,
  decryptRecoveryKey,
  credentialReplayHash,
  sessionCookie,
  getRecoveryVaultSecret,
  rateLimitCategoryForPath,
  rateLimitKey,
  enforceRateLimit,
  RECOVERY_KEY_PATTERN
} = __authInternals;

const secret = "test-only-recovery-vault-secret-not-production";

function testConfig() {
  return {
    sessionTtlSeconds: 3600,
    sameSite: "None",
    partitioned: true
  };
}

test("Gamer Tag normalization preserves the user-facing value and derives a normalized uniqueness key", () => {
  assert.equal(normalizeGamerTag("  FiveWinkFan  "), "FiveWinkFan");
  assert.equal(gamerTagKey("  FiveWinkFan  "), "fivewinkfan");
  assert.equal(normalizeGamerTag("\u0000bad"), null);
  assert.equal(normalizeGamerTag(""), null);
});

test("recovery keys are exactly 16 random alphanumeric characters", () => {
  const keys = new Set(Array.from({ length: 200 }, () => generateRecoveryKey()));
  assert.equal(keys.size, 200);
  for (const key of keys) {
    assert.equal(key.length, 16);
    assert.equal(RECOVERY_KEY_PATTERN.test(key), true);
  }
});

test("EmniFeed IDs are backend-generated and not user-facing fields", () => {
  const ids = new Set(Array.from({ length: 100 }, () => generateEmniFeedId()));
  assert.equal(ids.size, 100);
  for (const id of ids) {
    assert.match(id, /^EF-[0-9a-f]{32}$/);
  }
});

test("recovery-key protection uses keyed hashes and authenticated encryption", async () => {
  const emnifeedId = "EF-0123456789abcdef0123456789abcdef";
  const key = generateRecoveryKey();

  const hashA = await hashRecoveryKey(emnifeedId, key, secret);
  const hashB = await hashRecoveryKey(emnifeedId, key, secret);
  const hashOtherAccount = await hashRecoveryKey("EF-fedcba9876543210fedcba9876543210", key, secret);

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashOtherAccount);

  const encrypted = await encryptRecoveryKey({
    emnifeedId,
    slot: 1,
    version: 1,
    recoveryKey: key,
    secret
  });

  assert.notEqual(encrypted.ciphertext, key);
  assert.match(encrypted.iv, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    await decryptRecoveryKey({
      emnifeedId,
      slot: 1,
      version: 1,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      secret
    }),
    key
  );

  await assert.rejects(
    decryptRecoveryKey({
      emnifeedId,
      slot: 2,
      version: 1,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      secret
    })
  );
});

test("authentication session cookie is HttpOnly, Secure, host-only, cross-site compatible, and partitioned", () => {
  const cookie = sessionCookie("opaque-token", testConfig());
  assert.match(cookie, /^__Host-emnifun_session=opaque-token/);
  assert.match(cookie, /Max-Age=3600/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Partitioned/);
  assert.doesNotMatch(cookie, /Domain=/i);
});


test("rate-limit categories and client keys are path-specific and IP-bound", () => {
  const request = new Request("https://emnifun.emnifun.workers.dev/api/auth/recovery/verify", {
    headers: { "CF-Connecting-IP": "203.0.113.8" }
  });

  assert.equal(rateLimitCategoryForPath("/api/auth/google/challenge"), "challenge");
  assert.equal(rateLimitCategoryForPath("/api/auth/google"), "general");
  assert.equal(rateLimitCategoryForPath("/api/auth/recovery/verify"), "recovery");
  assert.equal(rateLimitCategoryForPath("/api/auth/recovery/complete"), "recovery");
  assert.equal(rateLimitKey(request, "recovery"), "emnifun:recovery:203.0.113.8");
});

test("rate-limit helper rejects a missing Cloudflare binding", async () => {
  const request = new Request("https://emnifun.emnifun.workers.dev/api/auth/google");
  await assert.rejects(
    enforceRateLimit(request, {}, "general"),
    (error) => error?.status === 503
  );
});

test("rate-limit helper fails closed when the Cloudflare limiter returns false", async () => {
  const request = new Request("https://emnifun.emnifun.workers.dev/api/auth/recovery/verify", {
    headers: { "CF-Connecting-IP": "203.0.113.10" }
  });
  const env = {
    RECOVERY_RATE_LIMITER: {
      async limit({ key }) {
        assert.equal(key, "emnifun:recovery:203.0.113.10");
        return { success: false };
      }
    }
  };

  await assert.rejects(
    enforceRateLimit(request, env, "recovery"),
    (error) => error?.status === 429
  );
});

test("vault secret versions resolve legacy v1 and future versioned secrets", () => {
  const env = {
    RECOVERY_VAULT_SECRET: "legacy-v1",
    RECOVERY_VAULT_SECRET_V2: "future-v2"
  };
  assert.equal(getRecoveryVaultSecret(env, 1), "legacy-v1");
  assert.equal(getRecoveryVaultSecret(env, 2), "future-v2");
});

test("Google credential replay hashes are deterministic and distinct", async () => {
  const tokenA = "header.payload.signature";
  const tokenB = "header.payload.other-signature";
  const hashA1 = await credentialReplayHash(tokenA);
  const hashA2 = await credentialReplayHash(tokenA);
  const hashB = await credentialReplayHash(tokenB);

  assert.equal(hashA1, hashA2);
  assert.notEqual(hashA1, hashB);
  assert.match(hashA1, /^[A-Za-z0-9_-]+$/);
});

test("v1 vault crypto remains distinct from future v2 crypto", async () => {
  const emnifeedId = "EF-0123456789abcdef0123456789abcdef";
  const key = generateRecoveryKey();
  const encryptedV1 = await encryptRecoveryKey({
    emnifeedId, slot: 1, version: 1, recoveryKey: key,
    secret: "version-one-secret", secretVersion: 1
  });
  const encryptedV2 = await encryptRecoveryKey({
    emnifeedId, slot: 1, version: 1, recoveryKey: key,
    secret: "version-two-secret", secretVersion: 2
  });

  assert.notEqual(encryptedV1.ciphertext, encryptedV2.ciphertext);
  assert.equal(
    await decryptRecoveryKey({
      emnifeedId, slot: 1, version: 1,
      iv: encryptedV1.iv, ciphertext: encryptedV1.ciphertext,
      secret: "version-one-secret", secretVersion: 1
    }),
    key
  );
  assert.equal(
    await decryptRecoveryKey({
      emnifeedId, slot: 1, version: 1,
      iv: encryptedV2.iv, ciphertext: encryptedV2.ciphertext,
      secret: "version-two-secret", secretVersion: 2
    }),
    key
  );
});

test("frontend GIS implementation contains exactly one initialize call and one active callback", async () => {
  const source = await readFile(new URL("../js/auth/auth-ui.js", import.meta.url), "utf8");
  assert.equal((source.match(/google\.accounts\.id\.initialize\(/g) || []).length, 1);
  assert.match(source, /activeCredentialHandler/);
});

test("recovery concurrency guard is account-level and rejects a second cooldown change", async () => {
  const source = await readFile(new URL("../worker/auth.js", import.meta.url), "utf8");
  assert.match(source, /UPDATE accounts[\s\S]*recovery_lock_token = \?1[\s\S]*google_changed_at IS NULL/);
  assert.match(source, /recovery_lock_token = \?3/);
  assert.match(source, /batchResults\?\.\[0\]\?\.meta\?\.changes !== 1/);

  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../worker/migrations/0001_auth.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0002_auth_security_fixes.sql", import.meta.url), "utf8"));

  const now = 1_000_000;
  const cooldown = 30 * 24 * 60 * 60;
  const accountId = "EF-0123456789abcdef0123456789abcdef";
  db.prepare(`INSERT INTO accounts
    (emnifeed_id, gamer_tag, gamer_tag_key, created_at, last_active_at, google_changed_at)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(accountId, "MyTag", "mytag", now - cooldown - 1, now - cooldown - 1, null);

  const gate = db.prepare(`UPDATE accounts
    SET recovery_lock_token = ?, recovery_lock_until = ?
    WHERE emnifeed_id = ?
      AND (recovery_lock_token IS NULL OR recovery_lock_until IS NULL OR recovery_lock_until <= ?)
      AND (google_changed_at IS NULL OR google_changed_at <= ?)`);

  assert.equal(gate.run("lock-A", now + 60, accountId, now, now - cooldown).changes, 1);

  db.prepare(`UPDATE accounts
    SET google_changed_at = ?, recovery_lock_token = NULL, recovery_lock_until = NULL
    WHERE emnifeed_id = ? AND recovery_lock_token = ?`).run(now, accountId, "lock-A");

  assert.equal(gate.run("lock-B", now + 60, accountId, now, now - cooldown).changes, 0);
  assert.equal(gate.run("lock-C", now + 60, accountId, now + 1, now + 1 - cooldown).changes, 0);
  assert.equal(gate.run("lock-D", now + cooldown + 60, accountId, now + cooldown + 1, now + 1).changes, 1);
});

test("security migration adds recovery lock, crypto version, and Google credential replay protection", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../worker/migrations/0001_auth.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../worker/migrations/0002_auth_security_fixes.sql", import.meta.url), "utf8"));

  const accounts = db.prepare("PRAGMA table_info(accounts)").all();
  const recoveryKeys = db.prepare("PRAGMA table_info(recovery_keys)").all();
  const consumption = db.prepare("PRAGMA table_info(auth_challenge_consumptions)").all();

  assert.ok(accounts.some((column) => column.name === "recovery_lock_token"));
  assert.ok(accounts.some((column) => column.name === "recovery_lock_until"));
  assert.ok(recoveryKeys.some((column) => column.name === "crypto_version"));
  assert.ok(consumption.some((column) => column.name === "credential_hash"));

  const indexes = db.prepare("PRAGMA index_list(auth_challenge_consumptions)").all();
  assert.ok(indexes.some((index) => index.name === "ux_auth_challenge_consumptions_credential"));

  db.prepare(`INSERT INTO auth_challenge_consumptions
    (challenge_id, purpose, credential_hash, consumed_at) VALUES (?, ?, ?, ?)`
  ).run("challenge-a", "google_login", "fingerprint-a", 100);

  assert.throws(() => {
    db.prepare(`INSERT INTO auth_challenge_consumptions
      (challenge_id, purpose, credential_hash, consumed_at) VALUES (?, ?, ?, ?)`
    ).run("challenge-b", "google_login", "fingerprint-a", 101);
  });
});

test("cleanup is scheduled without touching recovery-key consumption history", async () => {
  const worker = await readFile(new URL("../worker/auth.js", import.meta.url), "utf8");
  assert.match(worker, /export async function cleanupAuthData/);
  assert.match(worker, /DELETE FROM auth_challenges/);
  assert.match(worker, /DELETE FROM auth_challenge_consumptions/);
  assert.match(worker, /consumed_at <= \?1/);
  assert.match(worker, /DELETE FROM auth_sessions/);
  assert.doesNotMatch(worker, /DELETE FROM recovery_key_consumptions/);
});
