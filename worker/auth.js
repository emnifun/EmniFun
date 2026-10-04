const AUTH_COOKIE_NAME = "__Host-emnifun_session";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com"
]);
const DEFAULT_AUTH_ALLOWED_ORIGIN = "https://emnifun.github.io";
const DEFAULT_AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_AUTH_CHALLENGE_TTL_SECONDS = 10 * 60;
const DEFAULT_GOOGLE_CHANGE_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RECOVERY_VAULT_SECRET_VERSION = 1;
const RECOVERY_LOCK_TTL_SECONDS = 60;
const AUTH_CHALLENGE_CONSUMPTION_RETENTION_SECONDS = 2 * 60 * 60;
const MAX_GAMER_TAG_LENGTH = 32;
const RECOVERY_KEY_LENGTH = 16;
const RECOVERY_KEY_PATTERN = /^[A-Za-z0-9]{16}$/;
const RECOVERY_KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const encoder = new TextEncoder();
const DUMMY_EMNIFEED_ID = "EF-00000000000000000000000000000000";
const RATE_LIMIT_BINDINGS = Object.freeze({
  general: "AUTH_RATE_LIMITER",
  challenge: "AUTH_CHALLENGE_RATE_LIMITER",
  recovery: "RECOVERY_RATE_LIMITER"
});

let googleJwksCache = null;

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function authConfig(env) {
  const visibilitySeconds = getPositiveInteger(env.RECOVERY_KEY_VISIBILITY_SECONDS, 0);

  if (!env.DB) {
    throw new Error("The EmniFun D1 database binding is not configured.");
  }

  if (!env.RECOVERY_VAULT_SECRET) {
    throw new Error("The recovery vault secret is not configured.");
  }

  const recoveryVaultSecretVersion = getPositiveInteger(
    env.RECOVERY_VAULT_SECRET_VERSION,
    DEFAULT_RECOVERY_VAULT_SECRET_VERSION
  );
  const currentVaultSecret = getRecoveryVaultSecret(env, recoveryVaultSecretVersion);
  if (!currentVaultSecret) {
    throw new Error("The configured recovery vault secret version is not available.");
  }

  if (!visibilitySeconds) {
    throw new Error("RECOVERY_KEY_VISIBILITY_SECONDS is not configured.");
  }

  const googleClientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const allowedOrigin = String(
    env.AUTH_ALLOWED_ORIGIN || DEFAULT_AUTH_ALLOWED_ORIGIN
  ).trim();

  if (!/^https:\/\//i.test(allowedOrigin)) {
    throw new Error("AUTH_ALLOWED_ORIGIN must use HTTPS.");
  }

  const sameSite = String(env.AUTH_COOKIE_SAMESITE || "None");
  if (!["None", "Lax", "Strict"].includes(sameSite)) {
    throw new Error("AUTH_COOKIE_SAMESITE must be None, Lax, or Strict.");
  }

  const partitioned = String(env.AUTH_COOKIE_PARTITIONED ?? "true") !== "false";
  if (partitioned && sameSite !== "None") {
    throw new Error("AUTH_COOKIE_PARTITIONED requires AUTH_COOKIE_SAMESITE=None.");
  }

  return {
    googleClientId,
    recoveryVaultSecretVersion,
    allowedOrigin,
    visibilitySeconds,
    sessionTtlSeconds: getPositiveInteger(
      env.AUTH_SESSION_TTL_SECONDS,
      DEFAULT_AUTH_SESSION_TTL_SECONDS
    ),
    challengeTtlSeconds: getPositiveInteger(
      env.AUTH_CHALLENGE_TTL_SECONDS,
      DEFAULT_AUTH_CHALLENGE_TTL_SECONDS
    ),
    googleChangeCooldownSeconds: getPositiveInteger(
      env.GOOGLE_CHANGE_COOLDOWN_SECONDS,
      DEFAULT_GOOGLE_CHANGE_COOLDOWN_SECONDS
    ),
    sameSite,
    partitioned
  };
}

