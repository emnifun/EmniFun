import { normalizeGuess, isFiveLetterGuess } from "./game1.js";

const VALID_GUESSES_URL =
  "https://raw.githubusercontent.com/emnifun/EmniFun/main/data/game1/vocabulary/valid-guesses.json";

let validWordsPromise = null;

export async function loadValidWords(options = {}) {
  if (options?.words instanceof Set) {
    return options.words;
  }

  if (!validWordsPromise) {
    validWordsPromise = (async () => {
      // If running under Node.js (e.g. tests), load local file for speed and offline reliability
      if (typeof process !== "undefined" && process?.versions?.node) {
        try {
          const fsSpecifier = "node:fs/promises";
          const { readFile } = await import(fsSpecifier);
          const fileUrl = new URL("../data/game1/vocabulary/valid-guesses.json", import.meta.url);
          const raw = await readFile(fileUrl, "utf8");
          const data = JSON.parse(raw);
          if (Array.isArray(data?.words)) {
            const words = new Set(
              data.words
                .map((word) => normalizeGuess(word))
                .filter((word) => isFiveLetterGuess(word))
            );
            if (words.size >= 10000) {
              return words;
            }
          }
        } catch {
          // Fall through to fetch
        }
      }

      const response = await fetch(VALID_GUESSES_URL, {
        cf: { cacheEverything: true, cacheTtl: 86400 }
      });

      if (!response.ok) {
        throw new Error("The FiveWink guess vocabulary could not be loaded.");
      }

      const data = await response.json();

      if (!Array.isArray(data?.words)) {
        throw new Error("The FiveWink guess vocabulary is invalid.");
      }

      const words = new Set(
        data.words
          .map((word) => normalizeGuess(word))
          .filter((word) => isFiveLetterGuess(word))
      );

      if (words.size < 10000) {
        throw new Error("The FiveWink guess vocabulary is unexpectedly small.");
      }

      return words;
    })();

    validWordsPromise.catch(() => {
      validWordsPromise = null;
    });
  }

  return validWordsPromise;
}

export function resetValidWordsCache() {
  validWordsPromise = null;
}
