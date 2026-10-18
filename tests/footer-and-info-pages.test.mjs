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

test("page shell layout: vertical height consistency and sticky footer structure in shared CSS", async () => {
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");

  // Body must have full viewport min-height and flex-column layout
  assert.match(css, /body\{[^}]*min-height:100vh[^}]*\}/);
  assert.match(css, /body\{[^}]*min-height:100dvh[^}]*\}/);
  assert.match(css, /body\{[^}]*display:flex[^}]*\}/);
  assert.match(css, /body\{[^}]*flex-direction:column[^}]*\}/);

  // Main must expand to fill remaining vertical space
  assert.match(css, /main\{[^}]*flex:1 0 auto[^}]*\}/);
  assert.match(css, /main\{[^}]*display:flex[^}]*\}/);
  assert.match(css, /main\{[^}]*flex-direction:column[^}]*\}/);

  // Active view must also be a flexible column
  assert.match(css, /\.view\.active\{[^}]*display:flex[^}]*\}/);
  assert.match(css, /\.view\.active\{[^}]*flex-direction:column[^}]*\}/);
  assert.match(css, /\.view\.active\{[^}]*flex:1 0 auto[^}]*\}/);

  // page-shell must expand as a flex column with full responsive width matching main content
  assert.match(css, /\.page-shell\{[^}]*display:flex[^}]*\}/);
  assert.match(css, /\.page-shell\{[^}]*flex-direction:column[^}]*\}/);
  assert.match(css, /\.page-shell\{[^}]*flex:1 0 auto[^}]*\}/);
  assert.match(css, /\.page-shell\{[^}]*width:100%[^}]*\}/);
  assert.doesNotMatch(css, /\.page-shell\{[^}]*max-width:820px/);
});

test("footer navigation: responsive mobile wrapping consistency across informational pages", async () => {
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");

  // Desktop footer navigation structure
  assert.match(css, /\.site-footer\{[^}]*background:#fff[^}]*\}/);
  assert.match(css, /\.footer-nav\{[^}]*display:flex[^}]*\}/);
  assert.match(css, /\.footer-link\{[^}]*min-height:44px[^}]*\}/);
  assert.match(css, /\.footer-link\[aria-current="page"\]\{[^}]*font-weight:700[^}]*\}/);

  // Tablet/mobile media query adjustments to prevent awkward wrapping and ensure horizontal centering
  assert.match(css, /\.footer-inner\{[^}]*align-items:center/);
  assert.match(css, /\.footer-inner\{[^}]*text-align:center/);
  assert.match(css, /\.footer-brand\{[^}]*text-align:center/);
  assert.match(css, /\.footer-nav\{[^}]*justify-content:center/);
  assert.match(css, /\.footer-nav\{[^}]*gap:4px 6px/);
  assert.match(css, /\.footer-link\{[^}]*padding:8px 4px/);
  assert.match(css, /\.footer-sep\{[^}]*display:inline-flex/);

  // Compact mobile media query for 360px and 320px viewports
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /\.footer-nav\{[^}]*gap:2px 4px/);
  assert.match(css, /\.footer-link\{[^}]*padding:6px 3px/);
});
