import { renderGame1 } from "./games/game1/game1-ui.js";
import { renderGame2 } from "./games/game2/game2-ui.js";
import { renderGame3 } from "./games/game3/game3-ui.js";
import { getGameStatistics } from "./statistics/statistics.js";
import {
  getCurrentUser,
  hydrateAuth
} from "./auth/auth.js";
import {
  renderAccountPage,
  renderLoginPage
} from "./auth/auth-ui.js";

const views = [...document.querySelectorAll(".view")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const viewLinks = [...document.querySelectorAll("[data-view]")];
const gamesView = document.querySelector("#games");
const gameArea = document.querySelector("#game-area");
const accountContent = document.querySelector("#account-content");
const loginContent = document.querySelector("#login-content");
const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");

const DEFAULT_ROUTE = "home";
const PRIMARY_ROUTES = new Set([
  "home",
  "games",
  "statistics",
  "archive",
  "login",
  "account"
]);
const GAME_ROUTES = new Set(["games/game1"]);
const ACCOUNT_ROUTES = new Set(["account", "account/vault"]);
const ROUTES = new Set([
  ...PRIMARY_ROUTES,
  ...GAME_ROUTES,
  ...ACCOUNT_ROUTES
]);

function getRouteFromHash() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  return rawHash || DEFAULT_ROUTE;
}

function normalizeRoute(route) {
  return ROUTES.has(route) ? route : DEFAULT_ROUTE;
}

function resolveAuthRoute(route) {
  const currentRoute = normalizeRoute(route);
  const user = getCurrentUser();

  if (user && currentRoute === "login") return "account";
  if (!user && ACCOUNT_ROUTES.has(currentRoute)) return "login";
  return currentRoute;
}

function closeMobileNavigation() {
  primaryNavigation.classList.remove("mobile-open");
  mobileMenuToggle.classList.remove("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", "Open navigation");
}

function openMobileNavigation() {
  primaryNavigation.classList.add("mobile-open");
  mobileMenuToggle.classList.add("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "true");
  mobileMenuToggle.setAttribute("aria-label", "Close navigation");
}

function toggleMobileNavigation() {
  const isOpen = primaryNavigation.classList.contains("mobile-open");
  if (isOpen) {
    closeMobileNavigation();
  } else {
    openMobileNavigation();
  }
}

function syncAuthNavigation() {
  const loginLink = navLinks.find((link) => link.dataset.navAuth === "true");
  if (!loginLink) return;

  const signedIn = Boolean(getCurrentUser());
  loginLink.dataset.view = signedIn ? "account" : "login";
  loginLink.textContent = signedIn ? "Account" : "Login";
}

function navigateTo(route) {
  closeMobileNavigation();
  const nextRoute = resolveAuthRoute(route);

  if (getRouteFromHash() === nextRoute) {
    renderRoute(nextRoute);
    return;
  }

  window.location.hash = nextRoute;
}

function renderRoute(route) {
  const currentRoute = resolveAuthRoute(route);
  const isGame1 = currentRoute === "games/game1";
  const isAccount = ACCOUNT_ROUTES.has(currentRoute);
  const viewId = isGame1 ? "games" : isAccount ? "account" : currentRoute;

  document.title =
    isGame1
      ? "FiveWink — EmniFun"
      : currentRoute === "account/vault"
        ? "Recovery Vault — EmniFun"
        : currentRoute === "account"
          ? "Account — EmniFun"
          : "EmniFun";

  if (getRouteFromHash() !== currentRoute) {
    window.history.replaceState(null, "", `#${currentRoute}`);
  }

  views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });

  navLinks.forEach((link) => {
    const linkRoute = link.dataset.view;
    const active =
      linkRoute === viewId ||
      (linkRoute === "account" && isAccount) ||
      (link.dataset.navAuth === "true" && isAccount);
    link.classList.toggle("active", active);
  });

  closeMobileNavigation();

  if (viewId === "games") {
    if (isGame1) {
      gamesView.classList.add("game-playing");
      void renderGame1(gameArea);
    } else {
      gamesView.classList.remove("game-playing");
      renderGames();
    }
  } else if (gamesView.classList.contains("game-playing")) {
    gamesView.classList.remove("game-playing");
    renderGames();
  }

  if (viewId === "statistics") {
    renderStatistics();
  }

  if (viewId === "login") {
    renderLoginPage(loginContent);
  }

  if (viewId === "account") {
    renderAccountPage(accountContent, currentRoute);
  }
}

function renderGames() {
  gameArea.innerHTML =
    '<div class="card-grid">' +
      '<article class="card"><h3>FiveWink</h3><p>Wink your way to the word.</p><button class="button" data-game="game1">Play</button></article>' +
      '<article class="card"><h3>Game 2</h3><p>Another independent game slot for future development.</p><button class="button secondary" data-game="game2">Coming Soon</button></article>' +
      '<article class="card"><h3>Game 3</h3><p>A third independent game slot for future development.</p><button class="button secondary" data-game="game3">Coming Soon</button></article>' +
    '</div>';

  gameArea.querySelector('[data-game="game1"]').addEventListener("click", () => {
    navigateTo("games/game1");
  });

  gameArea.querySelector('[data-game="game2"]').addEventListener("click", () => {
    renderGame2(gameArea);
  });

  gameArea.querySelector('[data-game="game3"]').addEventListener("click", () => {
    renderGame3(gameArea);
  });
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
  mobileMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMobileNavigation();
  });

  primaryNavigation.addEventListener("click", (event) => {
    if (event.target.closest("[data-view]")) {
      closeMobileNavigation();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      primaryNavigation.classList.contains("mobile-open") &&
      !primaryNavigation.contains(event.target) &&
      !mobileMenuToggle.contains(event.target)
    ) {
      closeMobileNavigation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && primaryNavigation.classList.contains("mobile-open")) {
      closeMobileNavigation();
      mobileMenuToggle.focus();
    }
  });

  viewLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateTo(link.dataset.view);
    });
  });

  document.querySelectorAll("[data-go-games]").forEach((button) => {
    button.addEventListener("click", () => navigateTo("games"));
  });

  gameArea.addEventListener("game1-back", () => {
    navigateTo("games");
  });

  window.addEventListener("hashchange", () => {
    const route = getRouteFromHash();

    if (!ROUTES.has(route)) {
      navigateTo(DEFAULT_ROUTE);
      return;
    }

    renderRoute(route);
  });

  window.addEventListener("emnifun-auth-changed", () => {
    syncAuthNavigation();
    renderRoute(getRouteFromHash());
  });
}

async function initialize() {
  setupNavigation();
  await hydrateAuth();
  syncAuthNavigation();

  const route = getRouteFromHash();

  if (!ROUTES.has(route)) {
    window.history.replaceState(null, "", "#home");
    renderRoute(DEFAULT_ROUTE);
    return;
  }

  renderRoute(route);
}

void initialize();