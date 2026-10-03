/**
 * FiveWink backend-service contract checks.
 *
 * The answer is intentionally absent from the browser-facing puzzle object.
 */
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  if (String(url).endsWith("/api/fivewink/puzzle")) {
    return new Response(
      JSON.stringify({
        ok: true,
        puzzleId: "game1-2026-10-04",
        date: "2026-10-04",
        length: 5,
        clues: ["1", "2", "3", "4", "5"],
        gameToken: "signed-session-token"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  throw new Error("Unexpected fetch in FiveWink data test.");
};

const { getPublishedPuzzleForToday } = await import("../js/services/puzzle-service.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const puzzle = await getPublishedPuzzleForToday();

assert(puzzle.id === "game1-2026-10-04", "Backend puzzle ID must reach the service.");
assert(puzzle.game === "game1", "Service must preserve the FiveWink game ID.");
assert(puzzle.date === "2026-10-04", "Backend puzzle date must reach the service.");
assert(puzzle.clues.length === 5, "The service must preserve exactly five clues.");
assert(puzzle.gameToken === "signed-session-token", "The service must preserve the game token.");
assert(!Object.prototype.hasOwnProperty.call(puzzle, "answer"), "Browser puzzle data must not contain the answer.");

let failed = false;

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      ok: false,
      message: "FiveWink could not load the current puzzle."
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" }
    }
  );

try {
  await getPublishedPuzzleForToday();
} catch (error) {
  failed = true;
}

assert(failed, "Backend errors must fail clearly instead of falling back to local answer data.");

globalThis.fetch = originalFetch;

console.log("FiveWink backend service checks passed.");
