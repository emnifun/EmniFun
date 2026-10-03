import { GAME1_ID } from "./game1-data.js";
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  buildPlayerHistoryRecord,
  createGame1State,
  getNextNormalAttemptIndex,
  sanitizeGuessInput,
  submitNormalGuess,
  submitSeventhGuess,
  skipSeventhAttempt,
  useClue
} from "./game1-logic.js";
import {
  getGame1ValidWords,
  getPublishedPuzzleForToday
} from "../../services/puzzle-service.js";
import { recordGameResult } from "../../statistics/statistics.js";
import { saveGameResult } from "../../services/api.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export async function renderGame1(container) {
  document.title = "FiveWink — EmniFun";
  container.innerHTML =
    '<div class="placeholder"><h2>Loading FiveWink…</h2><p>Loading the current published puzzle.</p></div>';

  let puzzle;
  let validWords;

  try {
    [puzzle, validWords] = await Promise.all([
      getPublishedPuzzleForToday(),
      getGame1ValidWords()
    ]);
  } catch (error) {
    container.innerHTML =
      '<div class="placeholder"><h2>FiveWink could not load</h2><p>' +
      (error?.message || "Puzzle data could not be loaded.") +
      '</p></div>';
    return;
  }

  if (!puzzle) {
    container.innerHTML =
      '<div class="placeholder"><h2>No puzzle available</h2><p>There is no published FiveWink puzzle for today.</p></div>';
    return;
  }

  const state = createGame1State(validWords);
  let currentInput = "";

  container.innerHTML = `
    <div class="game-shell" tabindex="0">
      <div class="game-header">
        <div>
          <p class="eyebrow">Daily Puzzle · ${puzzle.date}</p>
          <h2>FiveWink</h2>
          <p>Wink your way to the word.</p>
        </div>
        <button class="button secondary" type="button" id="game1-back">Back to Games</button>
      </div>
      <div id="game1-message" class="game-message" aria-live="polite"></div>
      <div id="game1-board" class="game-board"></div>
      <div id="game1-clues" class="clue-list"></div>
      <div id="game1-keyboard" class="keyboard" aria-label="On-screen keyboard"></div>
      <div id="game1-result"></div>
      <button class="button secondary hidden" id="game1-see-why" type="button">See Why</button>
      <div id="game1-explanation"></div>
    </div>
  `;

  const root = container.querySelector(".game-shell");
  const board = container.querySelector("#game1-board");
  const clues = container.querySelector("#game1-clues");
  const keyboard = container.querySelector("#game1-keyboard");
  const messageBox = container.querySelector("#game1-message");
  const resultBox = container.querySelector("#game1-result");
  const seeWhyButton = container.querySelector("#game1-see-why");
  let messageTimeout = null;

  function showMessage(message = "", temporary = false) {
    if (messageTimeout) {
      clearTimeout(messageTimeout);
      messageTimeout = null;
    }

    messageBox.textContent = message;
    messageBox.classList.toggle("temporary", temporary);

    if (temporary && message) {
      messageTimeout = setTimeout(() => {
        messageBox.textContent = "";
        messageBox.classList.remove("temporary");
        messageTimeout = null;
      }, 1700);
    }
  }

  function focusGame() {
    root.focus();
  }

  function finishGame() {
    const history = buildPlayerHistoryRecord(state, puzzle);
    recordGameResult(GAME1_ID, history);
    void saveGameResult(GAME1_ID, history);
    renderResult();
  }

  function renderResult() {
    const labels = {
      [GAME1_RESULT.SOLVED]: "Solved!",
      [GAME1_RESULT.FAILED_CLOSE]: "Failed — Close",
      [GAME1_RESULT.FAILED_HARD]: "Failed — Hard"
    };

    const details = {
      [GAME1_RESULT.SOLVED]: "Solved within the six normal attempts.",
      [GAME1_RESULT.FAILED_CLOSE]: "The seventh guess was close, but it does not count as a solve.",
      [GAME1_RESULT.FAILED_HARD]: "The puzzle was not solved within the normal attempts."
    };

    resultBox.innerHTML = `
      <div class="result-card result-${state.result.toLowerCase()}">
        <h3>${labels[state.result]}</h3>
        <p>${details[state.result]}</p>
        <p>The answer was: <strong>${state.answer}</strong></p>
      </div>`;
    seeWhyButton.classList.remove("hidden");
  }

  function submitNormal() {
    if (state.status !== "playing") return;

    if (currentInput.length !== 5) {
      showMessage("Enter a five-letter word.");
      return;
    }

    const result = submitNormalGuess(state, currentInput, puzzle.answer);

    if (!result.ok) {
      if (result.duplicate) {
        currentInput = "";
        showMessage(result.message, true);
        renderBoard();
      } else {
        showMessage(result.message);
      }
      focusGame();
      return;
    }

    currentInput = "";
    showMessage(result.seventhStage ? "You used all six normal attempts." : "");
    renderBoard();
    renderClues();

    if (result.solved) finishGame();
    focusGame();
  }

  function submitSeventh() {
    if (state.status !== "awaiting-seventh") return;

    if (currentInput.length !== 5) {
      showMessage("Enter a five-letter word.");
      return;
    }

    const result = submitSeventhGuess(state, currentInput, puzzle.answer);

    if (!result.ok) {
      if (result.duplicate) {
        currentInput = "";
        showMessage(result.message, true);
        renderBoard();
      } else {
        showMessage(result.message);
      }
      focusGame();
      return;
    }

    currentInput = "";

    showMessage(
      result.result === GAME1_RESULT.FAILED_CLOSE
        ? "Your final guess was close."
        : "Your final guess was not close enough."
    );
    renderBoard();
    finishGame();
    focusGame();
  }

  function skipSeventh() {
    if (state.status !== "awaiting-seventh") return;

    skipSeventhAttempt(state, puzzle.answer);
    currentInput = "";
    showMessage("You didn't take the final guess. Result: Failed — Hard.");
    renderBoard();
    finishGame();
    focusGame();
  }

  function renderBoard() {
    const rows = Array.from({ length: GAME1_CONFIG.normalAttempts }, (_, index) => {
      const guess = state.guesses[index] || "";
      const feedback = state.feedback[index];
      const isCurrent = state.status === "playing" && index === getNextNormalAttemptIndex(state);

      const cells = Array.from({ length: 5 }, (_, letterIndex) => {
        const value = guess[letterIndex] || (isCurrent ? currentInput[letterIndex] || "" : "");
        const status = feedback?.[letterIndex] || "";
        return `<span class="letter-cell ${status}">${value}</span>`;
      }).join("");

      return `<div class="game-row${isCurrent ? " active" : ""}" aria-current="${isCurrent ? "true" : "false"}">${cells}</div>`;
    }).join("");

    const seventh =
      (state.status === "awaiting-seventh" || state.seventhGuessUsed)
        ? `
          <div class="seventh-stage">
            <div class="close-banner">You failed — but are you close?</div>
            <div class="game-row seventh-row${state.status === "awaiting-seventh" ? " active" : ""}" aria-current="${state.status === "awaiting-seventh" ? "true" : "false"}">
              ${Array.from({ length: 5 }, (_, index) => {
                const value =
                  state.guesses[GAME1_CONFIG.normalAttempts]?.[index] ||
                  (state.status === "awaiting-seventh" ? currentInput[index] || "" : "");
                const status = state.feedback[GAME1_CONFIG.normalAttempts]?.[index] || "";
                return `<span class="letter-cell ${status}">${value}</span>`;
              }).join("")}
            </div>
            ${state.status === "awaiting-seventh" ? `
            <div class="seventh-actions">
              <button class="button" id="seventh-submit" type="button">Submit 7th Guess</button>
              <button class="button secondary" id="seventh-skip" type="button">Skip Final Guess</button>
            </div>` : ""}
          </div>`
        : "";

    board.innerHTML = rows + seventh;
    board.querySelector("#seventh-submit")?.addEventListener("click", submitSeventh);
    board.querySelector("#seventh-skip")?.addEventListener("click", skipSeventh);
  }

  function renderClues() {
    clues.innerHTML = state.clues.map((status, index) => {
      const number = index + 1;
      const currentAttemptIndex = getNextNormalAttemptIndex(state);
      const action =
        status === "available" &&
        state.status === "playing" &&
        index === currentAttemptIndex
          ? `<button class="button secondary clue-action" data-clue="${number}" type="button">Use Clue #${number}</button>`
          : "";

      const text =
        status === "used" ? puzzle.clues[index] :
        status === "skipped" ? "Clue skipped" :
        "Clue not revealed";

      return `
        <div class="clue-box ${status}">
          <strong>Clue #${number}</strong>
          <span>${text}</span>
          ${action}
        </div>`;
    }).join("");

    clues.querySelectorAll(".clue-action").forEach((button) => {
      button.addEventListener("click", () => {
        const result = useClue(state, Number(button.dataset.clue));
        showMessage(result.message || "Clue revealed.");
        renderBoard();
        renderClues();
        focusGame();
      });
    });
  }

  function renderKeyboard() {
    keyboard.innerHTML =
      LETTERS.split("").map((letter) =>
        `<button type="button" class="key" data-key="${letter}">${letter}</button>`
      ).join("") +
      '<button type="button" class="key wide" data-key="BACKSPACE">⌫</button>' +
      '<button type="button" class="key wide" data-key="ENTER">Enter</button>';
  }

  function addInputKey(key) {
    if (state.status !== "playing" && state.status !== "awaiting-seventh") return;

    if (key === "BACKSPACE") {
      currentInput = currentInput.slice(0, -1);
    } else if (key === "ENTER") {
      state.status === "playing" ? submitNormal() : submitSeventh();
      return;
    } else if (/^[A-Z]$/.test(key) && currentInput.length < 5) {
      currentInput += key;
    }

    renderBoard();
  }

  keyboard.addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]")?.dataset.key;
    if (key) addInputKey(key);
    focusGame();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.status === "playing" ? submitNormal() : submitSeventh();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      addInputKey("BACKSPACE");
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      addInputKey(event.key.toUpperCase());
    }
  });

  root.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") || "";
    currentInput = sanitizeGuessInput(pasted);
    renderBoard();
    focusGame();
  });

  seeWhyButton.addEventListener("click", () => {
    if (state.status !== "finished") return;

    const context =
      state.result === GAME1_RESULT.SOLVED
        ? "You solved the puzzle. Here is the clue-to-answer explanation."
        : state.result === GAME1_RESULT.FAILED_CLOSE
          ? "You were close, but the seventh guess remains a failure result."
          : "The puzzle ended as a hard failure. Here is the full explanation.";

    container.querySelector("#game1-explanation").innerHTML = `
      <div class="explanation-card" id="explanation-card">
        <h3>See Why</h3>
        <p>${context}</p>
        <p><strong>Answer:</strong> ${puzzle.answer}</p>
        ${puzzle.clues.map((clue, index) =>
          `<p><strong>Clue #${index + 1}:</strong> ${clue}</p>`
        ).join("")}
      </div>`;

    seeWhyButton.classList.add("hidden");
  });

  container.querySelector("#game1-back").addEventListener("click", () => {
    document.title = "EmniFun";
    container.dispatchEvent(new CustomEvent("game1-back"));
  });

  renderBoard();
  renderClues();
  renderKeyboard();
  focusGame();
}
