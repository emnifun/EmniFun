import { game1Puzzle } from "./game1-data.js";
import {
  GAME1_CONFIG,
  GAME1_RESULT,
  buildPlayerHistoryRecord,
  createGame1State,
  isValidGuess,
  submitNormalGuess,
  submitSeventhGuess,
  skipSeventhAttempt,
  useClue
} from "./game1-logic.js";
import { recordGameResult } from "../../statistics/statistics.js";
import { saveGameResult } from "../../services/api.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function renderGame1(container) {
  const state = createGame1State();
  let currentInput = "";

  container.innerHTML = `
    <div class="game-shell">
      <div class="game-header">
        <div>
          <p class="eyebrow">Daily Puzzle · ${game1Puzzle.date}</p>
          <h2>Game 1</h2>
          <p>Find the hidden five-letter word.</p>
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

  const board = container.querySelector("#game1-board");
  const clues = container.querySelector("#game1-clues");
  const keyboard = container.querySelector("#game1-keyboard");
  const messageBox = container.querySelector("#game1-message");
  const resultBox = container.querySelector("#game1-result");
  const seeWhyButton = container.querySelector("#game1-see-why");

  function showMessage(message = "") {
    messageBox.textContent = message;
  }

  function renderBoard() {
    const rows = Array.from({ length: GAME1_CONFIG.normalAttempts }, (_, index) => {
      const guess = state.guesses[index] || "";
      const feedback = state.feedback[index];
      const isCurrent = state.status === "playing" && index === state.attemptNumber - 1;

      const cells = Array.from({ length: 5 }, (_, letterIndex) => {
        const value = guess[letterIndex] || (isCurrent ? currentInput[letterIndex] || "" : "");
        const status = feedback?.[letterIndex] || "";
        return `<span class="letter-cell ${status}">${value}</span>`;
      }).join("");

      return `<div class="game-row">${cells}</div>`;
    }).join("");

    const seventh = state.status === "awaiting-seventh"
      ? `
        <div class="seventh-stage">
          <div class="close-banner">You failed — but are you close?</div>
          <div class="game-row seventh-row">
            ${Array.from({ length: 5 }, (_, i) =>
              `<span class="letter-cell">${currentInput[i] || ""}</span>`
            ).join("")}
          </div>
          <div class="seventh-actions">
            <button class="button" id="seventh-submit" type="button">Submit 7th Guess</button>
            <button class="button secondary" id="seventh-skip" type="button">Skip Final Guess</button>
          </div>
        </div>`
      : "";

    board.innerHTML = rows + seventh;

    board.querySelector("#seventh-submit")?.addEventListener("click", submitSeventh);
    board.querySelector("#seventh-skip")?.addEventListener("click", skipSeventh);
  }

  function renderClues() {
    clues.innerHTML = state.clues.map((status, index) => {
      const number = index + 1;
      const action =
        status === "available" &&
        state.status === "playing" &&
        state.attemptNumber === number
          ? `<button class="button secondary clue-action" data-clue="${number}" type="button">Use Clue #${number}</button>`
          : "";

      const text =
        status === "used" ? game1Puzzle.clues[index] :
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

  function finishGame() {
    const history = buildPlayerHistoryRecord(state, game1Puzzle);
    recordGameResult(game1Puzzle.game, history);
    void saveGameResult(game1Puzzle.game, history);
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

    if (!isValidGuess(currentInput)) {
      showMessage("Not a valid word.");
      return;
    }

    const result = submitNormalGuess(state, currentInput, game1Puzzle.answer);
    currentInput = "";
    showMessage(result.seventhStage ? "You used all six normal attempts." : "");
    renderBoard();
    renderClues();

    if (result.solved) finishGame();
  }

  function submitSeventh() {
    if (state.status !== "awaiting-seventh") return;

    if (currentInput.length !== 5) {
      showMessage("Enter a five-letter word.");
      return;
    }

    if (!isValidGuess(currentInput)) {
      showMessage("Not a valid word.");
      return;
    }

    const result = submitSeventhGuess(state, currentInput, game1Puzzle.answer);
    currentInput = "";

    if (!result.ok) {
      showMessage(result.message);
      return;
    }

    showMessage(
      result.result === GAME1_RESULT.FAILED_CLOSE
        ? "Your final guess was close."
        : "Your final guess was not close enough."
    );
    renderBoard();
    finishGame();
  }

  function skipSeventh() {
    if (state.status !== "awaiting-seventh") return;

    skipSeventhAttempt(state, game1Puzzle.answer);
    currentInput = "";
    showMessage("You didn't take the final guess. Result: Failed — Hard.");
    renderBoard();
    finishGame();
  }

  keyboard.addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]")?.dataset.key;
    if (!key || (state.status !== "playing" && state.status !== "awaiting-seventh")) return;

    if (key === "BACKSPACE") {
      currentInput = currentInput.slice(0, -1);
    } else if (key === "ENTER") {
      state.status === "playing" ? submitNormal() : submitSeventh();
      return;
    } else if (currentInput.length < 5) {
      currentInput += key;
    }

    renderBoard();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.status === "playing" ? submitNormal() : submitSeventh();
      return;
    }

    if (event.key === "Backspace") {
      if (state.status === "playing" || state.status === "awaiting-seventh") {
        currentInput = currentInput.slice(0, -1);
        renderBoard();
      }
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key) &&
        currentInput.length < 5 &&
        (state.status === "playing" || state.status === "awaiting-seventh")) {
      currentInput += event.key.toUpperCase();
      renderBoard();
    }
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
        <p><strong>Answer:</strong> ${game1Puzzle.answer}</p>
        ${game1Puzzle.clues.map((clue, index) =>
          `<p><strong>Clue #${index + 1}:</strong> ${clue}</p>`
        ).join("")}
      </div>`;

    seeWhyButton.classList.add("hidden");
  });

  container.querySelector("#game1-back").addEventListener("click", () => {
    container.dispatchEvent(new CustomEvent("game1-back"));
  });

  renderBoard();
  renderClues();
  renderKeyboard();
}