function jsonResponse(data, status, config, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": config.allowedOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

function invalidAuthResponse(config, status = 400) {
  return jsonResponse(
    { ok: false, message: "Authentication request could not be completed." },
    status,
    config
  );
}

function genericRecoveryFailure(config, status = 400) {
  return jsonResponse(
    { ok: false, message: "Recovery details could not be verified." },
    status,
    config
  );
}

function assertAllowedOrigin(request, config) {
  const origin = request.headers.get("Origin");

  if (origin !== config.allowedOrigin) {
    return false;
  }

  return true;
}

function normalizeGamerTag(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();

  if (!normalized || normalized.length > MAX_GAMER_TAG_LENGTH) {
    return null;
  }

  if (/\p{Cc}/u.test(normalized)) {
    return null;
  }

  return normalized;
}

function gamerTagKey(value) {
  const normalized = normalizeGamerTag(value);
  return normalized ? normalized.toLowerCase() : null;
}

function generateRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

async function sha256(value) {
  const data = typeof value === "string" ? encoder.encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function getRecoveryVaultSecret(env, version) {
  const normalizedVersion = Number(version);
  if (!Number.isInteger(normalizedVersion) || normalizedVersion < 1) {
    throw new Error("The recovery vault secret version is invalid.");
  }

  const secret = normalizedVersion === 1
    ? env?.RECOVERY_VAULT_SECRET
    : env?.[`RECOVERY_VAULT_SECRET_V${normalizedVersion}`];

  if (!secret || typeof secret !== "string") {
    throw new Error("The required recovery vault secret version is not configured.");
  }

  return secret;
}

function vaultSalt(version) {
  const normalizedVersion = Number(version);
  if (!Number.isInteger(normalizedVersion) || normalizedVersion < 1) {
    throw new Error("The recovery vault secret version is invalid.");
  }
  return encoder.encode(`EmniFun recovery vault v${normalizedVersion}`);
}

async function importHkdfRoot(secret) {
  if (!secret || typeof secret !== "string") {
    throw new Error("The recovery vault secret is not configured.");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"]
  );
}

async function deriveVaultKey(secret, purpose, algorithm, version = 1) {
  const root = await importHkdfRoot(secret);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: vaultSalt(version),
      info: encoder.encode(purpose)
    },
    root,
    algorithm,
    false,
    algorithm.name === "HMAC" ? ["sign", "verify"] : ["encrypt", "decrypt"]
  );
}

