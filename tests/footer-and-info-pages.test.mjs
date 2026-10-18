import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getPublicSiteRoot,
  getGamesUrl,
  getGameUrl,
  getAboutUrl,
  getRulesUrl,
  getPrivacyUrl,
  getContactUrl,
  normalizeRoute,
  getRouteUrl,
  getFooterHtml,
  DEFAULT_ROUTE,
  PRIMARY_ROUTES,
  GAME_ROUTES,
  ACCOUNT_ROUTES,
  INFO_ROUTES,
  ROUTES
} from "../js/app.js";

test("footer & info routing: URL generation and normalization helpers", () => {
  const siteRoot = getPublicSiteRoot();

  // Info page URL helpers
  assert.equal(getAboutUrl(), siteRoot + "about/");
  assert.equal(getRulesUrl(), siteRoot + "rules/");
  assert.equal(getPrivacyUrl(), siteRoot + "privacy/");
  assert.equal(getContactUrl(), siteRoot + "contact/");

  // Normalization
  assert.equal(normalizeRoute("about"), "about");
  assert.equal(normalizeRoute("About"), "about");
  assert.equal(normalizeRoute("rules"), "rules");
  assert.equal(normalizeRoute("Rules"), "rules");
  assert.equal(normalizeRoute("privacy"), "privacy");
  assert.equal(normalizeRoute("Privacy Policy"), "privacy");
  assert.equal(normalizeRoute("privacy-policy"), "privacy");
  assert.equal(normalizeRoute("contact"), "contact");
  assert.equal(normalizeRoute("Contact"), "contact");

  // Route URL generation
  assert.equal(getRouteUrl("about"), siteRoot + "about/");
  assert.equal(getRouteUrl("rules"), siteRoot + "rules/");
  assert.equal(getRouteUrl("privacy"), siteRoot + "privacy/");
  assert.equal(getRouteUrl("privacy-policy"), siteRoot + "privacy/");
  assert.equal(getRouteUrl("contact"), siteRoot + "contact/");

  // Route sets
  assert.equal(INFO_ROUTES.has("about"), true);
  assert.equal(INFO_ROUTES.has("rules"), true);
  assert.equal(INFO_ROUTES.has("privacy"), true);
  assert.equal(INFO_ROUTES.has("contact"), true);
  assert.equal(ROUTES.has("about"), true);
  assert.equal(ROUTES.has("rules"), true);
  assert.equal(ROUTES.has("privacy"), true);
  assert.equal(ROUTES.has("contact"), true);
});

test("footer: getFooterHtml generates semantic markup in exact required order", () => {
  const siteRoot = getPublicSiteRoot();
  const footerHtml = getFooterHtml(siteRoot);

  // Footer shell
  assert.match(footerHtml, /class="site-footer"|class="footer-inner"/);
  assert.match(footerHtml, /aria-label="Footer navigation"/);

  // Exact order of four links: About -> Rules -> Privacy Policy -> Contact
  const aboutIdx = footerHtml.indexOf(">About</a>");
  const rulesIdx = footerHtml.indexOf(">Rules</a>");
  const privacyIdx = footerHtml.indexOf(">Privacy Policy</a>");
  const contactIdx = footerHtml.indexOf(">Contact</a>");

  assert.ok(aboutIdx !== -1, "About link must be present");
  assert.ok(rulesIdx !== -1, "Rules link must be present");
  assert.ok(privacyIdx !== -1, "Privacy Policy link must be present");
  assert.ok(contactIdx !== -1, "Contact link must be present");

  assert.ok(aboutIdx < rulesIdx, "About must precede Rules");
  assert.ok(rulesIdx < privacyIdx, "Rules must precede Privacy Policy");
  assert.ok(privacyIdx < contactIdx, "Privacy Policy must precede Contact");

  // No placeholder href="#" links
  assert.doesNotMatch(footerHtml, /href="#"/);

  // Accessible middle dot separators with aria-hidden
  assert.match(footerHtml, /aria-hidden="true"[^>]*>·<\/span>/);
});

