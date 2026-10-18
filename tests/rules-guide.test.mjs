import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRoute, RULES_GUIDE_HASHES } from "../js/app.js";

test("Rules & Game Guide UI: Central page header, metadata, and intro shell", async () => {
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");

  // Page title and main heading
  assert.match(rulesHtml, /<title>Rules — EmniFun<\/title>/);
  assert.match(rulesHtml, /<h1[^>]*>Game Rules<\/h1>/);

  // Guide badge and breadcrumb navigation
  assert.match(rulesHtml, /class="back-link"/);
  assert.match(rulesHtml, /class="guide-badge"/);

  // Intro container shell
  assert.match(rulesHtml, /class="[^"]*guide-intro-card[^"]*"/);
});

test("Rules & Game Guide UI: Three consistent game cards layout", async () => {
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");

  // All 3 expandable sections exist as details/summary disclosure cards
  assert.match(rulesHtml, /<details class="guide-card" id="guide-fivewink"[^>]*open>/);
  assert.match(rulesHtml, /<details class="guide-card" id="guide-game2">/);
  assert.match(rulesHtml, /<details class="guide-card" id="guide-game3">/);

  // All 3 cards have summary, header, title-group, icon, title, description, and meta
  for (const gameId of ["guide-fivewink", "guide-game2", "guide-game3"]) {
    const cardRegex = new RegExp(
      `<details class="guide-card" id="${gameId}"[\\s\\S]*?<summary class="guide-card-summary"[\\s\\S]*?<div class="guide-card-header"[\\s\\S]*?<div class="guide-card-title-group"[\\s\\S]*?<span class="guide-card-icon"[\\s\\S]*?<h2 class="guide-card-title"[\\s\\S]*?<p class="guide-card-desc"[\\s\\S]*?<div class="guide-card-meta"[\\s\\S]*?<span class="mode-pill[\\s\\S]*?<span class="guide-expand-indicator"`
    );
    assert.match(rulesHtml, cardRegex, `${gameId} must have consistent card header elements`);
  }

  // Titles for all three cards
  assert.match(rulesHtml, /<h2 class="guide-card-title">FiveWink<\/h2>/);
  assert.match(rulesHtml, /<h2 class="guide-card-title">Game 2<\/h2>/);
  assert.match(rulesHtml, /<h2 class="guide-card-title">Game 3<\/h2>/);

  // Game 2 and Game 3 have Coming Soon boxes
  assert.match(rulesHtml, /id="game2-content"[^>]*>[\s\S]*?class="guide-coming-soon-box"/);
  assert.match(rulesHtml, /id="game3-content"[^>]*>[\s\S]*?class="guide-coming-soon-box"/);
});

test("Rules & Game Guide UI: FiveWink submenu has exactly five options in order", async () => {
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");

  // Tablist container
  assert.match(rulesHtml, /<nav class="guide-submenu"[^>]*role="tablist"/);

  // Exactly five tab buttons in order
  const standardIdx = rulesHtml.indexOf('data-guide-tab="standard"');
  const strictIdx = rulesHtml.indexOf('data-guide-tab="strict"');
  const mindbenderIdx = rulesHtml.indexOf('data-guide-tab="mindbender"');
  const expertIdx = rulesHtml.indexOf('data-guide-tab="expert"');
  const faqIdx = rulesHtml.indexOf('data-guide-tab="faq"');

  assert.ok(standardIdx !== -1, "Standard (Classic) tab must be present");
  assert.ok(strictIdx !== -1, "Hard Mode: Strict tab must be present");
  assert.ok(mindbenderIdx !== -1, "Hard Mode: Mindbender tab must be present");
  assert.ok(expertIdx !== -1, "Hard Mode: Expert tab must be present");
  assert.ok(faqIdx !== -1, "Player Guide & FAQ tab must be present");

  assert.ok(standardIdx < strictIdx, "Standard must precede Strict");
  assert.ok(strictIdx < mindbenderIdx, "Strict must precede Mindbender");
  assert.ok(mindbenderIdx < expertIdx, "Mindbender must precede Expert");
  assert.ok(expertIdx < faqIdx, "Expert must precede Player Guide & FAQ");

  // Each tab has a numbered indicator and status pill
  const tabMatches = rulesHtml.match(/class="guide-submenu-item[^"]*"[^>]*data-guide-tab="/g);
  assert.equal(tabMatches?.length, 5, "Submenu must contain exactly 5 tab buttons");
});

test("Rules & Game Guide UI: WAI-ARIA tab semantics, relationships, and initial states", async () => {
  for (const file of ["../rules/index.html", "../index.html"]) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");

    const expectedTabs = [
      { tabId: "tab-standard", paneId: "pane-standard", key: "standard", selected: true, tabindex: "0" },
      { tabId: "tab-strict", paneId: "pane-strict", key: "strict", selected: false, tabindex: "-1" },
      { tabId: "tab-mindbender", paneId: "pane-mindbender", key: "mindbender", selected: false, tabindex: "-1" },
      { tabId: "tab-expert", paneId: "pane-expert", key: "expert", selected: false, tabindex: "-1" },
      { tabId: "tab-faq", paneId: "pane-faq", key: "faq", selected: false, tabindex: "-1" }
    ];

    for (const { tabId, paneId, key, selected, tabindex } of expectedTabs) {
      // Tab button attributes: role, data-guide-tab, aria-selected, id, aria-controls, tabindex
      const tabPattern = new RegExp(
        `data-guide-tab="${key}"[^>]*aria-selected="${selected}"[^>]*role="tab"[^>]*id="${tabId}"[^>]*aria-controls="${paneId}"[^>]*tabindex="${tabindex}"`
      );
      assert.match(html, tabPattern, `${file}: Tab ${tabId} must have correct ARIA attributes and tabindex`);

      // Tabpanel attributes: role="tabpanel", tabindex="0", aria-labelledby matching tabId
      const panePattern = new RegExp(
        `id="${paneId}"[^>]*data-pane="${key}"[^>]*role="tabpanel"[^>]*tabindex="0"[^>]*aria-labelledby="${tabId}"`
      );
      assert.match(html, panePattern, `${file}: Pane ${paneId} must have role="tabpanel", tabindex="0", and aria-labelledby`);
    }

    // Active state: pane-standard is active and visible; other panes are hidden
    assert.match(html, /class="[^"]*guide-pane active[^"]*"[^>]*id="pane-standard"/);
    assert.match(html, /id="pane-strict"[^>]*hidden/);
    assert.match(html, /id="pane-mindbender"[^>]*hidden/);
    assert.match(html, /id="pane-expert"[^>]*hidden/);
    assert.match(html, /id="pane-faq"[^>]*hidden/);
  }
});