async function hashRecoveryKey(emnifeedId, recoveryKey, secret, version = 1) {
  const key = await deriveVaultKey(
    secret,
    "recovery-key-hash",
    { name: "HMAC", hash: "SHA-256", length: 256 },
    version
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${emnifeedId}:${recoveryKey}`)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function recoveryKeyContext(emnifeedId, slot, version) {
  return encoder.encode(`emnifun:${emnifeedId}:slot:${slot}:version:${version}`);
}

async function encryptRecoveryKey({ emnifeedId, slot, version, recoveryKey, secret, secretVersion = 1 }) {
  const key = await deriveVaultKey(
    secret,
    "recovery-key-encryption",
    { name: "AES-GCM", length: 256 },
    secretVersion
  );
  const iv = generateRandomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: recoveryKeyContext(emnifeedId, slot, version)
    },
    key,
    encoder.encode(recoveryKey)
  );

  return {
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(new Uint8Array(ciphertext))
  };
}

async function decryptRecoveryKey({ emnifeedId, slot, version, iv, ciphertext, secret, secretVersion = 1 }) {
  const key = await deriveVaultKey(
    secret,
    "recovery-key-encryption",
    { name: "AES-GCM", length: 256 },
    secretVersion
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlDecode(iv),
      additionalData: recoveryKeyContext(emnifeedId, slot, version)
    },
    key,
    base64UrlDecode(ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

function generateRecoveryKey() {
  const alphabetLength = RECOVERY_KEY_ALPHABET.length;
  const limit = 256 - (256 % alphabetLength);
  const bytes = [];

  while (bytes.length < RECOVERY_KEY_LENGTH) {
    const random = generateRandomBytes(32);
    for (const byte of random) {
      if (byte >= limit) continue;
      bytes.push(RECOVERY_KEY_ALPHABET[byte % alphabetLength]);
      if (bytes.length === RECOVERY_KEY_LENGTH) break;
    }
  }

  return bytes.join("");
}

function generateEmniFeedId() {
  return `EF-${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateOpaqueToken() {
  return base64UrlEncode(generateRandomBytes(32));
}

function parseCookies(request) {
  const raw = request.headers.get("Cookie") || "";
  const cookies = {};

  for (const chunk of raw.split(";")) {
    const separator = chunk.indexOf("=");
    if (separator === -1) continue;
    const name = chunk.slice(0, separator).trim();
    const value = chunk.slice(separator + 1).trim();
    if (name) cookies[name] = value;
  }

  return cookies;
}

function sessionCookie(token, config, maxAge = config.sessionTtlSeconds) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    `SameSite=${config.sameSite}`
  ];

  if (config.partitioned) {
    attributes.push("Partitioned");
  }

  return attributes.join("; ");
}

async function sessionTokenHash(token) {
  return base64UrlEncode(await sha256(token));
}

async function credentialReplayHash(credential) {
  return base64UrlEncode(await sha256(credential));
}

function publicAccount(row) {
  return {
    gamerTag: row.gamer_tag
  };
}

function getClientIp(request) {
  return (request.headers.get("CF-Connecting-IP") || "unknown").slice(0, 128);
}

function rateLimitCategoryForPath(path) {
  if (path === "/api/auth/google/challenge") return "challenge";
  if (path === "/api/auth/recovery/verify" || path === "/api/auth/recovery/complete") {
    return "recovery";
  }
  if (path.startsWith("/api/auth/") || path === "/api/account/vault") return "general";
  return null;
}

function rateLimitKey(request, category) {
  return `emnifun:${category}:${getClientIp(request)}`;
}

async function enforceRateLimit(request, env, category) {
  const bindingName = RATE_LIMIT_BINDINGS[category];
  const limiter = env?.[bindingName];

  if (!limiter || typeof limiter.limit !== "function") {
    throw Object.assign(
      new Error("Authentication rate limiting is not configured."),
      { status: 503 }
    );
  }

  let result;
  try {
    result = await limiter.limit({ key: rateLimitKey(request, category) });
  } catch {
    throw Object.assign(
      new Error("Authentication rate limiting is unavailable."),
      { status: 503 }
    );
  }

  if (!result?.success) {
    throw Object.assign(
      new Error("Too many authentication requests. Please try again later."),
      { status: 429 }
    );
  }

  return true;
}

async function createAuthSession(env, emnifeedId, config) {
  const token = generateOpaqueToken();
  const tokenHash = await sessionTokenHash(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + config.sessionTtlSeconds;
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO auth_sessions
      (session_id, emnifeed_id, token_hash, created_at, last_seen_at, expires_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?4, ?5, NULL)`
  )
    .bind(sessionId, emnifeedId, tokenHash, now, expiresAt)
    .run();

  return { token, expiresAt };
}

async function loadSession(env, request) {
  const token = parseCookies(request)[AUTH_COOKIE_NAME];
  if (!token) return null;

  const tokenHash = await sessionTokenHash(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT s.session_id, s.emnifeed_id, s.expires_at,
            a.gamer_tag, a.last_active_at
       FROM auth_sessions s
       JOIN accounts a ON a.emnifeed_id = s.emnifeed_id
      WHERE s.token_hash = ?1
        AND s.revoked_at IS NULL
        AND s.expires_at > ?2
      LIMIT 1`
  )
    .bind(tokenHash, now)
    .first();

  if (!row) return null;

  await env.DB.prepare(
    "UPDATE auth_sessions SET last_seen_at = ?1 WHERE session_id = ?2"
  )
    .bind(now, row.session_id)
    .run();

  await env.DB.prepare(
    "UPDATE accounts SET last_active_at = ?1 WHERE emnifeed_id = ?2"
  )
    .bind(now, row.emnifeed_id)
    .run();

  return row;
}

async function parseJsonBody(request, maxBytes = 24 * 1024) {
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

function createChallengeData({ purpose, emnifeedId = null, googleSub = null, recoveryKeyId = null, recoveryKeyVersion = null, nonce = null, config }) {
  const challengeId = crypto.randomUUID();
  const selectedNonce = typeof nonce === "string" && /^[A-Za-z0-9_-]{20,256}$/.test(nonce)
    ? nonce
    : generateOpaqueToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + config.challengeTtlSeconds;

  return {
    challengeId,
    nonce: selectedNonce,
    nonceHash: null,
    purpose,
    emnifeedId,
    googleSub,
    recoveryKeyId,
    recoveryKeyVersion,
    createdAt: now,
    expiresAt
  };
}

async function createChallenge(env, options) {
  const challenge = createChallengeData(options);
  challenge.nonceHash = base64UrlEncode(await sha256(challenge.nonce));

  await env.DB.prepare(
    `INSERT INTO auth_challenges
      (challenge_id, purpose, emnifeed_id, google_sub,
       recovery_key_id, recovery_key_version, nonce_hash,
       created_at, expires_at, used_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)`
  )
    .bind(
      challenge.challengeId,
      challenge.purpose,
      challenge.emnifeedId,
      challenge.googleSub,
      challenge.recoveryKeyId,
      challenge.recoveryKeyVersion,
      challenge.nonceHash,
      challenge.createdAt,
      challenge.expiresAt
    )
    .run();

  return challenge;
}

async function getChallenge(env, challengeId) {
  if (typeof challengeId !== "string" || !/^[0-9a-f-]{20,64}$/i.test(challengeId)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  return env.DB.prepare(
    `SELECT challenge_id, purpose, emnifeed_id, google_sub,
            recovery_key_id, recovery_key_version, nonce_hash,
            created_at, expires_at, used_at
       FROM auth_challenges
      WHERE challenge_id = ?1
      LIMIT 1`
  )
    .bind(challengeId)
    .first()
    .then((row) => {
      if (!row || row.used_at !== null || row.expires_at <= now) return null;
      return row;
    });
}

async function verifyGoogleIdToken(credential, expectedNonce, clientId) {
  if (typeof credential !== "string" || credential.length < 100 || credential.length > 16 * 1024) {
    throw new Error("Invalid Google credential.");
  }

  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google credential.");

  let header;
  let payload;
  let signature;

  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    signature = base64UrlDecode(parts[2]);
  } catch {
    throw new Error("Invalid Google credential.");
  }

  if (header?.alg !== "RS256" || typeof header?.kid !== "string") {
    throw new Error("Invalid Google credential.");
  }

  const jwk = await getGoogleJwk(header.kid);
  if (!jwk) throw new Error("Google signing key was not found.");

  const verifyKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signingInput = encoder.encode(`${parts[0]}.${parts[1]}`);
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    verifyKey,
    signature,
    signingInput
  );

  const now = Math.floor(Date.now() / 1000);
  const issuerValid = GOOGLE_ISSUERS.has(payload?.iss);
  const audienceValid = payload?.aud === clientId;
  const expiryValid = Number.isInteger(payload?.exp) && payload.exp > now;
  const issuedAtValid = Number.isInteger(payload?.iat) && payload.iat <= now + 60;
  const subjectValid = typeof payload?.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 255;
  const nonceValid = typeof expectedNonce === "string" && payload?.nonce === expectedNonce;
  const authorizedPartyValid = !payload?.azp || payload.azp === clientId;

  if (
    !signatureValid ||
    !issuerValid ||
    !audienceValid ||
    !expiryValid ||
    !issuedAtValid ||
    !subjectValid ||
    !nonceValid ||
    !authorizedPartyValid
  ) {
    throw new Error("Invalid Google credential.");
  }

  return { sub: payload.sub };
}

async function getGoogleJwk(kid) {
  const now = Date.now();

  if (!googleJwksCache || googleJwksCache.expiresAt <= now) {
    googleJwksCache = await fetchGoogleJwks();
  }

  let jwk = googleJwksCache.keys.find((key) => key.kid === kid);
  if (!jwk) {
    googleJwksCache = await fetchGoogleJwks();
    jwk = googleJwksCache.keys.find((key) => key.kid === kid);
  }

  return jwk || null;
}

async function fetchGoogleJwks() {
  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("Google signing keys could not be loaded.");
  }

  const data = await response.json();
  if (!Array.isArray(data?.keys)) {
    throw new Error("Google signing keys are invalid.");
  }

  const cacheControl = response.headers.get("Cache-Control") || "";
  const match = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = match ? Number(match[1]) : 300;

  return {
    keys: data.keys.filter((key) => key?.kty === "RSA" && key?.alg === "RS256" && key?.kid),
    expiresAt: Date.now() + Math.max(60, maxAgeSeconds) * 1000
  };
}

