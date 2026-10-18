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

export async function createGameToken(payload, secret) {
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload))
  );

  const key = await getSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(encodedPayload)
  );

  return encodedPayload + "." + base64UrlEncode(new Uint8Array(signature));
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
      typeof payload.sessionId !== "string" ||
      !/^[0-9a-f-]{20,64}$/i.test(payload.sessionId) ||
      typeof payload.puzzleId !== "string" ||
      typeof payload.date !== "string" ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, message: "Game session has expired." };
    }

    return { ok: true, payload };
  } catch (error) {
    return { ok: false, message: "Game session is invalid." };
  }
}

export function createFreshGameTokenPayload(sessionId, puzzleId, date) {
  return {
    v: 1,
    game: "game1",
    sessionId,
    puzzleId,
    date,
    exp: Math.floor(Date.now() / 1000) + 36 * 60 * 60
  };
}