test("Rules & Game Guide UI: Panel structural UI components", async () => {
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");

  // Standard and Strict contain .guide-section-block layout containers
  assert.match(rulesHtml, /id="pane-standard"[^>]*>[\s\S]*?class="guide-section-block"/);
  assert.match(rulesHtml, /id="pane-strict"[^>]*>[\s\S]*?class="guide-section-block"/);

  // Mindbender and Expert contain .guide-coming-soon-box containers
  assert.match(rulesHtml, /id="pane-mindbender"[^>]*>[\s\S]*?class="guide-coming-soon-box"/);
  assert.match(rulesHtml, /id="pane-expert"[^>]*>[\s\S]*?class="guide-coming-soon-box"/);

  // FAQ pane contains interactive accordion disclosure items (.guide-faq-item)
  assert.match(rulesHtml, /id="pane-faq"[^>]*>[\s\S]*?<details class="guide-faq-item"/);

  // FAQ pane contains status badge pills for categorization
  assert.match(rulesHtml, /id="pane-faq"[^>]*>[\s\S]*?class="badge-verified"/);
  assert.match(rulesHtml, /id="pane-faq"[^>]*>[\s\S]*?class="badge-unconfirmed"/);
});

test("Rules & Game Guide UI: SPA shell synchronization in index.html", async () => {
  const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

  // index.html contains the full rules view section
  assert.match(rootHtml, /<section id="rules" class="view" aria-labelledby="rules-title">/);
  assert.match(rootHtml, /<h1 id="rules-title">Game Rules<\/h1>/);
  assert.match(rootHtml, /id="guide-fivewink"/);
  assert.match(rootHtml, /id="guide-game2"/);
  assert.match(rootHtml, /id="guide-game3"/);

  // Uses root-relative paths for SPA navigation links
  assert.match(rootHtml, /<a href="\.\/" class="back-link" data-view="home">← Back to Home<\/a>/);
  assert.match(rootHtml, /<a href="\.\/Games\/FiveWink\/" class="button" data-view="games\/fivewink">Play FiveWink<\/a>/);
});

test("Rules & Game Guide UI: All static HTML entry shells contain synchronized guide hub and no stale placeholder", async () => {
  const shells = [
    "../index.html",
    "../rules/index.html",
    "../about/index.html",
    "../privacy/index.html",
    "../privacy-policy/index.html",
    "../contact/index.html",
    "../Games/index.html",
    "../Games/FiveWink/index.html",
    "../Games/Game2/index.html",
    "../Games/Game3/index.html"
  ];

  for (const shellPath of shells) {
    const html = await readFile(new URL(shellPath, import.meta.url), "utf8");

    // Must contain complete guide components
    assert.match(html, /id="guide-fivewink"/, `${shellPath} must contain #guide-fivewink`);
    assert.match(html, /id="guide-game2"/, `${shellPath} must contain #guide-game2`);
    assert.match(html, /id="guide-game3"/, `${shellPath} must contain #guide-game3`);
    assert.match(html, /id="pane-standard"/, `${shellPath} must contain standard pane`);
    assert.match(html, /id="pane-strict"/, `${shellPath} must contain strict pane`);
    assert.match(html, /id="pane-mindbender"/, `${shellPath} must contain mindbender pane`);
    assert.match(html, /id="pane-expert"/, `${shellPath} must contain expert pane`);
    assert.match(html, /id="pane-faq"/, `${shellPath} must contain faq pane`);

    // Must NOT contain obsolete placeholder copy
    assert.doesNotMatch(
      html,
      /General rules, solving tips, and gameplay instructions/i,
      `${shellPath} must not contain obsolete rules placeholder`
    );
    assert.doesNotMatch(
      html,
      /published here in an upcoming update/i,
      `${shellPath} must not contain obsolete rules placeholder`
    );
  }
});

test("Rules & Game Guide UI: Root-level guide-tab hashes resolve to rules route", () => {
  const guideHashes = [
    "strict",
    "mindbender",
    "expert",
    "faq",
    "standard",
    "fivewink-strict",
    "fivewink-mindbender",
    "fivewink-expert",
    "fivewink-faq",
    "rules-faq",
    "guide-faq",
    "guide",
    "fivewink",
    "guide-fivewink",
    "guide-game2",
    "guide-game3"
  ];

  for (const hash of guideHashes) {
    assert.equal(RULES_GUIDE_HASHES.has(hash), true, `${hash} must be in RULES_GUIDE_HASHES`);
    assert.equal(normalizeRoute(hash), "rules", `normalizeRoute("${hash}") must return "rules"`);
  }
});
