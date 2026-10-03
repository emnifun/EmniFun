const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getSigningKey(secret, usages) {
  if (!secret || typeof secret !== "string") {
    throw new Error("GAME_TOKEN_SECRET is not configured.");
  }

  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function signPayload(encodedPayload, secret) {
  const key = await getSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(encodedPayload)
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createGameToken(payload, secret) {
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload))
  );
  const signature = await signPayload(encodedPayload, secret);
  return encodedPayload + "." + signature;
}

export async function verifyGameToken(token, secret) {
  if (typeof token !== "string") {
    return { ok: false, message: "Game session is missing." };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, message: "Game session is invalid." };
  }

  const [encodedPayload, encodedSignature] = parts;

  try {
    const key = await getSigningKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(encodedSignature),
      textEncoder.encode(encodedPayload)
    );

    if (!valid) {
      return { ok: false, message: "Game session is invalid." };
    }

    const payload = JSON.parse(
      textDecoder.decode(base64UrlDecode(encodedPayload))
    );

    if (
      !payload ||
      payload.v !== 1 ||
      payload.game !== "game1" ||
      typeof payload.puzzleId !== "string" ||
      typeof payload.date !== "string" ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, message: "Game session has expired." };
    }

    if (
      !Array.isArray(payload.attempts) ||
      payload.attempts.length !== 6 ||
      !Array.isArray(payload.guesses) ||
      payload.guesses.length > 6 ||
      !Array.isArray(payload.clues) ||
      payload.clues.length !== 5 ||
      !Number.isInteger(payload.cluesUsed) ||
      payload.cluesUsed < 0 ||
      payload.cluesUsed > 5 ||
      typeof payload.seventhGuessUsed !== "boolean" ||
      !["playing", "awaiting-seventh", "finished"].includes(payload.status)
    ) {
      return { ok: false, message: "Game session data is invalid." };
    }

    const allowedAttemptValues = new Set(["guess", "clue"]);
    if (payload.attempts.some((value) => value !== null && !allowedAttemptValues.has(value))) {
      return { ok: false, message: "Game session data is invalid." };
    }

    const guessCount = payload.attempts.filter((value) => value === "guess").length;
    const clueCount = payload.attempts.filter((value) => value === "clue").length;

    if (guessCount !== payload.guesses.length || clueCount !== payload.cluesUsed) {
      return { ok: false, message: "Game session data is invalid." };
    }

    if (
      payload.guesses.some(
        (guess) => typeof guess !== "string" || !/^[A-Z]{5}$/.test(guess)
      ) ||
      new Set(payload.guesses).size !== payload.guesses.length
    ) {
      return { ok: false, message: "Game session data is invalid." };
    }

    const allowedClueStates = new Set(["available", "used", "skipped"]);
    if (payload.clues.some((value) => !allowedClueStates.has(value))) {
      return { ok: false, message: "Game session data is invalid." };
    }

    return { ok: true, payload };
  } catch (error) {
    return { ok: false, message: "Game session is invalid." };
  }
}

export function createFreshGameTokenPayload(puzzleId, date) {
  return {
    v: 1,
    game: "game1",
    puzzleId,
    date,
    attempts: Array(6).fill(null),
    guesses: [],
    clues: Array(5).fill("available"),
    cluesUsed: 0,
    seventhGuessUsed: false,
    status: "playing",
    exp: Math.floor(Date.now() / 1000) + 36 * 60 * 60
  };
}
