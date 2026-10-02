import { renderGame1 } from "./games/game1/game1-ui.js";
import { renderGame2 } from "./games/game2/game2-ui.js";
import { renderGame3 } from "./games/game3/game3-ui.js";
import { getGameStatistics } from "./statistics/statistics.js";
import { isLoggedIn } from "./auth/auth.js";

const views = [...document.querySelectorAll(".view")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const viewLinks = [...document.querySelectorAll("[data-view]")];
const gameArea = document.querySelector("#game-area");

function showView(viewId) {
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderGames() {
  gameArea.innerHTML =
    '<div class="card-grid">' +
      '<article class="card"><h3>Game 1</h3><p>The first puzzle slot is ready for future mechanics.</p><button class="button" data-game="game1">Play</button></article>' +
      '<article class="card"><h3>Game 2</h3><p>Another independent game slot for future development.</p><button class="button secondary" data-game="game2">Coming Soon</button></article>' +
      '<article class="card"><h3>Game 3</h3><p>A third independent game slot for future development.</p><button class="button secondary" data-game="game3">Coming Soon</button></article>' +
    '</div>';

  gameArea.querySelector('[data-game="game1"]').addEventListener("click", () => renderGame1(gameArea));
  gameArea.querySelector('[data-game="game2"]').addEventListener("click", () => renderGame2(gameArea));
  gameArea.querySelector('[data-game="game3"]').addEventListener("click", () => renderGame3(gameArea));
}

function renderStatistics() {
  const game1Stats = getGameStatistics("game1");
  document.querySelector("#statistics-content").innerHTML =
    '<div class="stats-grid">' +
      '<div class="stat"><span>Current streak</span><strong>' + game1Stats.currentStreak + '</strong></div>' +
      '<div class="stat"><span>Longest streak</span><strong>' + game1Stats.longestStreak + '</strong></div>' +
      '<div class="stat"><span>Total games</span><strong>' + game1Stats.totalGames + '</strong></div>' +
      '<div class="stat"><span>Average guesses</span><strong>—</strong></div>' +
    '</div>' +
    '<p class="section-heading">These are placeholder values. Future statistics will be stored separately for each game.</p>';
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
