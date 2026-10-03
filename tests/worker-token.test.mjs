import {
  createFreshGameTokenPayload,
  createGameToken,
  verifyGameToken
} from "../worker/token.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const secret = "fivewink-test-secret";
const payload = createFreshGameTokenPayload(
  "session-12345678-1234-1234-1234-123456789012",
  "game1-2026-10-04",
  "2026-10-04"
);

const token = await createGameToken(payload, secret);
const verified = await verifyGameToken(token, secret);

assert(verified.ok, "A correctly signed session token must verify.");
assert(
  verified.payload.sessionId === payload.sessionId,
  "The session ID must survive token encoding."
);
assert(
  verified.payload.puzzleId === payload.puzzleId,
  "The puzzle ID must survive token encoding."
);

const [encodedPayload, signature] = token.split(".");
const tamperedSignature =
  signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
const tampered = await verifyGameToken(
  encodedPayload + "." + tamperedSignature,
  secret
);

assert(!tampered.ok, "A modified signature must be rejected.");

const wrongSecret = await verifyGameToken(token, "wrong-secret");
assert(!wrongSecret.ok, "A token signed with another secret must be rejected.");

console.log("FiveWink Worker token checks passed.");