test("footer & info pages: static HTML entry points exist for direct navigation and refresh", async () => {
  const aboutHtml = await readFile(new URL("../about/index.html", import.meta.url), "utf8");
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");
  const privacyHtml = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
  const contactHtml = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
  const privacyPolicyHtml = await readFile(new URL("../privacy-policy/index.html", import.meta.url), "utf8");

  // Verify page titles
  assert.match(aboutHtml, /<title>About — EmniFun<\/title>/);
  assert.match(rulesHtml, /<title>Rules — EmniFun<\/title>/);
  assert.match(privacyHtml, /<title>Privacy Policy — EmniFun<\/title>/);
  assert.match(contactHtml, /<title>Contact — EmniFun<\/title>/);
  assert.match(privacyPolicyHtml, /<title>Privacy Policy — EmniFun<\/title>/);

  // Verify headings
  assert.match(aboutHtml, /<h1[^>]*>About EmniFun<\/h1>/);
  assert.match(rulesHtml, /<h1[^>]*>Game Rules<\/h1>/);
  assert.match(privacyHtml, /<h1[^>]*>Privacy Policy<\/h1>/);
  assert.match(contactHtml, /<h1[^>]*>Contact<\/h1>/);

  // Verify stylesheet and script relative paths
  for (const page of [aboutHtml, rulesHtml, privacyHtml, contactHtml]) {
    assert.match(page, /<link rel="stylesheet" href="\.\.\/css\/style\.css">/);
    assert.match(page, /<script type="module" src="\.\.\/js\/app\.js"><\/script>/);
    assert.match(page, /<header class="site-header">/);
    assert.match(page, /id="primary-navigation"/);
    assert.match(page, /class="site-footer"/);
    assert.match(page, /back-link/);
  }

  // Verify privacy-policy alias canonical targets /privacy/
  assert.match(privacyPolicyHtml, /<link rel="canonical" href="\.\.\/privacy\/">/);
});

test("footer consistency: all public-facing pages contain the website footer in exact order", async () => {
  const pages = [
    { name: "index.html", path: "../index.html", prefix: "./" },
    { name: "Games/index.html", path: "../Games/index.html", prefix: "../" },
    { name: "Games/FiveWink/index.html", path: "../Games/FiveWink/index.html", prefix: "../../" },
    { name: "Games/Game2/index.html", path: "../Games/Game2/index.html", prefix: "../../" },
    { name: "Games/Game3/index.html", path: "../Games/Game3/index.html", prefix: "../../" },
    { name: "about/index.html", path: "../about/index.html", prefix: "../" },
    { name: "rules/index.html", path: "../rules/index.html", prefix: "../" },
    { name: "privacy/index.html", path: "../privacy/index.html", prefix: "../" },
    { name: "contact/index.html", path: "../contact/index.html", prefix: "../" }
  ];

  for (const { name, path, prefix } of pages) {
    const content = await readFile(new URL(path, import.meta.url), "utf8");

    assert.match(content, /class="site-footer"/, `${name} must include site-footer`);
    assert.match(content, /aria-label="Footer navigation"/, `${name} must include accessible footer nav`);

    const aboutIdx = content.indexOf(">About</a>");
    const rulesIdx = content.indexOf(">Rules</a>");
    const privacyIdx = content.indexOf(">Privacy Policy</a>");
    const contactIdx = content.indexOf(">Contact</a>");

    assert.ok(aboutIdx !== -1, `${name} must include About link`);
    assert.ok(rulesIdx !== -1, `${name} must include Rules link`);
    assert.ok(privacyIdx !== -1, `${name} must include Privacy Policy link`);
    assert.ok(contactIdx !== -1, `${name} must include Contact link`);

    assert.ok(aboutIdx < rulesIdx, `${name}: About must precede Rules`);
    assert.ok(rulesIdx < privacyIdx, `${name}: Rules must precede Privacy Policy`);
    assert.ok(privacyIdx < contactIdx, `${name}: Privacy Policy must precede Contact`);

    // Verify no href="#" in footer
    const footerSnippet = content.substring(content.indexOf('class="site-footer"'));
    assert.doesNotMatch(footerSnippet, /href="#"/, `${name} footer must not contain href="#"`);
  }
});

test("placeholder content integrity: neutral phrasing and scope protection", async () => {
  const aboutHtml = await readFile(new URL("../about/index.html", import.meta.url), "utf8");
  const rulesHtml = await readFile(new URL("../rules/index.html", import.meta.url), "utf8");
  const privacyHtml = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
  const contactHtml = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");

  // Privacy Policy: must be pending review/publication, no invented legal promises
  assert.match(privacyHtml, /pending review and publication/i);
  assert.doesNotMatch(privacyHtml, /GDPR|CCPA|data retention for \d+|we will never sell your data/i);

  // Contact: must be pending addition, no invented email or contact form
  assert.match(contactHtml, /added here in a future update|will be added here/i);
  assert.doesNotMatch(contactHtml, /@emnifun\.com|<form/i);

  // Rules: must mention in-game mode selector option for FiveWink
  assert.match(rulesHtml, /mode selector/i);
});
