// Phase 5 browser verification for the React lakes entry.
// This covers the full lakes setup lifecycle and deliberately stops before
// result screens, which remain a later migration phase.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { apiError } from "./fixtures/async-flows.mjs";
import { normalizeGameState } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.REACT_GAME_URL ?? "http://127.0.0.1:5174";
const ARTIFACT_DIR = resolve(process.env.REACT_PHASE5_ARTIFACT_DIR ?? "/tmp/fishing-with-friends-phase5-react");
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
const screenshots = [];
const consoleErrors = [];
const unexpectedResponses = [];
const requestCounts = {};
const baselineMeasurements = new Map();

function check(label, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail });
  if (!passed) failures.push(`${label}: ${detail}`);
}

function countKey(method, pathname) {
  return `${method} ${pathname}`;
}

function countRequest(counts, method, pathname) {
  const key = countKey(method, pathname);
  counts[key] = (counts[key] ?? 0) + 1;
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for a Phase 5 browser fixture condition.`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addSelectableEquipment(state) {
  const next = clone(state);
  const secondRod = next.catalog.rods[1];
  const secondLure = next.catalog.lures[1];
  const secondBait = next.catalog.baits[1];
  if (secondRod && !next.inventory.rods.some((item) => item.id === secondRod.id)) {
    next.inventory.rods = [...next.inventory.rods, { id: secondRod.id, quantity: 1, durability: null }];
  }
  if (secondLure && !next.inventory.lures.some((item) => item.id === secondLure.id)) {
    next.inventory.lures = [...next.inventory.lures, { id: secondLure.id, quantity: 1, durability: secondLure.maximumDurability }];
  }
  if (secondBait && !next.inventory.baits.some((item) => item.id === secondBait.id)) {
    next.inventory.baits = [...next.inventory.baits, { id: secondBait.id, quantity: 3, durability: null }];
  }
  return next;
}

function makeRecoveryState(state) {
  const next = clone(state);
  const worm = next.catalog.baits.find((item) => item.id === "worm") ?? next.catalog.baits[0];
  const spinner = next.catalog.lures[0];
  next.coins = Math.max(0, (worm?.priceCoins ?? 8) - 1);
  next.activeEquipment = { ...next.activeEquipment, baitId: worm?.id ?? next.activeEquipment.baitId, lureId: spinner?.id ?? next.activeEquipment.lureId };
  next.inventory.baits = next.inventory.baits.map((item) => ({ ...item, quantity: 0 }));
  if (worm && !next.inventory.baits.some((item) => item.id === worm.id)) next.inventory.baits.push({ id: worm.id, quantity: 0, durability: null });
  next.inventory.lures = next.inventory.lures.map((item) => ({ ...item, quantity: 0, durability: 0 }));
  if (spinner && !next.inventory.lures.some((item) => item.id === spinner.id)) next.inventory.lures.push({ id: spinner.id, quantity: 0, durability: 0 });
  return next;
}

function encounterForState(state, input = {}) {
  const location = state?.locations.find((candidate) => candidate.id === input.locationId) ?? state?.locations.find((candidate) => candidate.unlocked) ?? state?.locations[0];
  const baitId = input.baitId ?? state?.activeEquipment.baitId;
  const species = state?.catalog.fish.find((candidate) => location?.fishIds.includes(candidate.id) && candidate.acceptedBaitIds.includes(baitId)) ?? state?.catalog.fish[0];
  return {
    encounterId: `phase5-encounter-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    difficultySeed: 2187,
    locationId: location?.id ?? "willow-pond",
    locationName: location?.name ?? "Willow Pond",
    species,
    miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0.2, catchMeterLossRate: 0.1, durationSeconds: 5 },
    rodRiskBand: "low",
    expiresAt: "2099-01-01T12:05:00.000Z",
  };
}

function consumeCast(state, input) {
  const next = clone(state);
  next.inventory.baits = next.inventory.baits.map((item) => item.id === input.baitId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item);
  next.inventory.lures = next.inventory.lures.map((item) => item.id === input.lureId ? { ...item, durability: Math.max(0, (item.durability ?? 0) - 1) } : item);
  return next;
}

function updateEquipment(state, input) {
  const next = clone(state);
  next.activeEquipment = { ...next.activeEquipment, ...Object.fromEntries(Object.entries(input).filter(([key]) => key.endsWith("Id"))) };
  return next;
}

