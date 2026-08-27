// Phase 3 browser verification for the explicit React migration entry.
// Requires the game and Worker development servers (React game on :5174,
// Worker on :8787). The default Lit entry is verified separately by
// npm run verify:layout.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { apiError, deferred } from "./fixtures/async-flows.mjs";
import { installDeterministicReadFixtures, leaderboardFixture } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.REACT_GAME_URL ?? process.env.GAME_URL ?? "http://127.0.0.1:5174";
const ARTIFACT_DIR = resolve(process.env.REACT_PHASE3_ARTIFACT_DIR ?? "/tmp/fishing-with-friends-phase3-react");
const SCREENSHOT_DIR = join(ARTIFACT_DIR, "screenshots");
const BASELINE_REPORT = process.env.PHASE0_BASELINE_REPORT ?? "/private/tmp/fishing-with-friends-phase0-baseline/browser-report.json";
const ORIGIN = new URL(BASE).origin;
const EXPECTED_API_PATHS = new Set([
  "/api/auth/dev",
  "/api/auth/telegram",
  "/api/me",
  "/api/game/state",
  "/api/game/encounters/active",
  "/api/game/friends",
  "/api/game/journal",
]);

const viewportScenarios = [
  { name: "iPhone portrait", mock: "ios", viewport: { width: 393, height: 852 }, expectedGap: 10 },
  { name: "Android portrait", mock: "android", viewport: { width: 412, height: 915 }, expectedGap: 10 },
  { name: "iPhone landscape", mock: "landscape", viewport: { width: 852, height: 393 }, expectedGap: 2 },
  { name: "short-height portrait", mock: "ios", viewport: { width: 393, height: 640 }, expectedGap: 10 },
];

const screenScenarios = [
  { id: "friends", label: "Friends", selector: '[data-testid="friends-screen"]', lastSelector: ".crew-row" },
  { id: "journal", label: "Journal", selector: '[data-testid="journal-screen"]', lastSelector: ".journal-card" },
];

const failures = [];
const checks = [];
const measurements = [];
const consoleErrors = [];
const expectedConsoleErrors = [];
const unexpectedApiPaths = [];
const unexpectedResponses = [];
const beforeByLabel = new Map();

function check(label, condition, detail) {
  const result = { label, passed: Boolean(condition), detail };
  checks.push(result);
  if (!condition) failures.push(`${label}: ${detail}`);
}

function recordMeasurement(label, value) {
  measurements.push({ label, value });
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for a browser fixture condition.`);
}

function attachPageDiagnostics(page, scenario, allowedErrorResponses = new Set(), allowedConsoleErrorPatterns = []) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (allowedConsoleErrorPatterns.some((pattern) => pattern.test(text))) expectedConsoleErrors.push(`${scenario}: ${text}`);
    else consoleErrors.push(`${scenario}: ${text}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${scenario}: ${String(error)}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === ORIGIN && url.pathname.startsWith("/api/") && !EXPECTED_API_PATHS.has(url.pathname)) {
      unexpectedApiPaths.push({ scenario, path: url.pathname, method: request.method() });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN || response.status() < 400) return;
    const key = `${url.pathname}:${response.status()}`;
    if (!allowedErrorResponses.has(key)) unexpectedResponses.push({ scenario, path: url.pathname, status: response.status() });
  });
}

