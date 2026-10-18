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

const views = typeof document !== "undefined" ? [...document.querySelectorAll(".view")] : [];
const navLinks = typeof document !== "undefined" ? [...document.querySelectorAll(".nav-link")] : [];
const gamesView = typeof document !== "undefined" ? document.querySelector("#games") : null;
const gameArea = typeof document !== "undefined" ? document.querySelector("#game-area") : null;
const accountContent = typeof document !== "undefined" ? document.querySelector("#account-content") : null;
const loginContent = typeof document !== "undefined" ? document.querySelector("#login-content") : null;
const mobileMenuToggle = typeof document !== "undefined" ? document.querySelector("#mobile-menu-toggle") : null;
const primaryNavigation = typeof document !== "undefined" ? document.querySelector("#primary-navigation") : null;

export const DEFAULT_ROUTE = "home";
export const PRIMARY_ROUTES = new Set([
  "home",
  "games",
  "statistics",
  "archive",
  "login",
  "account"
]);
export const GAME_ROUTES = new Set([
  "games/fivewink",
  "games/game1",
  "games/game2",
  "games/game3"
]);
export const ACCOUNT_ROUTES = new Set(["account", "account/vault"]);
export const INFO_ROUTES = new Set([
  "about",
  "rules",
  "privacy",
  "privacy-policy",
  "contact"
]);
export const ROUTES = new Set([
  ...PRIMARY_ROUTES,
  ...GAME_ROUTES,
  ...ACCOUNT_ROUTES,
  ...INFO_ROUTES
]);
export const RULES_GUIDE_HASHES = new Set([
  "standard",
  "fivewink-standard",
  "strict",
  "fivewink-strict",
  "mindbender",
  "fivewink-mindbender",
  "expert",
  "fivewink-expert",
  "faq",
  "fivewink-faq",
  "guide-faq",
  "rules-faq",
  "guide",
  "fivewink",
  "guide-fivewink",
  "game2",
  "guide-game2",
  "game3",
  "guide-game3"
]);

export function getPublicSiteRoot() {
  if (typeof window === "undefined" || !window.location) return "/";
  const sectionMatch = window.location.pathname.match(/^(.*\/)(?:games|admin|about|rules|privacy|privacy-policy|contact)(?:\/.*)?$/i);
  if (sectionMatch) {
    return sectionMatch[1];
  }
  const pathname = window.location.pathname;
  const lastSlashIndex = pathname.lastIndexOf("/");
  if (lastSlashIndex >= 0) {
    return pathname.substring(0, lastSlashIndex + 1);
  }
  return "/";
}

export function getGamesUrl() {
  return getPublicSiteRoot() + "Games/";
}

export function getGameUrl(name) {
  const base = getGamesUrl();
  if (!name) return base;
  const lower = name.toLowerCase();
  if (lower === "fivewink" || lower === "game1") {
    return base + "FiveWink/";
  }
  if (lower === "game2") {
    return base + "Game2/";
  }
  if (lower === "game3") {
    return base + "Game3/";
  }
  return base + name + "/";
}

export function getAboutUrl() {
  return getPublicSiteRoot() + "about/";
}

export function getRulesUrl() {
  return getPublicSiteRoot() + "rules/";
}

export function getPrivacyUrl() {
  return getPublicSiteRoot() + "privacy/";
}

export function getContactUrl() {
  return getPublicSiteRoot() + "contact/";
}

export function normalizeRoute(route) {
  if (!route) return DEFAULT_ROUTE;
  const lower = route.toLowerCase().trim();
  if (lower === "games/game1") return "games/fivewink";
  if (lower === "privacy-policy" || lower === "privacy policy") return "privacy";
  if (RULES_GUIDE_HASHES.has(lower)) return "rules";
  if (ROUTES.has(lower)) return lower;
  if (lower.startsWith("games/")) return lower;
  return DEFAULT_ROUTE;
}

export function getRouteUrl(route) {
  const current = normalizeRoute(route);
  if (current === "home") {
    return getPublicSiteRoot();
  }
  if (current === "games") {
    return getGamesUrl();
  }
  if (current.startsWith("games/")) {
    const gameName = current.slice("games/".length);
    return getGameUrl(gameName);
  }
  if (current === "about") {
    return getAboutUrl();
  }
  if (current === "rules") {
    return getRulesUrl();
  }
  if (current === "privacy") {
    return getPrivacyUrl();
  }
  if (current === "contact") {
    return getContactUrl();
  }
  return getPublicSiteRoot() + "#" + current;
}