async function handleGoogleChallenge(request, env, config) {
  if (!assertAllowedOrigin(request, config)) return invalidAuthResponse(config, 403);

  const requestedNonce = new URL(request.url).searchParams.get("nonce");
  if (requestedNonce !== null && !/^[A-Za-z0-9_-]{20,256}$/.test(requestedNonce)) {
    return invalidAuthResponse(config, 400);
  }

  const challenge = await createChallenge(env, {
    purpose: "google_login",
    nonce: requestedNonce || null,
    config
  });

  return jsonResponse(
    {
      ok: true,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt
    },
    200,
    config
  );
}

async function handleGoogleAuth(request, env, config) {
  if (!assertAllowedOrigin(request, config)) return invalidAuthResponse(config, 403);

  const body = await parseJsonBody(request);
  const challenge = await getChallenge(env, body?.challengeId);
  if (!challenge || challenge.purpose !== "google_login") {
    return invalidAuthResponse(config, 400);
  }

  const nonce = await recoverNonceFromHashOnlyChallenge(body?.credential, challenge);
  if (!nonce) return invalidAuthResponse(config, 400);

  let googleIdentity;
  try {
    googleIdentity = await verifyGoogleIdToken(
      body?.credential,
      nonce,
      config.googleClientId
    );
  } catch {
    return invalidAuthResponse(config, 401);
  }

  const account = await env.DB.prepare(
    `SELECT a.emnifeed_id, a.gamer_tag, a.last_active_at
       FROM google_identities g
       JOIN accounts a ON a.emnifeed_id = g.emnifeed_id
      WHERE g.google_sub = ?1
      LIMIT 1`
  )
    .bind(googleIdentity.sub)
    .first();

  const now = Math.floor(Date.now() / 1000);
  const challengeConsumptionId = crypto.randomUUID();

  if (account) {
    const sessionToken = generateOpaqueToken();
    const tokenHash = await sessionTokenHash(sessionToken);
    const sessionId = crypto.randomUUID();
    const expiresAt = now + config.sessionTtlSeconds;

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO auth_challenge_consumptions
            (challenge_id, purpose, credential_hash, consumed_at)
           VALUES (?1, ?2, ?3, ?4)`
        ).bind(
          challenge.challenge_id,
          challenge.purpose,
          await credentialReplayHash(body?.credential),
          now
        ),
        env.DB.prepare(
          `UPDATE auth_challenges SET used_at = ?1
            WHERE challenge_id = ?2 AND used_at IS NULL`
        ).bind(now, challenge.challenge_id),
        env.DB.prepare(
          `INSERT INTO auth_sessions
            (session_id, emnifeed_id, token_hash, created_at, last_seen_at, expires_at, revoked_at)
           VALUES (?1, ?2, ?3, ?4, ?4, ?5, NULL)`
        ).bind(sessionId, account.emnifeed_id, tokenHash, now, expiresAt),
        env.DB.prepare(
          `UPDATE accounts SET last_active_at = ?1 WHERE emnifeed_id = ?2`
        ).bind(now, account.emnifeed_id)
      ]);
    } catch {
      return invalidAuthResponse(config, 409);
    }

    const response = jsonResponse(
      { ok: true, user: publicAccount(account) },
      200,
      config
    );
    response.headers.append("Set-Cookie", sessionCookie(sessionToken, config));
    return response;
  }

  const registrationChallenge = createChallengeData({
    purpose: "registration",
    googleSub: googleIdentity.sub,
    config
  });
  registrationChallenge.nonceHash = base64UrlEncode(await sha256(registrationChallenge.nonce));

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO auth_challenge_consumptions
          (challenge_id, purpose, credential_hash, consumed_at)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(
        challenge.challenge_id,
        challenge.purpose,
        await credentialReplayHash(body?.credential),
        now
      ),
      env.DB.prepare(
        `UPDATE auth_challenges SET used_at = ?1
          WHERE challenge_id = ?2 AND used_at IS NULL`
      ).bind(now, challenge.challenge_id),
      env.DB.prepare(
        `INSERT INTO auth_challenges
          (challenge_id, purpose, emnifeed_id, google_sub,
           recovery_key_id, recovery_key_version, nonce_hash,
           created_at, expires_at, used_at)
         VALUES (?1, 'registration', NULL, ?2, NULL, NULL, ?3, ?4, ?5, NULL)`
      ).bind(
        registrationChallenge.challengeId,
        registrationChallenge.googleSub,
        registrationChallenge.nonceHash,
        registrationChallenge.createdAt,
        registrationChallenge.expiresAt
      )
    ]);
  } catch {
    return invalidAuthResponse(config, 409);
  }

  return jsonResponse(
    {
      ok: true,
      needsRegistration: true,
      registrationChallenge: registrationChallenge.challengeId
    },
    200,
    config
  );
}

async function recoverNonceFromHashOnlyChallenge(credential, challenge) {
  // The nonce is intentionally not stored in plaintext. Decode the unverified
  // JWT payload only to recover the nonce candidate, then compare its SHA-256
  // against the challenge's stored hash. Signature and all claims are verified
  // by verifyGoogleIdToken() immediately afterward.
  try {
    const parts = String(credential || "").split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    const nonce = typeof payload?.nonce === "string" ? payload.nonce : "";
    if (!nonce) return null;
    const candidateHash = base64UrlEncode(await sha256(nonce));
    return candidateHash === challenge.nonce_hash ? nonce : null;
  } catch {
    return null;
  }
}

async function handleRegister(request, env, config) {
  if (!assertAllowedOrigin(request, config)) return invalidAuthResponse(config, 403);

  const body = await parseJsonBody(request);
  const challenge = await getChallenge(env, body?.registrationChallenge);
  const gamerTag = normalizeGamerTag(body?.gamerTag);
  const gamerTagCanonical = gamerTagKey(body?.gamerTag);

  if (!challenge || challenge.purpose !== "registration" || !challenge.google_sub || !gamerTag || !gamerTagCanonical) {
    return invalidAuthResponse(config, 400);
  }

  const emnifeedId = generateEmniFeedId();
  const now = Math.floor(Date.now() / 1000);
  const sessionToken = generateOpaqueToken();
  const tokenHash = await sessionTokenHash(sessionToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = now + config.sessionTtlSeconds;

  const keyRows = [];
  for (const slot of [1, 2]) {
    const version = 1;
    const secretVersion = config.recoveryVaultSecretVersion;
    const recoveryKey = generateRecoveryKey();
    const secret = getRecoveryVaultSecret(env, secretVersion);
    const keyHash = await hashRecoveryKey(
      emnifeedId,
      recoveryKey,
      secret,
      secretVersion
    );
    const encrypted = await encryptRecoveryKey({
      emnifeedId,
      slot,
      version,
      recoveryKey,
      secret,
      secretVersion
    });

    keyRows.push({
      keyId: crypto.randomUUID(),
      slot,
      version,
      keyHash,
      encrypted,
      recoveryKey,
      secretVersion
    });
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO auth_challenge_consumptions
          (challenge_id, purpose, credential_hash, consumed_at)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(
        challenge.challenge_id,
        challenge.purpose,
        await credentialReplayHash(body?.credential),
        now
      ),
      env.DB.prepare(
        `UPDATE auth_challenges SET used_at = ?1
          WHERE challenge_id = ?2 AND used_at IS NULL`
      ).bind(now, challenge.challenge_id),
      env.DB.prepare(
        `INSERT INTO accounts
          (emnifeed_id, gamer_tag, gamer_tag_key, created_at, last_active_at, google_changed_at)
         VALUES (?1, ?2, ?3, ?4, ?4, NULL)`
      ).bind(emnifeedId, gamerTag, gamerTagCanonical, now),
      env.DB.prepare(
        `INSERT INTO google_identities
          (google_sub, emnifeed_id, linked_at)
         VALUES (?1, ?2, ?3)`
      ).bind(challenge.google_sub, emnifeedId, now),
      ...keyRows.map((row) =>
        env.DB.prepare(
          `INSERT INTO recovery_keys
            (recovery_key_id, emnifeed_id, slot, version, crypto_version, key_hash,
             encrypted_key, iv, viewable_until, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
        ).bind(
          row.keyId,
          emnifeedId,
          row.slot,
          row.version,
          row.secretVersion,
          row.keyHash,
          row.encrypted.ciphertext,
          row.encrypted.iv,
          now + config.visibilitySeconds,
          now
        )
      ),
      env.DB.prepare(
        `INSERT INTO auth_sessions
          (session_id, emnifeed_id, token_hash, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?1, ?2, ?3, ?4, ?4, ?5, NULL)`
      ).bind(sessionId, emnifeedId, tokenHash, now, expiresAt)
    ]);
  } catch (error) {
    const message = String(error?.message || "");
    if (/gamer_tag_key|UNIQUE|constraint/i.test(message)) {
      return jsonResponse(
        { ok: false, message: "That Gamer Tag is already taken." },
        409,
        config
      );
    }
    return invalidAuthResponse(config, 409);
  }

  const response = jsonResponse(
    {
      ok: true,
      user: { gamerTag },
      accountCreated: true
    },
    201,
    config
  );
  response.headers.append("Set-Cookie", sessionCookie(sessionToken, config));
  return response;
}

async function handleMe(request, env, config) {
  if (!assertAllowedOrigin(request, config)) return invalidAuthResponse(config, 403);

  const session = await loadSession(env, request);
  if (!session) {
    return jsonResponse({ ok: true, user: null }, 200, config);
  }