async function createPage(browser, scenario, allowedErrorResponses = new Set(), allowedConsoleErrorPatterns = []) {
  const page = await browser.newPage({
    viewport: scenario.viewport ?? { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  attachPageDiagnostics(page, scenario.name ?? scenario, allowedErrorResponses, allowedConsoleErrorPatterns);
  return page;
}

async function openReactPage(page, mock = "ios") {
  await page.goto(`${BASE}/index.react.html?telegramMock=${mock}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="react-app-shell"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="lakes-screen"]', { timeout: 20_000 });
}

async function rectOf(page, selector, last = false) {
  const locator = page.locator(selector);
  const target = last ? locator.last() : locator.first();
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
}

async function navigateByTouch(page, label) {
  await page.getByRole("button", { name: label, exact: true }).tap();
}

function baselineValue(label) {
  return beforeByLabel.get(label);
}

function compareMeasurement(label, after) {
  const before = baselineValue(label);
  if (!before) {
    recordMeasurement(`${label} comparison`, { available: false });
    return;
  }
  const delta = {};
  for (const name of ["topbar", "firstControl", "tabbar", "lastContent"]) {
    delta[name] = {};
    for (const property of ["left", "right", "top", "bottom", "width", "height"]) {
      delta[name][property] = Number((after[name][property] - before[name][property]).toFixed(3));
    }
  }
  delta.gaps = {
    topbarToFirstControl: Number((after.gaps.topbarToFirstControl - before.gaps.topbarToFirstControl).toFixed(3)),
    lastContentToFixedChrome: Number((after.gaps.lastContentToFixedChrome - before.gaps.lastContentToFixedChrome).toFixed(3)),
  };
  delta.scrollRange = after.scrollRange - before.scrollRange;
  recordMeasurement(`${label} comparison`, { available: true, before, after, delta });
  for (const name of ["topbar", "firstControl", "tabbar", "lastContent"]) {
    for (const property of ["left", "right", "top", "bottom", "width", "height"]) {
      check(`${label}: ${name}.${property} matches Phase 0`, Math.abs(delta[name][property]) <= 2, `delta ${delta[name][property]}px`);
    }
  }
  check(`${label}: top-bar/first-control gap matches Phase 0`, Math.abs(delta.gaps.topbarToFirstControl) <= 2, `delta ${delta.gaps.topbarToFirstControl}px`);
  check(`${label}: last-content/fixed-chrome gap matches Phase 0`, Math.abs(delta.gaps.lastContentToFixedChrome) <= 2, `delta ${delta.gaps.lastContentToFixedChrome}px`);
  check(`${label}: scroll range matches Phase 0`, Math.abs(delta.scrollRange) <= 8, `delta ${delta.scrollRange}px`);
}

async function verifyScreenGeometry(page, scenario, screen) {
  const content = page.locator('[data-testid="app-content"]');
  await content.evaluate((element) => element.scrollTo(0, 0));
  await page.waitForTimeout(350);
  if (screen.id === "journal") {
    await page.locator('.fish-image[data-image-state="loaded"]').first().waitFor({ timeout: 15_000 });
  }

  const viewport = page.viewportSize();
  const topbar = await rectOf(page, ".app-topbar");
  const firstControl = await rectOf(page, ".dashboard-header");
  const tabbar = await rectOf(page, ".tabbar");
  const scrollRange = await content.evaluate((element) => element.scrollHeight - element.clientHeight);
  const horizontalOverflow = await content.evaluate((element) => element.scrollWidth - element.clientWidth);
  const heroGap = firstControl.top - topbar.bottom;
  await page.screenshot({ path: join(SCREENSHOT_DIR, `react-${scenario.name.toLowerCase().replaceAll(" ", "-")}-${screen.id}.png`) });

  await content.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.waitForTimeout(120);
  const scrollState = await content.evaluate((element) => ({ scrollRange: element.scrollHeight - element.clientHeight, scrollTop: element.scrollTop }));
  const lastContent = await rectOf(page, screen.lastSelector, true);
  const gapToTabbar = tabbar.top - lastContent.bottom;
  const geometry = {
    viewport,
    scrollRange,
    scrollState,
    topbar,
    firstControl,
    tabbar,
    lastContent,
    gaps: { topbarToFirstControl: heroGap, lastContentToFixedChrome: gapToTabbar },
    horizontalOverflow,
  };
  recordMeasurement(`${scenario.name} ${screen.label} baseline`, geometry);
  compareMeasurement(`${scenario.name} ${screen.label} baseline`, geometry);

  check(`${scenario.name} ${screen.label}: top bar clears first control`, heroGap >= -1, `gap ${heroGap.toFixed(1)}px`);
  check(`${scenario.name} ${screen.label}: tab bar stays inside viewport`, Boolean(viewport && tabbar.bottom <= viewport.height + 1), `tab bar bottom ${tabbar.bottom.toFixed(1)} vs viewport ${viewport?.height ?? 0}`);
  check(`${scenario.name} ${screen.label}: full-range scroll reaches the end`, scrollState.scrollTop >= scrollState.scrollRange - 1, JSON.stringify(scrollState));
  check(`${scenario.name} ${screen.label}: last content clears tab bar`, gapToTabbar >= -2, `last content bottom ${lastContent.bottom.toFixed(1)} vs tab bar top ${tabbar.top.toFixed(1)}`);
  check(`${scenario.name} ${screen.label}: no horizontal overflow`, horizontalOverflow <= 1, `${horizontalOverflow.toFixed(1)}px overflow`);
  check(`${scenario.name} ${screen.label}: content remains inside viewport`, lastContent.left >= 0 && lastContent.right <= (viewport?.width ?? 0) + 1, `last content ${lastContent.left.toFixed(1)}–${lastContent.right.toFixed(1)}`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `react-${scenario.name.toLowerCase().replaceAll(" ", "-")}-${screen.id}-scrolled.png`) });
}

async function verifyStyleIsolation(page, scenario) {
  await navigateByTouch(page, "Friends");
  await page.waitForSelector('[data-testid="friends-screen"]', { timeout: 15_000 });
  await page.locator('[data-testid="app-content"]').evaluate((element) => element.scrollTo(0, 0));
  const friendsBefore = await page.evaluate(() => {
    const header = document.querySelector(".friends-screen .dashboard-header");
    const computed = header ? getComputedStyle(header) : undefined;
    const board = document.querySelector(".friends-screen .crew-board");
    return {
      friends: document.querySelectorAll('[data-testid="friends-screen"]').length,
      journal: document.querySelectorAll('[data-testid="journal-screen"]').length,
      journalCards: document.querySelectorAll(".journal-card").length,
      journalControls: document.querySelectorAll(".journal-controls").length,
      crewBoardDisplay: board ? getComputedStyle(board).display : "missing",
      header: computed ? { display: computed.display, gap: computed.gap, paddingTop: computed.paddingTop, borderRadius: computed.borderRadius, backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow } : null,
    };
  });
  check(`${scenario.name}: Friends has no Journal selector leakage`, friendsBefore.friends === 1 && friendsBefore.journal === 0 && friendsBefore.journalCards === 0 && friendsBefore.journalControls === 0 && friendsBefore.crewBoardDisplay === "grid", JSON.stringify(friendsBefore));

  await navigateByTouch(page, "Journal");
  await page.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
  const journal = await page.evaluate(() => {
    const card = document.querySelector(".journal-card");
    const computed = card ? getComputedStyle(card) : undefined;
    return {
      friends: document.querySelectorAll('[data-testid="friends-screen"]').length,
      journal: document.querySelectorAll('[data-testid="journal-screen"]').length,
      crewBoard: document.querySelectorAll(".crew-board").length,
      journalCards: document.querySelectorAll(".journal-card").length,
      card: computed ? { display: computed.display, gap: computed.gap, paddingTop: computed.paddingTop, borderRadius: computed.borderRadius, backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow } : null,
    };
  });
  check(`${scenario.name}: Journal has no Friends selector leakage`, journal.friends === 0 && journal.journal === 1 && journal.crewBoard === 0 && journal.journalCards > 0 && journal.card?.display === "grid", JSON.stringify(journal));

  await navigateByTouch(page, "Friends");
  await page.waitForSelector('[data-testid="friends-screen"]', { timeout: 15_000 });
  const friendsAfter = await page.evaluate(() => {
    const header = document.querySelector(".friends-screen .dashboard-header");
    const computed = header ? getComputedStyle(header) : undefined;
    return {
      friends: document.querySelectorAll('[data-testid="friends-screen"]').length,
      journal: document.querySelectorAll('[data-testid="journal-screen"]').length,
      journalCards: document.querySelectorAll(".journal-card").length,
      crewBoard: document.querySelectorAll(".crew-board").length,
      header: computed ? { display: computed.display, gap: computed.gap, paddingTop: computed.paddingTop, borderRadius: computed.borderRadius, backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow } : null,
    };
  });
  check(`${scenario.name}: Friends styles are stable after Journal -> Friends`, JSON.stringify(friendsBefore.header) === JSON.stringify(friendsAfter.header), JSON.stringify({ before: friendsBefore.header, after: friendsAfter.header }));
  check(`${scenario.name}: reverse navigation leaves one screen`, friendsAfter.friends === 1 && friendsAfter.journal === 0 && friendsAfter.journalCards === 0 && friendsAfter.crewBoard === 1, JSON.stringify(friendsAfter));
}

async function verifyReadOnlyMatrix(browser) {
  for (const scenario of viewportScenarios) {
    const page = await createPage(browser, scenario);
    await installDeterministicReadFixtures(page);
    await openReactPage(page, scenario.mock);
    check(`${scenario.name}: one React root`, await page.locator("#react-root").count() === 1, "one #react-root");
    check(`${scenario.name}: no Lit application root`, await page.locator("game-app").count() === 0, "no game-app element");
    check(`${scenario.name}: at most one Phaser canvas`, await page.locator("#game-root canvas").count() <= 1, `${await page.locator("#game-root canvas").count()} canvas(es)`);

    await navigateByTouch(page, "Friends");
    await page.waitForSelector('[data-testid="friends-screen"]', { timeout: 15_000 });
    check(`${scenario.name} Friends: populated board renders`, await page.getByRole("heading", { name: "Catch board" }).count() === 1 && await page.getByRole("listitem").count() === 3, "leaderboard rows visible");
    check(`${scenario.name} Friends: active tab has accessible state`, await page.getByRole("button", { name: "Friends", exact: true }).getAttribute("aria-current") === "page", 'aria-current="page"');
    await verifyScreenGeometry(page, scenario, screenScenarios[0]);

    await navigateByTouch(page, "Journal");
    await page.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
    await page.locator('.fish-image[data-image-state="loaded"]').first().waitFor({ timeout: 15_000 });
    const filter = page.getByLabel("Show");
    await filter.focus();
    await filter.selectOption("undiscovered");
    check(`${scenario.name} Journal: keyboard-accessible filter changes content`, await page.getByText("Undiscovered species", { exact: true }).count() > 0 && await filter.inputValue() === "undiscovered", `filter ${await filter.inputValue()}`);
    await filter.selectOption("all");
    await verifyScreenGeometry(page, scenario, screenScenarios[1]);
    await verifyStyleIsolation(page, scenario);
    await page.close();
  }
}

async function verifyKeyboardFocusAndMedia(browser) {
  const scenario = { name: "keyboard and media", viewport: { width: 393, height: 852 } };
  const page = await createPage(browser, scenario);
  await installDeterministicReadFixtures(page);
  await openReactPage(page, "ios");
  const friendsTab = page.getByRole("button", { name: "Friends", exact: true });
  await friendsTab.focus();
  await friendsTab.press("Enter");
  await page.waitForSelector('[data-testid="friends-screen"]', { timeout: 15_000 });
  const focusStyle = await friendsTab.evaluate((element) => {
    const style = getComputedStyle(element);
    return { active: document.activeElement === element, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  check("keyboard tab activation preserves visible focus", focusStyle.active && focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px", JSON.stringify(focusStyle));
  await page.getByRole("button", { name: "Journal", exact: true }).focus();
  await page.getByRole("button", { name: "Journal", exact: true }).press("Enter");
  await page.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
  await page.getByLabel("Show").selectOption("discovered");
  check("keyboard filter activation exposes the selected value", await page.getByLabel("Show").inputValue() === "discovered", 'value="discovered"');
  check("keyboard controls expose the active tab", await page.getByRole("button", { name: "Journal", exact: true }).getAttribute("aria-current") === "page", 'aria-current="page"');
  await page.close();

  const mediaPage = await createPage(browser, { name: "reduced motion and forced colors", viewport: { width: 393, height: 852 } });
  await mediaPage.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await installDeterministicReadFixtures(mediaPage);
  await openReactPage(mediaPage, "ios");
  await navigateByTouch(mediaPage, "Journal");
  await mediaPage.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
  const mediaStyles = await mediaPage.evaluate(() => ({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
    animationName: getComputedStyle(document.querySelector(".journal-screen")).animationName,
    cardShadow: getComputedStyle(document.querySelector(".journal-card")).boxShadow,
  }));
  check("reduced-motion disables React screen transitions", mediaStyles.reducedMotion && mediaStyles.animationName === "none", JSON.stringify(mediaStyles));
  check("forced-colors removes decorative React card shadow", mediaStyles.forcedColors && mediaStyles.cardShadow === "none", JSON.stringify(mediaStyles));
  await mediaPage.close();
}

async function verifyFailedNavigationAndRetry(browser) {
  const scenario = { name: "failed navigation retry", viewport: { width: 393, height: 852 } };
  const page = await createPage(browser, scenario, new Set(["/api/game/friends:503"]), [/503/]);
  await installDeterministicReadFixtures(page);
  let attempts = 0;
  await page.route("**/api/game/friends", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillJson(route, apiError("The catch board is temporarily unavailable."), 503);
      return;
    }
    await fulfillJson(route, leaderboardFixture());
  });
  await openReactPage(page, "ios");
  await navigateByTouch(page, "Friends");
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  check("failed Friends navigation preserves the active screen", await page.getByRole("button", { name: "Lakes", exact: true }).getAttribute("aria-current") === "page", 'Lakes aria-current="page"');
  check("failed Friends navigation exposes an explicit retry", await page.getByTestId("retry-panel").count() === 1, "one retry panel");
  check("failed Friends navigation does not render the failed screen", await page.getByTestId("friends-screen").count() === 0, "Friends screen absent while retry is shown");
  await page.getByRole("button", { name: "Try again", exact: true }).focus();
  await page.getByRole("button", { name: "Try again", exact: true }).press("Enter");
  await page.waitForSelector('[data-testid="friends-screen"]', { timeout: 15_000 });
  check("user-driven Friends retry succeeds once", attempts === 2, `${attempts} friends requests`);
  await page.close();
}

async function verifyLatestNavigation(browser, staleStatus) {
  const scenario = { name: `latest navigation stale ${staleStatus}`, viewport: { width: 393, height: 852 } };
  const allowedErrors = staleStatus === 503 ? new Set(["/api/game/friends:503"]) : new Set();
  const page = await createPage(browser, scenario, allowedErrors, staleStatus === 503 ? [/503/] : []);
  await installDeterministicReadFixtures(page);
  const friendsGate = deferred();
  let friendsOutcome = "pending";
  let friendsAborted = false;
  let journalRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/game/journal") journalRequestCount += 1;
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/game/friends") friendsAborted = true;
  });
  await page.route("**/api/game/friends", async (route) => {
    try {
      await friendsGate.promise;
      await fulfillJson(route, staleStatus === 200 ? leaderboardFixture() : apiError("Stale Friends error."), staleStatus);
      friendsOutcome = "fulfilled";
    } catch {
      friendsOutcome = "aborted";
    }
  });
  await openReactPage(page, "ios");
  await navigateByTouch(page, "Friends");
  await page.getByTestId("screen-loading").waitFor({ state: "visible", timeout: 5_000 });
  await navigateByTouch(page, "Journal");
  await page.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
  friendsGate.release();
  await waitUntil(() => friendsOutcome !== "pending", 5_000);
  await page.waitForTimeout(100);
  check(`newer Journal navigation wins over stale ${staleStatus === 200 ? "success" : "error"}`, await page.getByTestId("journal-screen").count() === 1 && await page.getByTestId("friends-screen").count() === 0 && await page.getByTestId("retry-panel").count() === 0, `stale response ${friendsOutcome}`);
  check(`stale Friends ${staleStatus === 200 ? "success" : "error"} cannot replace Journal`, await page.getByRole("button", { name: "Journal", exact: true }).getAttribute("aria-current") === "page", `Journal aria-current; outcome ${friendsOutcome}`);
  check(`latest-wins abort is observed for stale ${staleStatus === 200 ? "success" : "error"}`, friendsAborted || friendsOutcome === "aborted", `requestfailed=${friendsAborted}; route=${friendsOutcome}`);
  const journalRequestsBeforeRepeat = journalRequestCount;
  await navigateByTouch(page, "Journal");
  await page.waitForTimeout(120);
  check("repeated active Journal tab does not duplicate the request", journalRequestCount === journalRequestsBeforeRepeat, `${journalRequestCount} Journal requests`);
  check("repeated active Journal tab does not duplicate the screen", await page.getByTestId("journal-screen").count() === 1, "one Journal screen remains");
  await page.close();
}

async function verifyImageResilience(browser) {
  const scenario = { name: "React image resilience", viewport: { width: 393, height: 852 } };
  const page = await createPage(browser, scenario, new Set(), [/503/, /ERR_FAILED/]);
  await installDeterministicReadFixtures(page);
  let imageApiAttempts = 0;
  let imageLoadAttempts = 0;
  await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
    imageApiAttempts += 1;
    if (imageApiAttempts === 1) {
      await fulfillJson(route, { error: "temporary image API outage" }, 503);
      return;
    }
    await fulfillJson(route, { query: { pages: [{ thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/fixture-fish.svg" } }] } });
  });
  await page.route("https://upload.wikimedia.org/**", async (route) => {
    imageLoadAttempts += 1;
    await route.abort("failed");
  });
  await openReactPage(page, "ios");
  await navigateByTouch(page, "Journal");
  await page.waitForSelector('[data-testid="journal-screen"]', { timeout: 15_000 });
  await page.locator('.fish-image[data-image-state="unavailable"]').first().waitFor({ timeout: 20_000 });
  check("React fish image API retries a transient failure", imageApiAttempts === 2, `${imageApiAttempts} image API attempts`);
  check("React fish image loader retries a failed image", imageLoadAttempts >= 2, `${imageLoadAttempts} external image attempts`);
  check("React fish image exposes an unavailable fallback", await page.locator('.fish-image[data-image-state="unavailable"] .fish-image-placeholder').first().textContent() === "Photo unavailable", "fallback text remains readable");
  await page.close();
}

async function loadBaseline() {
  try {
    const baseline = JSON.parse(await readFile(BASELINE_REPORT, "utf8"));
    for (const measurement of baseline.measurements ?? []) {
      if (measurement.label.endsWith("Friends baseline") || measurement.label.endsWith("Journal baseline")) {
        beforeByLabel.set(measurement.label, measurement.value);
      }
    }
  } catch {
    // A missing baseline does not prevent the Phase 3 checks, but is reported.
  }
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
await loadBaseline();
const browser = await chromium.launch();
try {
  await verifyReadOnlyMatrix(browser);
  await verifyKeyboardFocusAndMedia(browser);
  await verifyFailedNavigationAndRetry(browser);
  await verifyLatestNavigation(browser, 200);
  await verifyLatestNavigation(browser, 503);
  await verifyImageResilience(browser);
} finally {
  await browser.close();
}

  check("React browser run reports no page or unexpected console errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none");
check("React browser run requests only known API routes", unexpectedApiPaths.length === 0, JSON.stringify(unexpectedApiPaths));
check("React browser run has no unexpected same-origin failures", unexpectedResponses.length === 0, JSON.stringify(unexpectedResponses));

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  baselineReport: BASELINE_REPORT,
  baselineMeasurementsLoaded: beforeByLabel.size,
  viewportScenarios,
  checks,
  failures,
  measurements,
  consoleErrors,
  expectedConsoleErrors,
  unexpectedApiPaths,
  unexpectedResponses,
  screenshots: SCREENSHOT_DIR,
  intentionalVisualDifferences: "React replaces Lit Shadow DOM with ordinary DOM under the same Phase 0 tokens, class names, copy, and responsive rules. Geometry comparisons allow a 2px renderer/font tolerance; no design or copy difference is intended.",
};
await writeFile(join(ARTIFACT_DIR, "react-phase3-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