export function getCurrentRoute() {
  if (typeof window === "undefined" || !window.location) return DEFAULT_ROUTE;

  const pathname = window.location.pathname.replace(/\/index\.html$/i, "/");
  const gamesMatch = pathname.match(/^(?:.*\/)?games(?:\/(.*))?$/i);

  if (gamesMatch) {
    const sub = (gamesMatch[1] || "").replace(/\/+$/, "").trim().toLowerCase();
    if (!sub) {
      return "games";
    }
    if (sub === "fivewink" || sub === "game1") {
      return "games/fivewink";
    }
    if (sub === "game2") {
      return "games/game2";
    }
    if (sub === "game3") {
      return "games/game3";
    }
    return "games/" + sub;
  }

  const infoMatch = pathname.match(/^(?:.*\/)?(about|rules|privacy|privacy-policy|contact)(?:\/.*)?$/i);
  if (infoMatch) {
    const raw = infoMatch[1].toLowerCase();
    return raw === "privacy-policy" ? "privacy" : raw;
  }

  const rawHash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (rawHash) {
    if (rawHash === "games") return "games";
    if (rawHash === "games/game1" || rawHash === "games/fivewink") return "games/fivewink";
    if (rawHash === "games/game2") return "games/game2";
    if (rawHash === "games/game3") return "games/game3";
    if (rawHash === "privacy-policy") return "privacy";
    if (RULES_GUIDE_HASHES.has(rawHash)) return "rules";
    if (ROUTES.has(rawHash)) return rawHash;
  }

  return DEFAULT_ROUTE;
}

export function getRouteFromHash() {
  return getCurrentRoute();
}

function resolveAuthRoute(route) {
  const currentRoute = normalizeRoute(route);
  const user = getCurrentUser();

  if (user && currentRoute === "login") return "account";
  if (!user && ACCOUNT_ROUTES.has(currentRoute)) return "login";
  return currentRoute;
}

function closeMobileNavigation() {
  if (!primaryNavigation || !mobileMenuToggle) return;
  primaryNavigation.classList.remove("mobile-open");
  mobileMenuToggle.classList.remove("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", "Open navigation");
}

function openMobileNavigation() {
  if (!primaryNavigation || !mobileMenuToggle) return;
  primaryNavigation.classList.add("mobile-open");
  mobileMenuToggle.classList.add("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "true");
  mobileMenuToggle.setAttribute("aria-label", "Close navigation");
}

function toggleMobileNavigation() {
  if (!primaryNavigation) return;
  const isOpen = primaryNavigation.classList.contains("mobile-open");
  if (isOpen) {
    closeMobileNavigation();
  } else {
    openMobileNavigation();
  }
}

function syncAuthNavigation() {
  const user = getCurrentUser();
  const signedIn = Boolean(user);

  const loginLink = navLinks.find((link) => link.dataset.navAuth === "true");
  if (loginLink) {
    loginLink.dataset.view = signedIn ? "account" : "login";
    loginLink.textContent = signedIn ? "Account" : "Login";
  }

  const adminLink = document.querySelector("#nav-admin");
  if (adminLink) {
    const isAdmin = Boolean(user && user.isAdmin === true);
    adminLink.style.display = isAdmin ? "" : "none";
  }
}

export function navigateTo(route) {
  closeMobileNavigation();
  const nextRoute = resolveAuthRoute(route);
  const targetUrl = getRouteUrl(nextRoute);
  const currentRoute = getCurrentRoute();

  if (currentRoute === nextRoute) {
    renderRoute(nextRoute);
    return;
  }

  if (typeof window !== "undefined" && window.history?.pushState) {
    window.history.pushState({ route: nextRoute }, "", targetUrl);
  } else if (typeof window !== "undefined") {
    window.location.href = targetUrl;
    return;
  }

  renderRoute(nextRoute);
}

export function renderRoute(route) {
  const currentRoute = resolveAuthRoute(route);
  const isFiveWink = currentRoute === "games/fivewink" || currentRoute === "games/game1";
  const isGame2 = currentRoute === "games/game2";
  const isGame3 = currentRoute === "games/game3";
  const isAnyGame = isFiveWink || isGame2 || isGame3 || currentRoute.startsWith("games/");
  const isAccount = ACCOUNT_ROUTES.has(currentRoute);
  const viewId = (currentRoute === "games" || isAnyGame) ? "games" : isAccount ? "account" : currentRoute;

  document.title =
    isFiveWink
      ? "FiveWink — EmniFun"
      : isGame2
        ? "Game 2 — EmniFun"
        : isGame3
          ? "Game 3 — EmniFun"
          : currentRoute === "games"
            ? "Games — EmniFun"
            : currentRoute === "account/vault"
              ? "Recovery Vault — EmniFun"
              : currentRoute === "account"
                ? "Account — EmniFun"
                : currentRoute === "about"
                  ? "About — EmniFun"
                  : currentRoute === "rules"
                    ? "Rules — EmniFun"
                    : currentRoute === "privacy"
                      ? "Privacy Policy — EmniFun"
                      : currentRoute === "contact"
                        ? "Contact — EmniFun"
                        : "EmniFun";

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
    if (isFiveWink) {
      gamesView?.classList.add("game-playing");
      if (gameArea) void renderGame1(gameArea);
    } else if (isGame2) {
      gamesView?.classList.add("game-playing");
      if (gameArea) renderGame2(gameArea);
    } else if (isGame3) {
      gamesView?.classList.add("game-playing");
      if (gameArea) renderGame3(gameArea);
    } else {
      gamesView?.classList.remove("game-playing");
      renderGames();
    }
  } else if (gamesView?.classList.contains("game-playing")) {
    gamesView.classList.remove("game-playing");
    renderGames();
  }

  if (viewId === "statistics") {
    renderStatistics();
  }

  if (viewId === "login" && loginContent) {
    renderLoginPage(loginContent);
  }

  if (viewId === "account" && accountContent) {
    renderAccountPage(accountContent, currentRoute);
  }

  if (viewId === "rules") {
    initRulesGuide();
  }

  syncFooter();
}

