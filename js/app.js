import { renderGame1 } from "./games/game1/game1-ui.js";
import { renderGame2 } from "./games/game2/game2-ui.js";
import { renderGame3 } from "./games/game3/game3-ui.js";
import { getGameStatistics } from "./statistics/statistics.js";
import { isLoggedIn } from "./auth/auth.js";

const views = [...document.querySelectorAll(".view")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const viewLinks = [...document.querySelectorAll("[data-view]")];
const gamesView = document.querySelector("#games");
const gameArea = document.querySelector("#game-area");

function showView(viewId) {
  document.title = "EmniFun";
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === viewId));
  if (viewId === "statistics") renderStatistics();
}

function renderGames() {
  gameArea.innerHTML =
    '<div class="card-grid">' +
      '<article class="card"><h3>FiveWink</h3><p>Wink your way to the word.</p><button class="button" data-game="game1">Play</button></article>' +
      '<article class="card"><h3>Game 2</h3><p>Another independent game slot for future development.</p><button class="button secondary" data-game="game2">Coming Soon</button></article>' +
      '<article class="card"><h3>Game 3</h3><p>A third independent game slot for future development.</p><button class="button secondary" data-game="game3">Coming Soon</button></article>' +
    '</div>';

  gameArea.querySelector('[data-game="game1"]').addEventListener("click", () => {
    gamesView.classList.add("game-playing");
    void renderGame1(gameArea);
  });
  gameArea.querySelector('[data-game="game2"]').addEventListener("click", () => renderGame2(gameArea));
  gameArea.querySelector('[data-game="game3"]').addEventListener("click", () => renderGame3(gameArea));
}

function renderStatistics() {
  const stats = getGameStatistics("game1");
  document.querySelector("#statistics-content").innerHTML =
    '<div class="stats-grid">' +
      '<div class="stat"><span>Current streak</span><strong>' + stats.currentStreak + '</strong></div>' +
      '<div class="stat"><span>Maximum streak</span><strong>' + stats.longestStreak + '</strong></div>' +
      '<div class="stat"><span>Total games</span><strong>' + stats.totalGames + '</strong></div>' +
      '<div class="stat"><span>Solved</span><strong>' + stats.solved + '</strong></div>' +
      '<div class="stat"><span>Failed — Close</span><strong>' + stats.failedClose + '</strong></div>' +
      '<div class="stat"><span>Failed — Hard</span><strong>' + stats.failedHard + '</strong></div>' +
    '</div>';
}

function setupNavigation() {
  viewLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView(link.dataset.view);
    });
  });

  document.querySelectorAll("[data-go-games]").forEach((button) => {
    button.addEventListener("click", () => showView("games"));
  });

  gameArea.addEventListener("game1-back", () => {
    gamesView.classList.remove("game-playing");
    renderGames();
  });
}

function initialize() {
  setupNavigation();
  renderGames();
  renderStatistics();
  document.querySelector("#login-status").textContent = isLoggedIn()
    ? "You are currently signed in."
    : "Login and registration will be connected to the backend in a future phase.";
}

initialize();