function recoverTackle(state) {
  const next = clone(state);
  const worm = next.catalog.baits.find((item) => item.id === "worm") ?? next.catalog.baits[0];
  const spinner = next.catalog.lures[0];
  next.activeEquipment = { ...next.activeEquipment, baitId: worm?.id ?? next.activeEquipment.baitId, lureId: spinner?.id ?? next.activeEquipment.lureId };
  next.inventory.baits = next.inventory.baits.map((item) => item.id === next.activeEquipment.baitId ? { ...item, quantity: 5 } : item);
  next.inventory.lures = next.inventory.lures.map((item) => item.id === next.activeEquipment.lureId ? { ...item, quantity: 1, durability: spinner?.maximumDurability ?? 10 } : item);
  return next;
}

function attachDiagnostics(page, label, fixture, allowedResponses = new Set()) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Chromium reports deliberately mocked 401/503 fetches as resource errors.
    // The response listener below still fails the run for any unapproved error.
    if (message.text().includes("Failed to load resource") && /status of (401|503)/.test(message.text())) return;
    consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${label}: ${String(error)}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === ORIGIN && url.pathname.startsWith("/api/")) countRequest(fixture.counts, request.method(), url.pathname);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN || response.status() < 400) return;
    const key = `${url.pathname}:${response.status()}`;
    if (!allowedResponses.has(key)) unexpectedResponses.push({ label, path: url.pathname, status: response.status() });
  });
}

async function installPhase5Fixtures(page, options = {}) {
  const fixture = {
    counts: {},
    state: undefined,
    startCount: 0,
    selectCount: 0,
    recoveryCount: 0,
    lastStartInput: undefined,
    releaseStart: () => {},
    releaseSelect: () => {},
    releaseRecovery: () => {},
  };
  const startMode = options.startMode ?? "success";
  const selectMode = options.selectMode ?? "success";
  const recoveryMode = options.recoveryMode ?? "success";
  let releaseStateGate = () => {};
  const stateGate = new Promise((resolvePromise) => { releaseStateGate = resolvePromise; });
  let resolveStateReady = () => {};
  const stateReady = new Promise((resolvePromise) => { resolveStateReady = resolvePromise; });
  const startGate = new Promise((resolvePromise) => { fixture.releaseStart = resolvePromise; });
  const selectGate = new Promise((resolvePromise) => { fixture.releaseSelect = resolvePromise; });
  const recoveryGate = new Promise((resolvePromise) => { fixture.releaseRecovery = resolvePromise; });

  await page.route("**/api/game/state", async (route) => {
    if (!fixture.state) {
      const response = await route.fetch();
      fixture.state = addSelectableEquipment(normalizeGameState(await response.json()));
      if (options.stateVariant === "recovery") fixture.state = makeRecoveryState(fixture.state);
      resolveStateReady();
    }
    const requestNumber = fixture.counts["GET /api/game/state"] ?? 0;
    if (options.slowShopState && requestNumber >= 2) await stateGate;
    await fulfillJson(route, fixture.state);
  });

  await page.route("**/api/game/encounters/active", async (route) => {
    await stateReady;
    const afterCast = fixture.startCount > 0;
    const activeMode = afterCast ? options.activeAfterCast : options.initialActive;
    if (activeMode === "live") {
      await fulfillJson(route, { encounter: encounterForState(fixture.state), expired: false });
      return;
    }
    if (activeMode === "expired") {
      await fulfillJson(route, { encounter: null, expired: true });
      return;
    }
    await fulfillJson(route, { encounter: null, expired: false });
  });

  await page.route("**/api/game/equipment/select", async (route) => {
    fixture.selectCount += 1;
    const input = JSON.parse(route.request().postData() ?? "{}");
    if (selectMode === "slow" && fixture.selectCount === 1) await selectGate;
    if (selectMode === "401-once" && fixture.selectCount === 1) {
      await fulfillJson(route, apiError("The equipment session expired."), 401);
      return;
    }
    if (selectMode === "failure" && fixture.selectCount === 1) {
      await fulfillJson(route, apiError("Equipment service unavailable."), 503);
      return;
    }
    fixture.state = updateEquipment(fixture.state, input);
    await fulfillJson(route, { activeEquipment: fixture.state.activeEquipment, inventory: fixture.state.inventory });
  });

  await page.route("**/api/game/recovery/dig-worms", async (route) => {
    fixture.recoveryCount += 1;
    if (recoveryMode === "slow" && fixture.recoveryCount === 1) await recoveryGate;
    if (recoveryMode === "failure" && fixture.recoveryCount === 1) {
      await fulfillJson(route, apiError("Recovery service unavailable."), 503);
      return;
    }
    fixture.state = recoverTackle(fixture.state);
    await fulfillJson(route, { wormsGranted: 5, lureRestored: true, coins: fixture.state.coins });
  });

  await page.route("**/api/game/encounters", async (route) => {
    fixture.startCount += 1;
    fixture.lastStartInput = JSON.parse(route.request().postData() ?? "{}");
    if (startMode === "slow" && fixture.startCount === 1) await startGate;
    if (startMode === "401-once" && fixture.startCount === 1) {
      await fulfillJson(route, apiError("The cast session expired."), 401);
      return;
    }
    if (startMode === "401-twice" && fixture.startCount <= 2) {
      await fulfillJson(route, apiError("The cast session is still expired."), 401);
      return;
    }
    if (startMode === "failure") {
      await fulfillJson(route, apiError("The cast was not accepted."), 503);
      return;
    }
    if (startMode === "ambiguous" || startMode === "expired") {
      await fulfillJson(route, apiError(startMode === "expired" ? "The encounter expired before confirmation." : "The cast request timed out."), 503);
      return;
    }
    fixture.state = consumeCast(fixture.state, fixture.lastStartInput);
    try {
      await fulfillJson(route, encounterForState(fixture.state, fixture.lastStartInput));
    } catch (error) {
      if (route.request().failure()?.errorText !== "net::ERR_ABORTED") throw error;
    }
  });

  return { fixture, releaseStateGate };
}

