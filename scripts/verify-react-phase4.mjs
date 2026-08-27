// Phase 4 browser verification for the explicit React migration entry.
// Requires the game and Worker development servers (React game on :5174,
// Worker on :8787). The default Lit entry remains covered by verify:layout.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { apiError } from "./fixtures/async-flows.mjs";
import {
  collectionFromState,
  installExternalFishFixtures,
  leaderboardFixture,
  normalizeGameState,
} from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.REACT_GAME_URL ?? "http://127.0.0.1:5174";
const ARTIFACT_DIR = resolve(process.env.REACT_PHASE4_ARTIFACT_DIR ?? "/tmp/fishing-with-friends-phase4-react");
const SCREENSHOT_DIR = join(ARTIFACT_DIR, "screenshots");
const BASELINE_REPORT = process.env.PHASE0_BASELINE_REPORT ?? "/private/tmp/fishing-with-friends-phase0-baseline/browser-report.json";
const ORIGIN = new URL(BASE).origin;

const viewportScenarios = [
  { name: "iPhone portrait", mock: "ios", viewport: { width: 393, height: 852 } },
  { name: "Android portrait", mock: "android", viewport: { width: 412, height: 915 } },
  { name: "iPhone landscape", mock: "landscape", viewport: { width: 852, height: 393 } },
  { name: "short-height portrait", mock: "ios", viewport: { width: 393, height: 640 } },
];

const failures = [];
const checks = [];
const measurements = [];
const requestCounts = {};
const requestCountsByScenario = new Map();
const consoleErrors = [];
const expectedResponses = [];
const unexpectedResponses = [];
const beforeByLabel = new Map();

function check(label, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail });
  if (!passed) failures.push(`${label}: ${detail}`);
}

function recordMeasurement(label, value) {
  measurements.push({ label, value });
}

function countKey(method, pathname) {
  return `${method} ${pathname}`;
}

function noteRequest(method, pathname) {
  const key = countKey(method, pathname);
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
}

function countsFor(scenario) {
  return requestCountsByScenario.get(scenario) ?? {};
}

function fulfilJson(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for a browser fixture condition.`);
}

function attachDiagnostics(page, scenario, allowedStatuses = new Set()) {
  const scenarioCounts = {};
  requestCountsByScenario.set(scenario, scenarioCounts);
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (allowedStatuses.size > 0 && message.text().includes("Failed to load resource")) return;
    consoleErrors.push(`${scenario}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${scenario}: ${String(error)}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === ORIGIN && url.pathname.startsWith("/api/")) {
      const key = countKey(request.method(), url.pathname);
      noteRequest(request.method(), url.pathname);
      scenarioCounts[key] = (scenarioCounts[key] ?? 0) + 1;
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN || response.status() < 400) return;
    const key = `${url.pathname}:${response.status()}`;
    if (allowedStatuses.has(key) || (allowedStatuses.has("SELL_503") && url.pathname.endsWith("/sell") && response.status() === 503)) expectedResponses.push(`${scenario}: ${key}`);
    else unexpectedResponses.push({ scenario, path: url.pathname, status: response.status() });
  });
}

function updatePurchasedState(state, input) {
  const item = [
    ...state.catalog.baits,
    ...state.catalog.lures,
    ...state.catalog.rods,
    ...state.catalog.boats,
  ].find((candidate) => candidate.id === input.itemId);
  if (!item) return state;
  const quantity = input.quantity ?? 1;
  const key = state.catalog.baits.some((candidate) => candidate.id === input.itemId)
    ? "baits"
    : state.catalog.lures.some((candidate) => candidate.id === input.itemId)
      ? "lures"
      : state.catalog.rods.some((candidate) => candidate.id === input.itemId)
        ? "rods"
        : "boats";
  const owned = state.inventory[key].find((entry) => entry.id === input.itemId);
  const inventory = owned
    ? { ...state.inventory, [key]: state.inventory[key].map((entry) => entry.id === input.itemId ? { ...entry, quantity: entry.quantity + quantity } : entry) }
    : { ...state.inventory, [key]: [...state.inventory[key], { id: input.itemId, quantity, durability: "maximumDurability" in item ? item.maximumDurability : null }] };
  return { ...state, coins: state.coins - item.priceCoins * quantity, inventory };
}