export function initRulesGuide() {
  if (typeof document === "undefined") return;
  const rulesView = document.querySelector("#rules");
  if (!rulesView) return;

  const tabButtons = rulesView.querySelectorAll("[data-guide-tab]");
  const panes = rulesView.querySelectorAll(".guide-pane");
  const fivewinkDetails = rulesView.querySelector("#guide-fivewink");
  const game2Details = rulesView.querySelector("#guide-game2");
  const game3Details = rulesView.querySelector("#guide-game3");

  function switchTab(tabId, updateHash = true) {
    tabButtons.forEach((btn) => {
      const isSelected = btn.dataset.guideTab === tabId;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
      btn.setAttribute("tabindex", isSelected ? "0" : "-1");
    });

    panes.forEach((pane) => {
      const isPane = pane.dataset.pane === tabId;
      pane.classList.toggle("active", isPane);
      if (isPane) {
        pane.removeAttribute("hidden");
      } else {
        pane.setAttribute("hidden", "true");
      }
    });

    if (fivewinkDetails && !fivewinkDetails.open) {
      fivewinkDetails.open = true;
    }

    if (updateHash && typeof window !== "undefined" && window.history?.replaceState) {
      const currentUrl = new URL(window.location.href);
      currentUrl.hash = tabId;
      window.history.replaceState({ route: "rules", tab: tabId }, "", currentUrl.toString());
    }
  }

  tabButtons.forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      switchTab(btn.dataset.guideTab);
    });

    btn.addEventListener("keydown", (e) => {
      const buttons = [...tabButtons];
      const index = buttons.indexOf(btn);
      let targetIndex = -1;

      if (e.key === "ArrowRight") {
        targetIndex = (index + 1) % buttons.length;
      } else if (e.key === "ArrowLeft") {
        targetIndex = (index - 1 + buttons.length) % buttons.length;
      } else if (e.key === "Home") {
        targetIndex = 0;
      } else if (e.key === "End") {
        targetIndex = buttons.length - 1;
      }

      if (targetIndex !== -1) {
        e.preventDefault();
        buttons[targetIndex].focus();
        buttons[targetIndex].click();
      }
    });
  });

  function handleHash() {
    if (typeof window === "undefined" || !window.location.hash) return;
    const rawHash = window.location.hash.replace(/^#/, "").toLowerCase().trim();
    if (!rawHash) return;

    if (rawHash === "fivewink" || rawHash === "guide-fivewink") {
      if (fivewinkDetails) fivewinkDetails.open = true;
      fivewinkDetails?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (rawHash === "game2" || rawHash === "guide-game2") {
      if (game2Details) game2Details.open = true;
      game2Details?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (rawHash === "game3" || rawHash === "guide-game3") {
      if (game3Details) game3Details.open = true;
      game3Details?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const tabMap = {
      standard: "standard",
      "fivewink-standard": "standard",
      strict: "strict",
      "fivewink-strict": "strict",
      mindbender: "mindbender",
      "fivewink-mindbender": "mindbender",
      expert: "expert",
      "fivewink-expert": "expert",
      faq: "faq",
      "fivewink-faq": "faq",
      "guide-faq": "faq",
      "rules-faq": "faq",
      guide: "faq"
    };

    const targetTab = tabMap[rawHash];
    if (targetTab) {
      switchTab(targetTab, false);
      const targetElement = rulesView.querySelector(`[data-pane="${targetTab}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  handleHash();
}

export function renderGames() {
  if (!gameArea) return;
  gameArea.innerHTML =
    '<div class="card-grid">' +
      '<article class="card"><h3>FiveWink</h3><p>Wink your way to the word.</p><button class="button" data-game="game1">Play</button></article>' +
      '<article class="card"><h3>Game 2</h3><p>Another independent game slot for future development.</p><button class="button secondary" data-game="game2">Coming Soon</button></article>' +
      '<article class="card"><h3>Game 3</h3><p>A third independent game slot for future development.</p><button class="button secondary" data-game="game3">Coming Soon</button></article>' +
    '</div>';

  gameArea.querySelector('[data-game="game1"]')?.addEventListener("click", () => {
    navigateTo("games/fivewink");
  });

  gameArea.querySelector('[data-game="game2"]')?.addEventListener("click", () => {
    navigateTo("games/game2");
  });

  gameArea.querySelector('[data-game="game3"]')?.addEventListener("click", () => {
    navigateTo("games/game3");
  });
}

function renderStatistics() {
  const stats = getGameStatistics("game1");
  const statsContent = document.querySelector("#statistics-content");
  if (!statsContent) return;
  statsContent.innerHTML =
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
  mobileMenuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMobileNavigation();
  });

  primaryNavigation?.addEventListener("click", (event) => {
    if (event.target.closest("[data-view]") || event.target.closest("#nav-admin")) {
      closeMobileNavigation();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      primaryNavigation?.classList.contains("mobile-open") &&
      !primaryNavigation.contains(event.target) &&
      !mobileMenuToggle?.contains(event.target)
    ) {
      closeMobileNavigation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && primaryNavigation?.classList.contains("mobile-open")) {
      closeMobileNavigation();
      mobileMenuToggle?.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const link = event.target.closest("[data-view]");
    if (link && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigateTo(link.dataset.view);
    }
  });

  document.querySelectorAll("[data-go-games]").forEach((button) => {
    button.addEventListener("click", () => navigateTo("games"));
  });

  gameArea?.addEventListener("game1-back", () => {
    navigateTo("games");
  });

  window.addEventListener("popstate", (event) => {
    const route = event.state?.route || getCurrentRoute();
    renderRoute(route);
  });

  window.addEventListener("hashchange", () => {
    const route = getCurrentRoute();
    renderRoute(route);
  });

  window.addEventListener("emnifun-auth-changed", () => {
    syncAuthNavigation();
    renderRoute(getCurrentRoute());
  });
}

export function getFooterHtml(siteRoot = getPublicSiteRoot()) {
  const root = siteRoot.endsWith("/") ? siteRoot : siteRoot + "/";
  return (
    '<div class="footer-inner">' +
      '<div class="footer-brand">' +
        '<strong>EmniFun</strong> · FiveWink functional prototype' +
      '</div>' +
      '<nav class="footer-nav" aria-label="Footer navigation">' +
        '<a class="footer-link" href="' + root + 'about/" data-view="about">About</a>' +
        '<span class="footer-sep" aria-hidden="true">·</span>' +
        '<a class="footer-link" href="' + root + 'rules/" data-view="rules">Rules</a>' +
        '<span class="footer-sep" aria-hidden="true">·</span>' +
        '<a class="footer-link" href="' + root + 'privacy/" data-view="privacy">Privacy Policy</a>' +
        '<span class="footer-sep" aria-hidden="true">·</span>' +
        '<a class="footer-link" href="' + root + 'contact/" data-view="contact">Contact</a>' +
      '</nav>' +
    '</div>'
  );
}

export function syncFooter() {
  if (typeof document === "undefined") return;
  const footer = document.querySelector(".site-footer");
  if (!footer) return;
  const root = getPublicSiteRoot();
  const currentRoute = getCurrentRoute();
  const nav = footer.querySelector(".footer-nav");
  if (!nav) {
    footer.innerHTML = getFooterHtml(root);
  }
  const links = footer.querySelectorAll(".footer-link");
  links.forEach((link) => {
    const view = link.dataset.view;
    if (view) {
      link.href = getRouteUrl(view);
      if (currentRoute === view) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  });
}

export async function initialize() {
  setupNavigation();
  await hydrateAuth();
  syncAuthNavigation();

  const route = getCurrentRoute();

  if (typeof window !== "undefined" && window.location.hash.toLowerCase().startsWith("#games")) {
    const cleanUrl = getRouteUrl(route);
    if (window.history?.replaceState) {
      window.history.replaceState({ route }, "", cleanUrl);
    }
  }

  renderRoute(route);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void initialize();
}