async function openReactPage(page, mock) {
  await page.goto(`${BASE}/index.react.html?telegramMock=${mock}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="react-app-shell"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="lakes-screen"]', { timeout: 20_000 });
}

async function rectOf(page, selector, last = false) {
  const locator = page.locator(selector);
  return (last ? locator.last() : locator.first()).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
}

async function measureLakes(page, scenario) {
  const content = page.locator('[data-testid="app-content"]');
  await content.evaluate((element) => element.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const viewport = page.viewportSize();
  const topbar = await rectOf(page, ".app-topbar");
  const hero = await rectOf(page, ".screen-hero");
  const dock = await rectOf(page, ".gear-dock");
  const carousel = await rectOf(page, ".locations-list");
  const castBar = await rectOf(page, ".cast-bar");
  const tabbar = await rectOf(page, ".tabbar");
  const scrollRange = await content.evaluate((element) => element.scrollHeight - element.clientHeight);
  const horizontalOverflow = await content.evaluate((element) => element.scrollWidth - element.clientWidth);
  const horizontalCarouselRange = await page.locator(".locations-list").evaluate((element) => element.scrollWidth - element.clientWidth);
  const firstGap = hero.top - topbar.bottom;
  const castGap = tabbar.top - castBar.bottom;
  const screenshotName = `react-${scenario.name.toLowerCase().replaceAll(" ", "-")}-lakes`;
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${screenshotName}.png`) });
  screenshots.push(join(SCREENSHOT_DIR, `${screenshotName}.png`));

  await content.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.locator(".locations-list").evaluate((element) => element.scrollTo(element.scrollWidth, 0));
  await page.waitForTimeout(120);
  const scrollState = await content.evaluate((element) => ({ scrollRange: element.scrollHeight - element.clientHeight, scrollTop: element.scrollTop }));
  const carouselScrollState = await page.locator(".locations-list").evaluate((element) => ({ scrollRange: element.scrollWidth - element.clientWidth, scrollLeft: element.scrollLeft }));
  const lastCard = await rectOf(page, ".location-card", true);
  const geometry = {
    viewport,
    scrollRange,
    scrollState,
    horizontalOverflow,
    horizontalCarouselRange,
    carouselScrollState,
    topbar,
    hero,
    dock,
    carousel,
    castBar,
    tabbar,
    lastCard,
    gaps: { topbarToHero: firstGap, castBarToTabbar: castGap },
  };
  measurements.push({ label: `${scenario.name} React Lakes`, value: geometry });
  check(`${scenario.name}: top bar clears lakes hero`, firstGap >= -1, `gap ${firstGap.toFixed(1)}px`);
  check(`${scenario.name}: gear dock follows hero without overlap`, dock.top >= hero.bottom - 1, `${hero.bottom.toFixed(1)} -> ${dock.top.toFixed(1)}`);
  check(`${scenario.name}: location carousel follows gear without overlap`, carousel.top >= dock.bottom - 1, `${dock.bottom.toFixed(1)} -> ${carousel.top.toFixed(1)}`);
  check(`${scenario.name}: cast bar clears tab bar`, castGap >= -1, `gap ${castGap.toFixed(1)}px`);
  check(`${scenario.name}: fixed chrome remains inside viewport`, tabbar.bottom <= (viewport?.height ?? 0) + 1 && castBar.bottom <= tabbar.top + 1, JSON.stringify({ castBar, tabbar, viewport }));
  check(`${scenario.name}: vertical full-range scroll reaches the end`, scrollState.scrollTop >= scrollState.scrollRange - 1, JSON.stringify(scrollState));
  check(`${scenario.name}: horizontal lake carousel reaches the end`, carouselScrollState.scrollLeft >= carouselScrollState.scrollRange - 1, JSON.stringify(carouselScrollState));
  check(`${scenario.name}: app content has no horizontal overflow`, horizontalOverflow <= 1, `${horizontalOverflow.toFixed(1)}px overflow`);
  check(`${scenario.name}: last lake card is visible after carousel scroll`, lastCard.left >= -1 && lastCard.right <= (viewport?.width ?? 0) + 1, `${lastCard.left.toFixed(1)}–${lastCard.right.toFixed(1)}`);
  const baseline = baselineMeasurements.get(`${scenario.name} Lakes baseline`);
  const lastContentGap = castBar.top - lastCard.bottom;
  check(`${scenario.name}: last lake card clears fixed cast bar`, lastContentGap >= -1, `gap ${lastContentGap.toFixed(1)}px`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${screenshotName}-scrolled.png`) });
  screenshots.push(join(SCREENSHOT_DIR, `${screenshotName}-scrolled.png`));

  if (!baseline) {
    check(`${scenario.name}: Phase 0 lakes baseline is available`, false, "missing baseline measurement");
    return;
  }
  const comparisons = [
    ["topbar", topbar],
    ["firstControl", hero],
    ["castBar", castBar],
    ["tabbar", tabbar],
  ];
  for (const [name, after] of comparisons) {
    for (const property of ["left", "right", "top", "bottom", "width", "height"]) {
      const delta = Number((after[property] - baseline[name][property]).toFixed(3));
      const tolerance = name === "firstControl" && scenario.name === "iPhone landscape" && (property === "top" || property === "bottom") ? 5 : 3;
      check(`${scenario.name}: ${name}.${property} matches Lit baseline`, Math.abs(delta) <= tolerance, `delta ${delta}px`);
    }
  }
  const firstGapDelta = Number((firstGap - baseline.gaps.topbarToFirstControl).toFixed(3));
  const castGapDelta = Number((castGap - baseline.gaps.castBarToTabbar).toFixed(3));
  check(`${scenario.name}: top-bar/hero gap matches Lit baseline`, Math.abs(firstGapDelta) <= (scenario.name === "iPhone landscape" ? 5 : 3), `delta ${firstGapDelta}px`);
  check(`${scenario.name}: cast/tab gap matches Lit baseline`, Math.abs(castGapDelta) <= 3, `delta ${castGapDelta}px`);
}

async function verifyGearMenu(page, label) {
  const slot = page.locator('[data-equipment-type="rod"]');
  const tile = slot.locator("button.gear-tile");
  if (await tile.count() === 0) {
    check(`${label}: rod selector is interactive`, false, "the authoritative inventory did not expose two owned rods");
    return;
  }
  await tile.tap();
  const menu = slot.locator(".equipment-options");
  await waitUntil(async () => !(await menu.getAttribute("hidden")));
  const menuRect = await rectOf(page, '[data-equipment-type="rod"] .equipment-options');
  const viewport = page.viewportSize();
  check(`${label}: gear menu has expanded state`, await tile.getAttribute("aria-expanded") === "true" && await menu.getAttribute("role") === "menu", `expanded=${await tile.getAttribute("aria-expanded")}`);
  check(`${label}: gear menu stays within viewport`, menuRect.left >= -1 && menuRect.right <= (viewport?.width ?? 0) + 1 && menuRect.top >= -1 && menuRect.bottom <= (viewport?.height ?? 0) + 1, JSON.stringify({ menuRect, viewport }));
  await page.keyboard.press("Escape");
  check(`${label}: Escape closes gear menu and restores focus`, await tile.getAttribute("aria-expanded") === "false" && await page.evaluate(() => document.activeElement?.matches("[data-equipment-type=rod] button.gear-tile") ?? false), "Escape focus contract");
}

async function verifyViewportMatrix(browser) {
  for (const scenario of viewportScenarios) {
    console.log(`Phase 5 viewport: ${scenario.name}`);
    const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const { fixture } = await installPhase5Fixtures(page);
    attachDiagnostics(page, scenario.name, fixture);
    try {
      await openReactPage(page, scenario.mock);
      console.log(`Phase 5 viewport ready: ${scenario.name}`);
      check(`${scenario.name}: Phase 5 lakes UI renders in React entry`, await page.locator('[data-testid="lakes-screen"]').count() === 1 && await page.locator(".location-card").count() > 0 && await page.locator(".gear-dock").count() === 1 && await page.locator(".cast-bar").count() === 1, "lakes, locations, gear, and cast controls visible");
      await measureLakes(page, scenario);
      await page.locator('[data-testid="app-content"]').evaluate((element) => element.scrollTo({ top: 0, left: 0, behavior: "auto" }));
      await page.waitForTimeout(120);
      await verifyGearMenu(page, scenario.name);
    } catch (error) {
      failures.push(`${scenario.name}: ${String(error)}`);
    } finally {
      await page.close();
    }
  }
}

async function verifyLockedNavigation(browser) {
  console.log("Phase 5 scenario: locked navigation");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page);
  attachDiagnostics(page, "locked location navigation", fixture);
  try {
    await openReactPage(page, "ios");
    const locked = page.locator(".location-card.is-locked").first();
    check("locked location affordance is present", await locked.count() === 1, "no locked location card rendered");
    const stateBefore = fixture.counts["GET /api/game/state"] ?? 0;
    await locked.scrollIntoViewIfNeeded();
    await locked.click();
    await page.waitForSelector('[data-testid="shop-screen"]', { timeout: 15_000 });
    check("locked location opens the React shop", await page.locator('[data-testid="shop-screen"]').count() === 1, "shop screen missing");
    check("locked location selects Boats category", await page.getByRole("tab", { name: "Boats", exact: true }).getAttribute("aria-selected") === "true", "Boats tab was not selected");
    const stateAfter = fixture.counts["GET /api/game/state"] ?? 0;
    check("locked location navigation makes at most one screen state request", stateAfter - stateBefore <= 1, `${stateAfter - stateBefore} state requests`);
  } catch (error) {
    failures.push(`locked location navigation: ${String(error)}`);
  } finally {
    await page.close();
  }

  const outOfOrderPage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture: outOfOrderFixture, releaseStateGate } = await installPhase5Fixtures(outOfOrderPage, { slowShopState: true });
  attachDiagnostics(outOfOrderPage, "out-of-order locked navigation", outOfOrderFixture);
  try {
    await openReactPage(outOfOrderPage, "ios");
    const locked = outOfOrderPage.locator(".location-card.is-locked").first();
    const stateBefore = outOfOrderFixture.counts["GET /api/game/state"] ?? 0;
    await locked.scrollIntoViewIfNeeded();
    await locked.click();
    await waitUntil(() => (outOfOrderFixture.counts["GET /api/game/state"] ?? 0) > stateBefore);
    await outOfOrderPage.getByRole("button", { name: "Lakes", exact: true }).tap();
    await outOfOrderPage.waitForSelector('[data-testid="lakes-screen"]', { timeout: 15_000 });
    releaseStateGate();
    await outOfOrderPage.waitForTimeout(150);
    check("out-of-order shop response cannot replace latest lakes navigation", await outOfOrderPage.locator('[data-testid="lakes-screen"]').count() === 1 && await outOfOrderPage.locator('[data-testid="shop-screen"]').count() === 0, "stale shop response won after newer lakes navigation");
  } catch (error) {
    failures.push(`out-of-order locked navigation: ${String(error)}`);
    releaseStateGate();
  } finally {
    await outOfOrderPage.close();
  }
}

async function verifyEquipmentDuplicate(browser) {
  console.log("Phase 5 scenario: equipment duplicate");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { selectMode: "slow" });
  attachDiagnostics(page, "equipment duplicate", fixture);
  try {
    await openReactPage(page, "ios");
    const slot = page.locator('[data-equipment-type="rod"]');
    await slot.locator("button.gear-tile").tap();
    const option = slot.locator(".equipment-option").nth(1);
    await option.evaluate((element) => { element.click(); element.click(); });
    await waitUntil(() => fixture.selectCount === 1);
    const tile = slot.locator("button.gear-tile");
    check("duplicate equipment selection sends one Worker mutation", fixture.selectCount === 1, `${fixture.selectCount} selection requests`);
    check("equipment selection disables native and semantic states", await tile.isDisabled() && await tile.getAttribute("aria-disabled") === "true", `disabled=${await tile.isDisabled()} aria-disabled=${await tile.getAttribute("aria-disabled")}`);
    check("equipment selection disables the rest of the lakes mutators", await page.locator(".cast-cta").isDisabled(), "cast remained enabled during equipment mutation");
    fixture.releaseSelect();
    await waitUntil(async () => await page.getByTestId("mutation-feedback").count() > 0 && (await page.getByTestId("mutation-feedback").innerText()).includes("Tackle updated"));
    check("equipment selection releases disabled state in finally", await tile.isEnabled() && await tile.getAttribute("aria-disabled") === "false", `enabled=${await tile.isEnabled()} aria-disabled=${await tile.getAttribute("aria-disabled")}`);
    check("equipment selection refreshes authoritative game state", (fixture.counts["GET /api/game/state"] ?? 0) >= 2, `${fixture.counts["GET /api/game/state"] ?? 0} state reads`);
  } catch (error) {
    failures.push(`equipment duplicate: ${String(error)}`);
    fixture.releaseSelect();
  } finally {
    await page.close();
  }
}

async function verifyRecovery(browser) {
  console.log("Phase 5 scenario: bait recovery");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { stateVariant: "recovery", recoveryMode: "slow" });
  attachDiagnostics(page, "bait recovery duplicate", fixture);
  try {
    await openReactPage(page, "ios");
    const recovery = page.getByRole("button", { name: "Dig for worms" });
    check("bait recovery renders when authoritative tackle is exhausted", await recovery.count() === 1, "recovery banner missing");
    await recovery.evaluate((element) => { element.click(); element.click(); });
    await waitUntil(() => fixture.recoveryCount === 1);
    check("duplicate bait recovery sends one Worker mutation", fixture.recoveryCount === 1, `${fixture.recoveryCount} recovery requests`);
    check("bait recovery disables native and semantic states", await recovery.isDisabled() && await recovery.getAttribute("aria-disabled") === "true", `disabled=${await recovery.isDisabled()} aria-disabled=${await recovery.getAttribute("aria-disabled")}`);
    fixture.releaseRecovery();
    await waitUntil(async () => await page.getByTestId("mutation-feedback").count() > 0 && (await page.getByTestId("mutation-feedback").innerText()).includes("Emergency tackle"));
    await waitUntil(async () => await page.getByRole("button", { name: "Dig for worms" }).count() === 0);
    check("bait recovery reconciles its authoritative state", (fixture.counts["GET /api/game/state"] ?? 0) >= 2, `${fixture.counts["GET /api/game/state"] ?? 0} state reads`);
  } catch (error) {
    failures.push(`bait recovery duplicate: ${String(error)}`);
    fixture.releaseRecovery();
  } finally {
    await page.close();
  }
}

async function verifyCastSuccess(browser) {
  console.log("Phase 5 scenario: cast success");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { startMode: "slow" });
  attachDiagnostics(page, "cast success duplicate", fixture);
  try {
    await openReactPage(page, "ios");
    const cast = page.locator(".cast-cta");
    const beforeBait = await page.locator(".readiness-chip").nth(2).innerText();
    await cast.evaluate((element) => { element.click(); element.click(); });
    await waitUntil(() => fixture.startCount === 1);
    check("duplicate cast sends one Worker mutation", fixture.startCount === 1, `${fixture.startCount} cast requests`);
    check("cast pending state is native and semantic", await cast.isDisabled() && await cast.getAttribute("aria-disabled") === "true", `disabled=${await cast.isDisabled()} aria-disabled=${await cast.getAttribute("aria-disabled")}`);
    check("cast does not optimistically consume bait while pending", await page.locator(".readiness-chip").nth(2).innerText() === beforeBait, `before=${beforeBait} during=${await page.locator(".readiness-chip").nth(2).innerText()}`);
    check("cast request uses the displayed authoritative loadout", JSON.stringify(fixture.lastStartInput) === JSON.stringify({ locationId: fixture.state.locations.find((location) => location.unlocked)?.id ?? fixture.state.locations[0].id, ...fixture.state.activeEquipment }), JSON.stringify(fixture.lastStartInput));
    fixture.releaseStart();
    await waitUntil(async () => await page.evaluate(() => document.body.classList.contains("is-fighting")));
    check("only the returned server encounter starts Phaser", await page.evaluate(() => document.body.classList.contains("is-fighting")) && await page.locator("#game-root canvas").count() <= 1, "fight shell did not start from returned encounter");
    check("Phase 5 does not render result screens", await page.locator("[data-testid*=result], .result-screen, [data-view=result]").count() === 0, "result-screen marker was rendered");
  } catch (error) {
    failures.push(`cast success duplicate: ${String(error)}`);
    fixture.releaseStart();
  } finally {
    await page.close();
  }
}

async function verifyReloadInterrupted(browser) {
  console.log("Phase 5 scenario: reload-interrupted cast");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { startMode: "slow" });
  attachDiagnostics(page, "reload-interrupted cast", fixture);
  try {
    await openReactPage(page, "ios");
    await page.locator(".cast-cta").click();
    await waitUntil(() => fixture.startCount === 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="react-app-shell"]', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="lakes-screen"]', { timeout: 20_000 });
    fixture.releaseStart();
    await page.waitForTimeout(200);
    check("reload-interrupted cast tears down without entering Phaser", !(await page.evaluate(() => document.body.classList.contains("is-fighting"))), "reload left the new document in fight mode");
    check("reload-interrupted cast does not replay the Worker mutation", fixture.startCount === 1, `${fixture.startCount} cast requests`);
  } catch (error) {
    failures.push(`reload-interrupted cast: ${String(error)}`);
    fixture.releaseStart();
  } finally {
    await page.close();
  }
}

async function verifyCastFailure(browser, mode, label, expectedText) {
  console.log(`Phase 5 scenario: ${label}`);
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const allowed = new Set(["/api/game/encounters:503"]);
  const options = mode === "ambiguous" ? { startMode: mode, activeAfterCast: "live" } : mode === "expired" ? { startMode: mode, activeAfterCast: "expired" } : { startMode: "failure" };
  const { fixture } = await installPhase5Fixtures(page, options);
  attachDiagnostics(page, label, fixture, allowed);
  try {
    await openReactPage(page, "ios");
    await page.locator(".cast-cta").click();
    if (mode === "ambiguous") {
      await waitUntil(async () => await page.evaluate(() => document.body.classList.contains("is-fighting")) && await page.locator('[data-testid="mutation-feedback"]').count() === 0);
      check(`${label}: active-encounter reconciliation resumes server encounter`, await page.evaluate(() => document.body.classList.contains("is-fighting")) && await page.locator('[data-testid="mutation-feedback"]').count() === 0, "ambiguous cast did not resume the active server encounter");
      check(`${label}: no second cast mutation is sent`, fixture.startCount === 1, `${fixture.startCount} cast requests`);
      return;
    }
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 15_000 });
    check(`${label}: cast failure stays out of Phaser`, !(await page.evaluate(() => document.body.classList.contains("is-fighting"))), "failed cast entered fight mode");
    check(`${label}: cast failure exposes explicit retry`, await page.getByRole("alert").innerText().then((text) => text.includes(expectedText)) && await page.getByRole("button", { name: "Try casting again" }).count() === 1, await page.getByRole("alert").innerText());
    check(`${label}: failed cast reconciles authoritative state`, (fixture.counts["GET /api/game/state"] ?? 0) >= 2, `${fixture.counts["GET /api/game/state"] ?? 0} state reads`);
    if (mode === "expired") check(`${label}: expired encounter is explicitly explained`, await page.getByRole("alert").innerText().then((text) => text.includes("previous encounter expired")), await page.getByRole("alert").innerText());
    if (mode === "failure") {
      await page.getByRole("button", { name: "Try casting again" }).click();
      await waitUntil(() => fixture.startCount === 2);
      check(`${label}: user retry is the only replay`, fixture.startCount === 2 && !(await page.evaluate(() => document.body.classList.contains("is-fighting"))), `${fixture.startCount} cast requests`);
    }
  } catch (error) {
    failures.push(`${label}: ${String(error)}`);
  } finally {
    await page.close();
  }
}

async function verifyExpiredSession(browser) {
  console.log("Phase 5 scenario: expired session");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { startMode: "401-once" });
  attachDiagnostics(page, "cast expired-session recovery", fixture, new Set(["/api/game/encounters:401"]));
  try {
    await openReactPage(page, "ios");
    await page.locator(".cast-cta").click();
    await waitUntil(async () => await page.evaluate(() => document.body.classList.contains("is-fighting")));
    check("expired cast session recovers once and retries the original cast", fixture.startCount === 2 && (fixture.counts["POST /api/auth/dev"] ?? 0) === 2, JSON.stringify({ casts: fixture.startCount, auth: fixture.counts["POST /api/auth/dev"] ?? 0 }));
  } catch (error) {
    failures.push(`cast expired-session recovery: ${String(error)}`);
  } finally {
    await page.close();
  }

  const noLoopPage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture: noLoopFixture } = await installPhase5Fixtures(noLoopPage, { startMode: "401-twice" });
  attachDiagnostics(noLoopPage, "cast expired-session no loop", noLoopFixture, new Set(["/api/game/encounters:401"]));
  try {
    await openReactPage(noLoopPage, "ios");
    await noLoopPage.locator(".cast-cta").click();
    await noLoopPage.getByRole("alert").waitFor({ state: "visible", timeout: 15_000 });
    check("second expired cast session stops after one automatic retry", noLoopFixture.startCount === 2 && (noLoopFixture.counts["POST /api/auth/dev"] ?? 0) === 2, JSON.stringify({ casts: noLoopFixture.startCount, auth: noLoopFixture.counts["POST /api/auth/dev"] ?? 0 }));
    await noLoopPage.getByRole("button", { name: "Try casting again" }).click();
    await waitUntil(async () => await noLoopPage.evaluate(() => document.body.classList.contains("is-fighting")));
    check("expired cast session can recover on explicit user retry", noLoopFixture.startCount === 3, `${noLoopFixture.startCount} cast requests`);
  } catch (error) {
    failures.push(`cast expired-session no loop: ${String(error)}`);
  } finally {
    await noLoopPage.close();
  }
}

async function verifyActiveEncounter(browser) {
  console.log("Phase 5 scenario: active encounter");
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { fixture } = await installPhase5Fixtures(page, { initialActive: "live" });
  attachDiagnostics(page, "active encounter resume", fixture);
  try {
    await page.goto(`${BASE}/index.react.html?telegramMock=ios`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="react-app-shell"]', { state: "attached", timeout: 20_000 });
    await waitUntil(async () => await page.evaluate(() => document.body.classList.contains("is-fighting")));
    check("startup active encounter resumes through Phaser adapter", await page.evaluate(() => document.body.classList.contains("is-fighting")) && fixture.startCount === 0, JSON.stringify({ fighting: await page.evaluate(() => document.body.classList.contains("is-fighting")), casts: fixture.startCount }));
    check("active encounter disables a second cast/navigation", await page.locator(".tab-button").first().evaluate((button) => button.disabled) && await page.locator(".cast-cta").count() === 1, "active encounter left controls available");
  } catch (error) {
    failures.push(`active encounter resume: ${String(error)}`);
  } finally {
    await page.close();
  }
}

async function loadBaseline() {
  try {
    const baseline = JSON.parse(await readFile(BASELINE_REPORT, "utf8"));
    for (const measurement of baseline.measurements ?? []) {
      if (measurement.label.endsWith("Lakes baseline")) baselineMeasurements.set(measurement.label, measurement.value);
    }
  } catch (error) {
    failures.push(`Phase 0 baseline could not be loaded: ${String(error)}`);
  }
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
await loadBaseline();
const browser = await chromium.launch();
try {
  await verifyViewportMatrix(browser);
  await verifyLockedNavigation(browser);
  await verifyEquipmentDuplicate(browser);
  await verifyRecovery(browser);
  await verifyCastSuccess(browser);
  await verifyReloadInterrupted(browser);
  await verifyCastFailure(browser, "failure", "cast failed retry", "cast was not accepted");
  await verifyCastFailure(browser, "ambiguous", "cast ambiguous active reconciliation", "");
  await verifyCastFailure(browser, "expired", "cast expired encounter", "previous encounter expired");
  await verifyExpiredSession(browser);
  await verifyActiveEncounter(browser);
} finally {
  await browser.close();
}

check("Phase 5 browser run reports no unexpected console errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none");
check("Phase 5 browser run reports no unexpected same-origin failures", unexpectedResponses.length === 0, JSON.stringify(unexpectedResponses));

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  baselineReport: BASELINE_REPORT,
  baselineMeasurementsLoaded: baselineMeasurements.size,
  viewportScenarios,
  checks,
  failures,
  measurements,
  requestCounts,
  consoleErrors,
  unexpectedResponses,
  screenshots,
  intentionalVisualDifferences: "The React lakes entry uses the existing Phase 0 geometry tokens, copy, and ported feature styles. Geometry comparison allows a 3px browser/font tolerance and 5px for the captured landscape screen-pop timing; fixed-chrome overlap checks use zero-overlap bounds.",
};
await writeFile(join(ARTIFACT_DIR, "react-phase5-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