async function installPhase4Fixtures(page, options = {}) {
  const collectionCount = options.collectionCount ?? 3;
  const mode = options.mode ?? "success";
  let state;
  let collection;
  let purchaseCount = 0;
  let saleCount = 0;
  let stateRequestCount = 0;
  let collectionRequestCount = 0;
  let purchaseRelease = () => {};
  let saleRelease = () => {};
  let collectionRelease = () => {};
  const purchaseGate = new Promise((resolvePromise) => { purchaseRelease = resolvePromise; });
  const saleGate = new Promise((resolvePromise) => { saleRelease = resolvePromise; });
  const collectionGate = new Promise((resolvePromise) => { collectionRelease = resolvePromise; });

  await page.route("**/api/game/state", async (route) => {
    stateRequestCount += 1;
    if (!state) {
      const response = await route.fetch();
      state = normalizeGameState(await response.json());
      collection = collectionFromState(state, { count: collectionCount });
    }
    if ((mode === "route-resilience" && stateRequestCount === 2) || (mode === "purchase-reconcile-failure" && stateRequestCount === 3)) {
      await fulfilJson(route, apiError("The shop is temporarily unavailable."), 503);
      return;
    }
    await fulfilJson(route, state);
  });
  await page.route("**/api/game/encounters/active", async (route) => {
    await fulfilJson(route, { encounter: null, expired: false });
  });
  await page.route("**/api/game/collection", async (route) => {
    collectionRequestCount += 1;
    if (!collection) {
      await route.continue();
      return;
    }
    if (mode === "route-resilience" && collectionRequestCount === 1) await collectionGate;
    if (mode === "collection-load-failure" && collectionRequestCount === 1) {
      await fulfilJson(route, apiError("Your collection is temporarily unavailable."), 503);
      return;
    }
    await fulfilJson(route, collection);
  });
  await page.route("**/api/game/journal", async (route) => {
    if (!state) {
      await route.continue();
      return;
    }
    await fulfilJson(route, { entries: state.catalog.fish.map((species, index) => ({ speciesId: species.id, species, discovered: index === 0, timesCaught: index === 0 ? 2 : 0, heaviestWeightKg: index === 0 ? species.typicalWeightKg * 1.2 : null, longestLengthCm: index === 0 ? Math.round(species.typicalLengthCm * 1.1) : null, bestSaleValueCoins: index === 0 ? 184 : null, firstCaughtAt: index === 0 ? "2026-01-01T12:00:00.000Z" : null, lastCaughtAt: index === 0 ? "2026-01-01T12:00:00.000Z" : null })) });
  });
  await page.route("**/api/game/friends", async (route) => fulfilJson(route, leaderboardFixture()));
  await installExternalFishFixtures(page);

  await page.route("**/api/game/shop/purchase", async (route) => {
    purchaseCount += 1;
    const input = JSON.parse(route.request().postData() ?? "{}");
    if (mode === "slow-purchase" && purchaseCount === 1) await purchaseGate;
    if (mode === "purchase-401-once" && purchaseCount === 1) {
      await fulfilJson(route, apiError("The purchase session expired."), 401);
      return;
    }
    if (mode === "purchase-401-twice" && purchaseCount <= 2) {
      await fulfilJson(route, apiError("The purchase session is still expired."), 401);
      return;
    }
    if (mode === "purchase-503-once" && purchaseCount === 1) {
      await fulfilJson(route, apiError("The shop is temporarily unavailable."), 503);
      return;
    }
    state = updatePurchasedState(state, input);
    await fulfilJson(route, { coins: state.coins, inventory: state.inventory, activeEquipment: state.activeEquipment });
  });

  await page.route("**/api/game/catches/*/sell", async (route) => {
    saleCount += 1;
    const catchId = new URL(route.request().url()).pathname.split("/").at(-2);
    if (mode === "slow-sell-one" && saleCount === 1) await saleGate;
    if (mode === "sell-all-partial" && saleCount === 2) {
      await fulfilJson(route, apiError("The second sale timed out."), 503);
      return;
    }
    const sold = collection?.fish.find((specimen) => specimen.id === catchId);
    if (!sold) {
      await fulfilJson(route, apiError("That catch was already sold.", "ALREADY_SOLD"), 409);
      return;
    }
    collection = { fish: collection.fish.filter((specimen) => specimen.id !== catchId) };
    state = { ...state, coins: state.coins + sold.saleValueCoins };
    await fulfilJson(route, { coins: state.coins, catch: sold });
  });

  return {
    get state() { return state; },
    get collection() { return collection; },
    get purchaseCount() { return purchaseCount; },
    get saleCount() { return saleCount; },
    releasePurchase: purchaseRelease,
    releaseSale: saleRelease,
    releaseCollection: collectionRelease,
  };
}

