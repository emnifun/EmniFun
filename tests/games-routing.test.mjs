import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getPublicSiteRoot,
  getGamesUrl,
  getGameUrl,
  normalizeRoute,
  getRouteUrl,
  DEFAULT_ROUTE,
  PRIMARY_ROUTES,
  GAME_ROUTES,
  ROUTES
} from "../js/app.js";

test("games routing: URL generation and normalization helpers", () => {
  // Base URLs
  const siteRoot = getPublicSiteRoot();
  assert.equal(getGamesUrl(), siteRoot + "Games/");

  // Game specific URLs
  assert.equal(getGameUrl("fivewink"), siteRoot + "Games/FiveWink/");
  assert.equal(getGameUrl("game1"), siteRoot + "Games/FiveWink/");
  assert.equal(getGameUrl("FiveWink"), siteRoot + "Games/FiveWink/");
  assert.equal(getGameUrl("game2"), siteRoot + "Games/Game2/");
  assert.equal(getGameUrl("Game2"), siteRoot + "Games/Game2/");
  assert.equal(getGameUrl("game3"), siteRoot + "Games/Game3/");
  assert.equal(getGameUrl("Game3"), siteRoot + "Games/Game3/");

  // Normalization
  assert.equal(normalizeRoute("games/game1"), "games/fivewink");
  assert.equal(normalizeRoute("games/fivewink"), "games/fivewink");
  assert.equal(normalizeRoute("games/game2"), "games/game2");
  assert.equal(normalizeRoute("games/game3"), "games/game3");
  assert.equal(normalizeRoute("games"), "games");
  assert.equal(normalizeRoute("home"), "home");
  assert.equal(normalizeRoute("invalid-route"), DEFAULT_ROUTE);

  // Route URL generation
  assert.equal(getRouteUrl("games"), siteRoot + "Games/");
  assert.equal(getRouteUrl("games/fivewink"), siteRoot + "Games/FiveWink/");
  assert.equal(getRouteUrl("games/game1"), siteRoot + "Games/FiveWink/");
  assert.equal(getRouteUrl("games/game2"), siteRoot + "Games/Game2/");
  assert.equal(getRouteUrl("games/game3"), siteRoot + "Games/Game3/");
  assert.equal(getRouteUrl("home"), siteRoot);
  assert.equal(getRouteUrl("statistics"), siteRoot + "#statistics");

  // Route sets
  assert.equal(GAME_ROUTES.has("games/fivewink"), true);
  assert.equal(GAME_ROUTES.has("games/game2"), true);
  assert.equal(GAME_ROUTES.has("games/game3"), true);
  assert.equal(PRIMARY_ROUTES.has("games"), true);
  assert.equal(ROUTES.has("games"), true);
  assert.equal(ROUTES.has("games/fivewink"), true);
});

test("games routing: static HTML entry points exist for GitHub Pages direct navigation", async () => {
  const gamesIndex = await readFile(new URL("../Games/index.html", import.meta.url), "utf8");
  const fiveWinkIndex = await readFile(new URL("../Games/FiveWink/index.html", import.meta.url), "utf8");
  const game2Index = await readFile(new URL("../Games/Game2/index.html", import.meta.url), "utf8");
  const game3Index = await readFile(new URL("../Games/Game3/index.html", import.meta.url), "utf8");

  // Verify page titles
  assert.match(gamesIndex, /<title>Games — EmniFun<\/title>/);
  assert.match(fiveWinkIndex, /<title>FiveWink — EmniFun<\/title>/);
  assert.match(game2Index, /<title>Game 2 — EmniFun<\/title>/);
  assert.match(game3Index, /<title>Game 3 — EmniFun<\/title>/);

  // Verify script and stylesheet relative paths
  assert.match(gamesIndex, /<link rel="stylesheet" href="\.\.\/css\/style\.css">/);
  assert.match(gamesIndex, /<script type="module" src="\.\.\/js\/app\.js"><\/script>/);

  assert.match(fiveWinkIndex, /<link rel="stylesheet" href="\.\.\/\.\.\/css\/style\.css">/);
  assert.match(fiveWinkIndex, /<script type="module" src="\.\.\/\.\.\/js\/app\.js"><\/script>/);

  assert.match(game2Index, /<link rel="stylesheet" href="\.\.\/\.\.\/css\/style\.css">/);
  assert.match(game2Index, /<script type="module" src="\.\.\/\.\.\/js\/app\.js"><\/script>/);

  assert.match(game3Index, /<link rel="stylesheet" href="\.\.\/\.\.\/css\/style\.css">/);
  assert.match(game3Index, /<script type="module" src="\.\.\/\.\.\/js\/app\.js"><\/script>/);

  // Verify navigation structure is present
  assert.match(gamesIndex, /id="primary-navigation"/);
  assert.match(fiveWinkIndex, /id="primary-navigation"/);
  assert.match(game2Index, /id="primary-navigation"/);
  assert.match(game3Index, /id="primary-navigation"/);

  // Verify game-area placeholder is present
  assert.match(gamesIndex, /id="game-area"/);
  assert.match(fiveWinkIndex, /Loading FiveWink…/);
  assert.match(game2Index, /Game 2/);
  assert.match(game3Index, /Game 3/);
});

test("games routing: admin links point to /Games/FiveWink/ and obsolete #games/game1 is removed", async () => {
  const adminJs = await readFile(new URL("../admin/admin.js", import.meta.url), "utf8");

  assert.doesNotMatch(adminJs, /#games\/game1/);
  assert.match(adminJs, /Games\/FiveWink\//);

  const appJs = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(appJs, /navigateTo\("games\/fivewink"\)/);
});