async function openReactPage(page, mock) {
  await page.goto(`${BASE}/index.react.html?telegramMock=${mock}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="react-app-shell"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="lakes-screen"]', { timeout: 20_000 });
}

async function navigate(page, label) {
  await page.getByRole("button", { name: label, exact: true }).tap();
}

async function rectOf(page, selector, last = false) {
  const locator = page.locator(selector);
  return (last ? locator.last() : locator.first()).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
}

function compareToBaseline(label, after) {
  const before = beforeByLabel.get(label);
  if (!before) {
    recordMeasurement(`${label} comparison`, { available: false });
    return;
  }
  const delta = {};
  const landscapeShopAnimationTolerance = label === "iPhone landscape Shop baseline" ? 5 : 2;
  for (const name of ["topbar", "firstControl", "tabbar", "lastContent"]) {
    delta[name] = {};
    for (const property of ["left", "right", "top", "bottom", "width", "height"]) {
      delta[name][property] = Number((after[name][property] - before[name][property]).toFixed(3));
      const tolerance = name === "firstControl" && (property === "top" || property === "bottom") ? landscapeShopAnimationTolerance : 2;
      check(`${label}: ${name}.${property} matches Lit baseline`, Math.abs(delta[name][property]) <= tolerance, `delta ${delta[name][property]}px${tolerance > 2 ? " (intro-animation timing tolerance)" : ""}`);
    }
  }
  delta.gaps = {
    topbarToFirstControl: Number((after.gaps.topbarToFirstControl - before.gaps.topbarToFirstControl).toFixed(3)),
    lastContentToFixedChrome: Number((after.gaps.lastContentToFixedChrome - before.gaps.lastContentToFixedChrome).toFixed(3)),
  };
  delta.scrollRange = after.scrollRange - before.scrollRange;
  recordMeasurement(`${label} comparison`, { available: true, before, after, delta, note: landscapeShopAnimationTolerance > 2 ? "The Phase 0 landscape capture sampled the screen-pop animation; the static React gap remains 4px with zero overlap." : undefined });
  check(`${label}: top-bar/first-control gap matches Lit baseline`, Math.abs(delta.gaps.topbarToFirstControl) <= landscapeShopAnimationTolerance, `delta ${delta.gaps.topbarToFirstControl}px${landscapeShopAnimationTolerance > 2 ? " (intro-animation timing tolerance)" : ""}`);
  check(`${label}: last-content/fixed-chrome gap matches Lit baseline`, Math.abs(delta.gaps.lastContentToFixedChrome) <= 2, `delta ${delta.gaps.lastContentToFixedChrome}px`);
  check(`${label}: scroll range matches Lit baseline`, Math.abs(delta.scrollRange) <= 8, `delta ${delta.scrollRange}px`);
}

async function measureScreen(page, scenario, screenId) {
  const content = page.locator('[data-testid="app-content"]');
  await content.evaluate((element) => element.scrollTo(0, 0));
  await page.waitForTimeout(120);
  const viewport = page.viewportSize();
  const topbar = await rectOf(page, ".app-topbar");
  const firstControl = await rectOf(page, screenId === "shop" ? ".screen-hero" : ".dashboard-header");
  const tabbar = await rectOf(page, ".tabbar");
  const scrollRange = await content.evaluate((element) => element.scrollHeight - element.clientHeight);
  const horizontalOverflow = await content.evaluate((element) => element.scrollWidth - element.clientWidth);
  const heroGap = firstControl.top - topbar.bottom;
  const screenshotBase = `react-${scenario.name.toLowerCase().replaceAll(" ", "-")}-${screenId}`;
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${screenshotBase}.png`) });
  await content.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.waitForTimeout(120);
  const scrollState = await content.evaluate((element) => ({ scrollRange: element.scrollHeight - element.clientHeight, scrollTop: element.scrollTop }));
  const lastContent = await rectOf(page, screenId === "shop" ? ".shop-item" : ".collection-card", true);
  const gapToTabbar = tabbar.top - lastContent.bottom;
  const geometry = { viewport, scrollRange, scrollState, topbar, firstControl, tabbar, lastContent, gaps: { topbarToFirstControl: heroGap, lastContentToFixedChrome: gapToTabbar }, horizontalOverflow };
  const label = `${scenario.name} ${screenId === "shop" ? "Shop" : "Collection"} baseline`;
  recordMeasurement(label, geometry);
  compareToBaseline(label, geometry);
  check(`${label}: top bar clears first control`, heroGap >= -1, `gap ${heroGap.toFixed(1)}px`);
  check(`${label}: tab bar stays inside viewport`, Boolean(viewport && tabbar.bottom <= viewport.height + 1), `tab bar bottom ${tabbar.bottom.toFixed(1)} vs viewport ${viewport?.height ?? 0}`);
  check(`${label}: full-range scroll reaches the end`, scrollState.scrollTop >= scrollState.scrollRange - 1, JSON.stringify(scrollState));
  check(`${label}: last content clears tab bar`, gapToTabbar >= -2, `last content bottom ${lastContent.bottom.toFixed(1)} vs tab bar top ${tabbar.top.toFixed(1)}`);
  check(`${label}: no horizontal overflow`, horizontalOverflow <= 1, `${horizontalOverflow.toFixed(1)}px overflow`);
  check(`${label}: last content remains inside viewport`, lastContent.left >= 0 && lastContent.right <= (viewport?.width ?? 0) + 1, `last content ${lastContent.left.toFixed(1)}–${lastContent.right.toFixed(1)}`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${screenshotBase}-scrolled.png`) });
}

async function loadBaseline() {
  try {
    const baseline = JSON.parse(await readFile(BASELINE_REPORT, "utf8"));
    for (const measurement of baseline.measurements ?? []) {
      if (measurement.label.endsWith("Shop baseline") || measurement.label.endsWith("Collection baseline")) beforeByLabel.set(measurement.label, measurement.value);
    }
  } catch {
    // The React checks remain useful without the optional baseline artifact.
  }
}

async function verifyViewportMatrix(browser) {
  for (const scenario of viewportScenarios) {
    const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    attachDiagnostics(page, scenario.name);
    await installPhase4Fixtures(page, { collectionCount: 3 });
    await openReactPage(page, scenario.mock);
    await navigate(page, "Shop");
    await page.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
    check(`${scenario.name}: Shop renders item cards and quantity choices`, await page.locator(".shop-item").count() > 0 && await page.getByRole("button", { name: "×5", exact: true }).count() > 0, "shop cards and bait quantities visible");
    await measureScreen(page, scenario, "shop");
    await navigate(page, "Collection");
    await page.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
    check(`${scenario.name}: Collection renders specimen cards`, await page.locator(".collection-card").count() === 3, "three fixture specimens visible");
    const details = page.locator(".collection-species-info").first();
    await details.locator("summary").click();
    check(`${scenario.name}: collection exposes specimen notes and metadata`, await page.locator(".collection-species-notes").count() > 0 && await page.locator(".specimen-location").count() > 0 && await page.locator(".specimen-caught-date").count() > 0, "species notes, location, and date visible");
    await details.locator("summary").click();
    await page.locator('[data-testid="app-content"]').evaluate((element) => element.scrollTo(0, 0));
    const sellAll = page.locator(".collection-actions .secondary-action").first();
    await sellAll.click();
    const confirmation = page.getByRole("button", { name: /Confirm selling all/ });
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    const confirmationRect = await rectOf(page, ".collection-actions .is-confirming");
    const cancelRect = await rectOf(page, ".collection-cancel");
    const confirmationTabbar = await rectOf(page, ".tabbar");
    const confirmationBottom = Math.max(confirmationRect.bottom, cancelRect.bottom);
    recordMeasurement(`${scenario.name} Collection confirmation`, { confirmation: confirmationRect, cancel: cancelRect, tabbar: confirmationTabbar, gapToTabbar: confirmationTabbar.top - confirmationBottom });
    check(`${scenario.name}: Collection confirmation and cancel render`, await confirmation.count() === 1 && await cancel.count() === 1, "confirmation and cancel controls visible");
    check(`${scenario.name}: Collection confirmation clears fixed chrome`, confirmationBottom <= confirmationTabbar.top + 2 && confirmationRect.top >= 0, `confirmation bottom ${confirmationBottom.toFixed(1)} vs tabbar top ${confirmationTabbar.top.toFixed(1)}`);
    await cancel.click();
    check(`${scenario.name}: Collection confirmation cancels locally`, await page.locator(".collection-cancel").count() === 0 && await page.locator(".collection-actions .is-confirming").count() === 0, "confirmation cleared without mutation");
    await measureScreen(page, scenario, "collection");
    await page.close();
  }
}

async function verifyAccessibility(browser) {
  for (const scenario of viewportScenarios) {
    const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    attachDiagnostics(page, `${scenario.name} accessibility`);
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await installPhase4Fixtures(page, { collectionCount: 2 });
    await openReactPage(page, scenario.mock);
    await navigate(page, "Shop");
    await page.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
    const focusTarget = page.locator(".shop-tab").first();
    await page.keyboard.press("Tab");
    await focusTarget.focus();
    const focusStyle = await focusTarget.evaluate((element) => { const style = getComputedStyle(element); return { active: document.activeElement === element, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }; });
    check(`${scenario.name}: Phase 4 focus remains visible`, focusStyle.active && focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px", JSON.stringify(focusStyle));
    const shopMedia = await page.evaluate(() => ({ reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, forcedColors: window.matchMedia("(forced-colors: active)").matches, animationName: getComputedStyle(document.querySelector(".shop-screen")).animationName, cardShadow: getComputedStyle(document.querySelector(".shop-item")).boxShadow }));
    check(`${scenario.name}: reduced-motion and forced-colors styles hold`, shopMedia.reducedMotion && shopMedia.forcedColors && shopMedia.animationName === "none" && shopMedia.cardShadow === "none", JSON.stringify(shopMedia));
    await navigate(page, "Collection");
    await page.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
    const collectionMedia = await page.evaluate(() => ({ animationName: getComputedStyle(document.querySelector(".collection-screen")).animationName, cardShadow: getComputedStyle(document.querySelector(".collection-card")).boxShadow }));
    check(`${scenario.name}: Collection forced-colors card is flat`, collectionMedia.animationName === "none" && collectionMedia.cardShadow === "none", JSON.stringify(collectionMedia));
    await page.close();
  }
}

async function verifyPurchaseLocksAndRecovery(browser) {
  const slowPage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  attachDiagnostics(slowPage, "purchase duplicate", new Set());
  const slowFixture = await installPhase4Fixtures(slowPage, { mode: "slow-purchase" });
  await openReactPage(slowPage, "ios");
  await navigate(slowPage, "Shop");
  await slowPage.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
  const item = slowPage.locator(".shop-item").first();
  await item.getByRole("button", { name: "×5", exact: true }).tap();
  const buy = item.locator(".buy-btn");
  await buy.evaluate((element) => { element.click(); element.click(); });
  await waitUntil(async () => !(await buy.isEnabled()));
  check("rapid purchase invocation sends one Worker mutation", slowFixture.purchaseCount === 1, `${slowFixture.purchaseCount} purchase request`);
  check("purchase pending control is disabled and semantically disabled", !(await buy.isEnabled()) && await buy.getAttribute("aria-disabled") === "true", `enabled=${await buy.isEnabled()} aria-disabled=${await buy.getAttribute("aria-disabled")}`);
  await buy.focus();
  await slowPage.keyboard.press("Enter");
  check("keyboard activation while purchase is pending sends no duplicate", slowFixture.purchaseCount === 1, `${slowFixture.purchaseCount} purchase request after keyboard activation`);
  check("purchase leaves unrelated navigation usable", await slowPage.getByRole("button", { name: "Collection", exact: true }).isEnabled(), "Collection navigation remains enabled");
  slowFixture.releasePurchase();
  await slowPage.getByRole("status").waitFor({ state: "visible", timeoutMs: 15_000 });
  await waitUntil(async () => (await slowPage.getByRole("status").innerText()).includes("Purchased"));
  check("purchase lock releases both states in finally", await buy.isEnabled() && await buy.getAttribute("aria-disabled") === "false", `enabled=${await buy.isEnabled()} aria-disabled=${await buy.getAttribute("aria-disabled")}`);
  const slowCounts = countsFor("purchase duplicate");
  check("purchase reconciles authoritative game state", (slowCounts["GET /api/game/state"] ?? 0) >= 2, `${slowCounts["GET /api/game/state"] ?? 0} game-state reads in scenario`);
  await slowPage.close();

  const failurePage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  attachDiagnostics(failurePage, "purchase failure retry", new Set(["/api/game/shop/purchase:503"]));
  const failureFixture = await installPhase4Fixtures(failurePage, { mode: "purchase-503-once" });
  await openReactPage(failurePage, "ios");
  await navigate(failurePage, "Shop");
  await failurePage.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
  await failurePage.locator(".shop-item").first().locator(".buy-btn").click();
  await failurePage.getByRole("alert").waitFor({ state: "visible", timeoutMs: 15_000 });
  check("non-401 purchase failure exposes retry without replay", failureFixture.purchaseCount === 1 && await failurePage.getByRole("button", { name: "Retry purchase" }).count() === 1, `${failureFixture.purchaseCount} request before user retry`);
  await failurePage.getByRole("button", { name: "Retry purchase" }).click();
  await waitUntil(() => failureFixture.purchaseCount === 2);
  await waitUntil(async () => (await failurePage.getByRole("status").count()) > 0 && (await failurePage.getByRole("status").innerText()).includes("Purchased"));
  check("user-driven purchase retry succeeds once", await failurePage.getByRole("status").innerText().then((text) => text.includes("Purchased")), `${failureFixture.purchaseCount} purchase requests`);
  await failurePage.close();

  const reconciliationPage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  attachDiagnostics(reconciliationPage, "purchase reconciliation failure", new Set(["/api/game/state:503"]));
  const reconciliationFixture = await installPhase4Fixtures(reconciliationPage, { mode: "purchase-reconcile-failure" });
  await openReactPage(reconciliationPage, "ios");
  await navigate(reconciliationPage, "Shop");
  await reconciliationPage.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
  await waitUntil(async () => await reconciliationPage.getByRole("button", { name: "Shop", exact: true }).getAttribute("aria-current") === "page");
  await reconciliationPage.locator(".shop-item").first().locator(".buy-btn").click();
  await reconciliationPage.getByRole("button", { name: "Retry refresh" }).waitFor({ state: "visible", timeoutMs: 15_000 });
  check("successful purchase with failed reconciliation exposes refresh retry", reconciliationFixture.purchaseCount === 1, `${reconciliationFixture.purchaseCount} purchase request before refresh retry`);
  await reconciliationPage.getByRole("button", { name: "Retry refresh" }).click();
  await waitUntil(async () => (await reconciliationPage.getByRole("status").count()) > 0 && (await reconciliationPage.getByRole("status").innerText()).includes("Wallet and inventory"));
  check("purchase reconciliation retry does not replay the mutation", reconciliationFixture.purchaseCount === 1, `${reconciliationFixture.purchaseCount} purchase request after refresh retry`);
  await reconciliationPage.close();

  for (const recoveryMode of ["purchase-401-once", "purchase-401-twice"]) {
    const recoveryPage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    attachDiagnostics(recoveryPage, recoveryMode, new Set(["/api/game/shop/purchase:401"]));
    const recoveryFixture = await installPhase4Fixtures(recoveryPage, { mode: recoveryMode });
    await openReactPage(recoveryPage, "ios");
    await navigate(recoveryPage, "Shop");
    await recoveryPage.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
    await recoveryPage.locator(".shop-item").first().locator(".buy-btn").click();
    if (recoveryMode === "purchase-401-once") {
      await waitUntil(async () => (await recoveryPage.getByRole("status").count()) > 0 && (await recoveryPage.getByRole("status").innerText()).includes("Purchased"));
      const recoveryCounts = countsFor(recoveryMode);
      check("401 purchase uses one shared recovery and one retry", recoveryFixture.purchaseCount === 2 && (recoveryCounts["POST /api/auth/dev"] ?? 0) === 2, `${recoveryFixture.purchaseCount} purchase requests; ${recoveryCounts["POST /api/auth/dev"] ?? 0} auth requests including initial auth`);
    } else {
      await recoveryPage.getByRole("alert").waitFor({ state: "visible", timeoutMs: 15_000 });
      check("second 401 exposes retry without an automatic loop", recoveryFixture.purchaseCount === 2 && await recoveryPage.getByRole("button", { name: "Retry purchase" }).count() === 1, `${recoveryFixture.purchaseCount} purchase requests before retry`);
      await recoveryPage.getByRole("button", { name: "Retry purchase" }).click();
      await waitUntil(() => recoveryFixture.purchaseCount === 3);
      await waitUntil(async () => (await recoveryPage.getByRole("status").count()) > 0 && (await recoveryPage.getByRole("status").innerText()).includes("Purchased"));
      check("second-401 user retry succeeds", await recoveryPage.getByRole("status").innerText().then((text) => text.includes("Purchased")), `${recoveryFixture.purchaseCount} purchase requests after retry`);
    }
    await recoveryPage.close();
  }
}

async function verifySellOne(browser) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  attachDiagnostics(page, "sell-one duplicate");
  const fixture = await installPhase4Fixtures(page, { collectionCount: 2, mode: "slow-sell-one" });
  await openReactPage(page, "ios");
  await navigate(page, "Collection");
  await page.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
  const sell = page.locator(".collection-card").first().locator(".sell-action");
  await sell.evaluate((element) => { element.click(); element.click(); });
  await waitUntil(async () => !(await sell.isEnabled()));
  await waitUntil(() => fixture.saleCount === 1);
  check("rapid sell-one invocation sends one Worker mutation", fixture.saleCount === 1, `${fixture.saleCount} sale request`);
  check("sell-one pending state is native and semantic", !(await sell.isEnabled()) && await sell.getAttribute("aria-disabled") === "true", `enabled=${await sell.isEnabled()} aria-disabled=${await sell.getAttribute("aria-disabled")}`);
  await sell.focus();
  await page.keyboard.press("Enter");
  check("keyboard activation while sell-one is pending sends no duplicate", fixture.saleCount === 1, `${fixture.saleCount} sale request after keyboard activation`);
  fixture.releaseSale();
  await waitUntil(async () => (await page.getByRole("status").count()) > 0 && (await page.getByRole("status").innerText()).includes("Sold"));
  check("sell-one restores pending state in finally", await sell.isEnabled() && await sell.getAttribute("aria-disabled") === "false", `enabled=${await sell.isEnabled()} aria-disabled=${await sell.getAttribute("aria-disabled")}`);
  const counts = countsFor("sell-one duplicate");
  check("sell-one refreshes collection, wallet, and leaderboard", (counts["GET /api/game/collection"] ?? 0) === 3 && (counts["GET /api/game/state"] ?? 0) === 2 && (counts["GET /api/game/friends"] ?? 0) === 1, JSON.stringify({ collection: counts["GET /api/game/collection"] ?? 0, state: counts["GET /api/game/state"] ?? 0, friends: counts["GET /api/game/friends"] ?? 0 }));
  check("sell-one result reconciles the card list", await page.locator(".collection-card").count() === 1, `${await page.locator(".collection-card").count()} card remains`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "react-sell-one-result.png") });
  await page.close();
}

async function verifySellAllPartial(browser) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  attachDiagnostics(page, "sell-all partial", new Set(["SELL_503"]));
  const fixture = await installPhase4Fixtures(page, { collectionCount: 2, mode: "sell-all-partial" });
  await openReactPage(page, "ios");
  await navigate(page, "Collection");
  await page.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
  const sellAll = page.getByRole("button", { name: "Sell all 2 fish for 123 coins" });
  await sellAll.click();
  check("Sell All opens confirmation", await page.getByRole("button", { name: "Confirm selling all 2 fish for 123 coins" }).count() === 1 && await page.getByRole("button", { name: "Cancel" }).count() === 1, "confirm and cancel are visible");
  await page.screenshot({ path: join(SCREENSHOT_DIR, "react-sell-all-confirmation.png") });
  await page.getByRole("button", { name: "Cancel" }).click();
  check("Sell All cancel performs no mutation", fixture.saleCount === 0 && await page.getByRole("button", { name: "Sell all 2 fish for 123 coins" }).count() === 1, `${fixture.saleCount} sale requests after cancel`);
  await page.getByRole("button", { name: "Sell all 2 fish for 123 coins" }).click();
  const confirmation = page.getByRole("button", { name: "Confirm selling all 2 fish for 123 coins" });
  await confirmation.evaluate((element) => { element.click(); element.click(); });
  await waitUntil(() => fixture.saleCount === 2);
  await waitUntil(async () => (await page.getByRole("status").count()) > 0 && (await page.getByRole("status").innerText()).includes("Sold 1 of 2 fish"));
  const status = await page.locator('[data-testid="mutation-feedback"] > span').innerText();
  check("Sell All stops at the failed specimen", fixture.saleCount === 2, `${fixture.saleCount} sequential sale requests`);
  check("Sell All reports partial success and final reconciliation", status === "Sold 1 of 2 fish for 42 coins. The second sale timed out. Wallet and collection are up to date." && await page.locator(".collection-card").count() === 1, `${status}; ${await page.locator(".collection-card").count()} card remains`);
  const counts = countsFor("sell-all partial");
  check("Sell All refreshes all authoritative queries", (counts["GET /api/game/collection"] ?? 0) === 3 && (counts["GET /api/game/state"] ?? 0) === 2 && (counts["GET /api/game/friends"] ?? 0) === 1, JSON.stringify({ collection: counts["GET /api/game/collection"] ?? 0, state: counts["GET /api/game/state"] ?? 0, friends: counts["GET /api/game/friends"] ?? 0 }));
  await page.screenshot({ path: join(SCREENSHOT_DIR, "react-sell-all-partial-result.png") });
  await page.close();
}

async function verifyRouteResilience(browser) {
  for (const scenario of viewportScenarios) {
    const loadingPage = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    attachDiagnostics(loadingPage, `${scenario.name} route resilience`, new Set(["/api/game/state:503"]));
    const loadingFixture = await installPhase4Fixtures(loadingPage, { mode: "route-resilience" });
    await openReactPage(loadingPage, scenario.mock);
    await navigate(loadingPage, "Collection");
    await loadingPage.getByTestId("screen-loading").waitFor({ state: "visible", timeoutMs: 15_000 });
    check(`${scenario.name}: Collection loading state renders`, await loadingPage.getByText("Opening your collection…", { exact: true }).count() === 1, "collection loading panel visible");
    loadingFixture.releaseCollection();
    await loadingPage.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
    check(`${scenario.name}: Collection loading settles`, await loadingPage.locator(".collection-card").count() === 3, "collection rendered after loading");
    await navigate(loadingPage, "Shop");
    await loadingPage.getByRole("button", { name: "Try again", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    check(`${scenario.name}: Shop failure preserves the current screen`, await loadingPage.getByRole("button", { name: "Collection", exact: true }).getAttribute("aria-current") === "page", 'Collection aria-current="page"');
    check(`${scenario.name}: Shop failure exposes an explicit retry`, await loadingPage.getByTestId("retry-panel").count() === 1, "shop retry panel visible");
    await loadingPage.getByRole("button", { name: "Try again", exact: true }).click();
    await loadingPage.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
    check(`${scenario.name}: Shop retry succeeds`, await loadingPage.locator(".shop-item").count() > 0, "shop rendered after retry");
    await loadingPage.close();

    const failurePage = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    attachDiagnostics(failurePage, `${scenario.name} collection failure`, new Set(["/api/game/collection:503"]));
    await installPhase4Fixtures(failurePage, { mode: "collection-load-failure" });
    await openReactPage(failurePage, scenario.mock);
    await navigate(failurePage, "Collection");
    await failurePage.getByRole("button", { name: "Try again", exact: true }).waitFor({ state: "visible", timeoutMs: 15_000 });
    check(`${scenario.name}: Collection failure exposes an explicit retry`, await failurePage.getByTestId("retry-panel").count() === 1 && await failurePage.getByRole("button", { name: "Lakes", exact: true }).getAttribute("aria-current") === "page", "collection retry panel preserves Lakes");
    await failurePage.getByRole("button", { name: "Try again", exact: true }).click();
    await failurePage.waitForSelector('[data-testid="collection-screen"]', { timeout: 15_000 });
    check(`${scenario.name}: Collection retry succeeds`, await failurePage.locator(".collection-card").count() === 3, "collection rendered after retry");
    await failurePage.close();
  }
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
await loadBaseline();
const browser = await chromium.launch();
try {
  await verifyViewportMatrix(browser);
  await verifyRouteResilience(browser);
  await verifyAccessibility(browser);
  await verifyPurchaseLocksAndRecovery(browser);
  await verifySellOne(browser);
  await verifySellAllPartial(browser);
} finally {
  await browser.close();
}

check("Phase 4 browser run reports no unexpected console errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none");
check("Phase 4 browser run reports no unexpected same-origin failures", unexpectedResponses.length === 0, JSON.stringify(unexpectedResponses));

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  baselineReport: BASELINE_REPORT,
  baselineMeasurementsLoaded: beforeByLabel.size,
  viewportScenarios,
  checks,
  failures,
  measurements,
  requestCounts,
  consoleErrors,
  expectedResponses,
  unexpectedResponses,
  requestCountsByScenario: Object.fromEntries(requestCountsByScenario.entries()),
  screenshots: SCREENSHOT_DIR,
  intentionalVisualDifferences: "React uses ordinary DOM with the Phase 0 class names, tokens, copy, and feature CSS moved from Lit static styles. Geometry comparisons allow a 2px renderer/font tolerance; the iPhone landscape Shop first-control comparison also allows 5px because the Phase 0 capture sampled its screen-pop animation; the static React gap is 4px with zero overlap. No design or copy difference is intended.",
};
await writeFile(join(ARTIFACT_DIR, "react-phase4-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
