// Browser verification for the production React encounter lifecycle.
//
// The page is the production React entry. API responses are deterministic
// route fixtures so delayed, stale, ambiguous, and failed mutations can be
// exercised without changing the Worker or replaying a real catch.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { apiError } from "./fixtures/async-flows.mjs";
import {
  completionResultFromState,
  installExternalFishFixtures,
  normalizeGameState,
} from "./fixtures/browser-fixtures.mjs";

const BASE_INPUT = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const BASE_URL = new URL(BASE_INPUT);
const WORKER_ORIGIN = process.env.WORKER_ORIGIN ?? "http://127.0.0.1:8787";
const ARTIFACT_DIR = resolve(process.env.ENCOUNTER_ARTIFACT_DIR ?? "/private/tmp/fishing-with-friends-encounter");
const SCREENSHOT_DIR = join(ARTIFACT_DIR, "screenshots");
const REPORT_PATH = join(ARTIFACT_DIR, "browser-report.json");
const failures = [];
const checks = [];
const flows = [];
const measurements = [];
const screenshots = [];
const consoleErrors = [];
const unexpectedResponses = [];

function pageUrl(mock = "ios") {
  const url = new URL(BASE_URL);
  url.searchParams.set("telegramMock", mock);
  return url.toString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function check(label, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail });
  if (!passed) failures.push(`${label}: ${detail}`);
}

function requireCheck(label, condition, detail) {
  check(label, condition, detail);
  if (!condition) throw new Error(`${label}: ${detail}`);
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for the browser fixture.`);
}

function encounterForState(state, encounterId = "encounter-browser") {
  const location = state.locations.find((candidate) => candidate.unlocked) ?? state.locations[0];
  const species = state.catalog.fish.find((candidate) => candidate.availableLocationIds.includes(location.id)) ?? state.catalog.fish[0];
  return {
    encounterId,
    difficultySeed: 2187,
    locationId: location.id,
    locationName: location.name,
    species,
    // Keep the real Phaser scene in its playing state until the verifier emits
    // the deterministic completion event through the development seam.
    miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0, catchMeterLossRate: 0, durationSeconds: 600 },
    rodRiskBand: location.riskBand,
    expiresAt: "2099-01-01T12:05:00.000Z",
  };
}

function decisionFromResult(state, result, decision) {
  return {
    decision,
    coins: decision === "sell" ? state.coins + (result.catch?.saleValueCoins ?? 0) : state.coins,
    catch: result.catch,
  };
}

async function loadWorkerState() {
  const authResponse = await fetch(`${WORKER_ORIGIN}/api/auth/dev`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Dev-Auth": "true" },
    body: "{}",
  });
  if (!authResponse.ok) throw new Error(`Worker fixture auth failed with ${authResponse.status}.`);
  const auth = await authResponse.json();
  const stateResponse = await fetch(`${WORKER_ORIGIN}/api/game/state`, { headers: { Accept: "application/json", Authorization: `Bearer ${auth.accessToken}` } });
  if (!stateResponse.ok) throw new Error(`Worker fixture state failed with ${stateResponse.status}.`);
  return normalizeGameState(await stateResponse.json());
}

function attachDiagnostics(page, label, fixture) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().includes("Failed to load resource") && /status of (401|503)/.test(message.text())) return;
    if (message.text().includes("Blocked call to navigator.vibrate because user hasn't tapped")) return;
    consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${label}: ${String(error)}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin || response.status() < 400) return;
    if ([401, 503].includes(response.status())) return;
    unexpectedResponses.push({ label, path: url.pathname, status: response.status() });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(BASE_URL).origin || !url.pathname.startsWith("/api/")) return;
    fixture.requestCounts[`${request.method()} ${url.pathname}`] = (fixture.requestCounts[`${request.method()} ${url.pathname}`] ?? 0) + 1;
  });
}

async function installEncounterFixtures(page, sourceState, options = {}) {
  const state = clone(sourceState);
  const encounter = encounterForState(state, options.encounterId ?? "encounter-browser");
  const fixture = {
    state,
    encounter,
    serverActive: options.initialActive === "live" ? encounter : null,
    serverExpired: options.initialActive === "expired",
    completionMode: options.completionMode ?? "success",
    decisionMode: options.decisionMode ?? "success",
    outcome: options.outcome ?? "caught",
    rodBroke: Boolean(options.rodBroke),
    startCalls: 0,
    completionCalls: 0,
    decisionCalls: 0,
    authCalls: 0,
    recoveryAuthCalls: 0,
    requestCounts: {},
    completionSettled: false,
    decisionSettled: false,
    completionResult: undefined,
    releaseCompletion: () => {},
    releaseDecision: () => {},
  };
  let releaseCompletionGate;
  const completionGate = new Promise((resolvePromise) => { releaseCompletionGate = resolvePromise; });
  fixture.releaseCompletion = () => releaseCompletionGate();
  let releaseDecisionGate;
  const decisionGate = new Promise((resolvePromise) => { releaseDecisionGate = resolvePromise; });
  fixture.releaseDecision = () => releaseDecisionGate();

  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  await installExternalFishFixtures(page);
  await page.route("**/api/auth/dev", async (route) => {
    fixture.authCalls += 1;
    if (fixture.authCalls > 1) fixture.recoveryAuthCalls += 1;
    await fulfillJson(route, {
      accessToken: "encounter-browser-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      player: { id: "encounter-player", telegramUsername: "encounter", displayName: "Encounter Angler", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z" },
    });
  });
  await page.route("**/api/me", async (route) => {
    await fulfillJson(route, { player: { id: "encounter-player", telegramUsername: "encounter", displayName: "Encounter Angler", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z" } });
  });
  await page.route("**/api/game/state", async (route) => {
    await fulfillJson(route, fixture.state);
  });
  await page.route("**/api/game/encounters/active", async (route) => {
    await fulfillJson(route, { encounter: fixture.serverActive, expired: fixture.serverExpired });
  });
  await page.route("**/api/game/journal", async (route) => {
    await fulfillJson(route, { entries: [] });
  });
  await page.route("**/api/game/friends", async (route) => {
    await fulfillJson(route, { metric: "kept", metricDescription: "Ranked by kept fish.", viewer: { playerId: "encounter-player", displayName: "Encounter Angler", rank: null, keptFishCount: 0, heaviestKeptFishKg: 0 }, entries: [] });
  });
  await page.route("**/api/game/collection", async (route) => {
    await fulfillJson(route, { fish: [] });
  });
  await page.route("**/api/game/encounters", async (route) => {
    fixture.startCalls += 1;
    if (options.startMode === "failure" && fixture.startCalls === 1) {
      await fulfillJson(route, apiError("The cast was not accepted."), 503);
      return;
    }
    fixture.serverActive = encounter;
    await fulfillJson(route, encounter);
  });
  await page.route("**/api/game/encounters/*/complete", async (route) => {
    fixture.completionCalls += 1;
    const mode = fixture.completionMode;
    if (mode === "delayed") await completionGate;
    if (mode === "401-twice" && fixture.completionCalls <= 2) {
      fixture.serverActive = null;
      await fulfillJson(route, apiError("The completion session is still expired."), 401);
      return;
    }
    if (mode === "fail-once" && fixture.completionCalls === 1) {
      fixture.serverActive = null;
      await fulfillJson(route, apiError("Completion service unavailable."), 503);
      return;
    }
    if (mode === "ambiguous-live" && fixture.completionCalls === 1) {
      fixture.serverActive = encounter;
      await fulfillJson(route, apiError("The completion response timed out."), 503);
      return;
    }
    fixture.serverActive = null;
    fixture.serverExpired = false;
    fixture.completionResult ??= completionResultFromState(fixture.state, {
      outcome: fixture.outcome,
      rodBroke: fixture.rodBroke,
      id: "encounter-catch",
      saleValueCoins: 184,
    });
    fixture.completionSettled = true;
    try {
      await fulfillJson(route, fixture.completionResult);
    } catch (error) {
      if (!route.request().failure()?.errorText?.includes("ABORTED")) throw error;
    }
  });
  await page.route("**/api/game/catches/*/decision", async (route) => {
    fixture.decisionCalls += 1;
    const mode = fixture.decisionMode;
    if (mode === "delayed") await decisionGate;
    if (mode === "401-twice" && fixture.decisionCalls <= 2) {
      await fulfillJson(route, apiError("The decision session is still expired."), 401);
      return;
    }
    if (mode === "fail-once" && fixture.decisionCalls === 1) {
      await fulfillJson(route, apiError("Decision service unavailable."), 503);
      return;
    }
    if (mode === "ambiguous-pending" && fixture.decisionCalls === 1) {
      await fulfillJson(route, apiError("The decision response timed out."), 503);
      return;
    }
    const input = JSON.parse(route.request().postData() ?? "{}");
    const result = fixture.completionResult;
    if (!result?.catch) {
      await fulfillJson(route, apiError("The catch is missing."), 409);
      return;
    }
    fixture.decisionSettled = true;
    try {
      await fulfillJson(route, decisionFromResult(fixture.state, result, input.decision));
    } catch (error) {
      if (!route.request().failure()?.errorText?.includes("ABORTED")) throw error;
    }
  });
  return fixture;
}

async function openPage(browser, sourceState, label, options = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const fixture = await installEncounterFixtures(page, sourceState, options);
  attachDiagnostics(page, label, fixture);
  await page.goto(pageUrl(options.mock ?? "ios"), { waitUntil: "domcontentloaded" });
  // A resumed encounter intentionally hides the React shell behind Phaser.
  await page.waitForSelector('[data-testid="react-app-shell"]', { state: "attached", timeout: 20_000 });
  await page.waitForFunction(() => Boolean(
    document.querySelector('[data-testid="lakes-screen"]')
      || document.querySelector('[data-testid="catch-result"]')
      || document.querySelector('[data-testid="decision-result"]')
      || document.querySelector('[data-testid="retry-panel"]')
      || document.body.classList.contains("is-fighting"),
  ), { timeout: 20_000 });
  return { page, fixture };
}

async function startEncounter(page, fixture) {
  await page.locator('[data-testid="cast-cta"]').click();
  await waitUntil(() => fixture.startCalls === 1);
  await page.waitForFunction(() => document.body.classList.contains("is-fighting"), { timeout: 10_000 });
}

async function emitComplete(page, encounterId) {
  await page.evaluate((id) => {
    const seam = window.__FISHING_REACT__;
    if (!seam) throw new Error("React development runtime seam is missing.");
    seam.emitFishingComplete({ encounterId: id, performance: 0.87 });
  }, encounterId);
}

async function emitAmbient(page, encounterId) {
  await page.evaluate((id) => {
    const seam = window.__FISHING_REACT__;
    if (!seam) throw new Error("React development runtime seam is missing.");
    seam.emitFishingAmbient(id);
  }, encounterId);
}

async function measureEncounter(page, label) {
  const measurement = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const content = document.querySelector('[data-testid="app-content"]');
    const before = {
      topbar: rect(".app-topbar"),
      tabbar: rect(".tabbar"),
      result: rect('[data-testid="catch-result"]'),
      decision: rect('[data-testid="catch-decision"]'),
      saleValue: rect('[data-testid="catch-sale-value"]'),
      visual: rect(".catch-visual"),
      quality: rect(".catch-quality"),
      scrollRange: content ? content.scrollHeight - content.clientHeight : null,
    };
    content?.scrollTo(0, content.scrollHeight);
    const after = {
      result: rect('[data-testid="catch-result"]'),
      decision: rect('[data-testid="catch-decision"]'),
    };
    return { before, after };
  });
  measurements.push({ label, ...measurement });
  if (measurement.before.decision && measurement.before.tabbar) {
    const gap = measurement.before.tabbar.top - measurement.before.decision.bottom;
    requireCheck(`${label} decision dock gap`, Math.abs(gap - 10) < 3, `${gap.toFixed(1)}px (expected 10px)`);
  }
  if (measurement.before.result && measurement.before.tabbar && measurement.after.result) {
    requireCheck(`${label} result clears fixed chrome`, measurement.after.result.bottom <= measurement.before.tabbar.top + 2, `${measurement.after.result.bottom.toFixed(1)} vs ${measurement.before.tabbar.top.toFixed(1)}`);
  }
  if (measurement.before.saleValue && measurement.before.visual && measurement.before.quality) {
    const sale = measurement.before.saleValue;
    const visual = measurement.before.visual;
    const quality = measurement.before.quality;
    const inside = sale.left >= visual.left && sale.right <= visual.right && sale.top >= visual.top && sale.bottom <= visual.bottom;
    const noOverlap = sale.right <= quality.left || sale.left >= quality.right || sale.bottom <= quality.top || sale.top >= quality.bottom;
    requireCheck(`${label} payout badge geometry`, inside && noOverlap, JSON.stringify({ sale, visual, quality }));
  }
  return measurement;
}

async function capture(page, name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path });
  screenshots.push({ name, path, viewport: page.viewportSize() });
}

async function runFlow(name, operation) {
  console.log(`START ${name}`);
  try {
    await operation();
    flows.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    flows.push({ name, passed: false, error: String(error) });
    failures.push(`${name}: ${String(error)}`);
    console.log(`FAIL ${name}: ${String(error)}`);
  }
}

async function verifyStartup(browser, sourceState) {
  await runFlow("startup active resume, expiry, and empty lobby", async () => {
    const live = await openPage(browser, sourceState, "startup-live", { initialActive: "live" });
    await live.page.waitForFunction(() => document.body.classList.contains("is-fighting"), { timeout: 10_000 });
    requireCheck("live active encounter resumes in Phaser fight mode", await live.page.locator("body").evaluate((element) => element.classList.contains("is-fighting")), "body is-fighting is missing");
    requireCheck("live resume does not create another encounter", live.fixture.startCalls === 0, `${live.fixture.startCalls} start requests`);
    await live.page.close();

    const expired = await openPage(browser, sourceState, "startup-expired", { initialActive: "expired" });
    const expiredText = await expired.page.locator("body").textContent();
    requireCheck("expired active encounter is explained", /expired/i.test(expiredText ?? ""), expiredText ?? "no expired copy");
    await expired.page.close();

    const empty = await openPage(browser, sourceState, "startup-empty", { initialActive: "empty" });
    requireCheck("empty active encounter returns to lakes", await empty.page.locator('[data-testid="lakes-screen"]').count() === 1, "lakes screen missing");
    await empty.page.close();
  });
}

async function verifyCompletionAndDecision(browser, sourceState) {
  await runFlow("completion ambient gate and keep decision exactly once", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "completion-keep", { completionMode: "delayed", decisionMode: "delayed" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionCalls === 1);
    requireCheck("repeated Phaser complete events submit once", fixture.completionCalls === 1, `${fixture.completionCalls} completion requests`);
    requireCheck("DOM result stays hidden while completion is pending", await page.locator('[data-testid="catch-result"]').count() === 0, "catch result rendered early");
    await emitAmbient(page, "stale-encounter");
    requireCheck("stale Phaser ambient cannot reveal the pending result", await page.locator('[data-testid="catch-result"]').count() === 0, "stale ambient revealed the result");
    fixture.releaseCompletion();
    await waitUntil(() => fixture.completionSettled);
    requireCheck("DOM result stays hidden until Phaser ambient", await page.locator('[data-testid="catch-result"]').count() === 0, "catch result rendered before ambient");
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]', { timeout: 10_000 });
    requireCheck("resolved catch clears the completion loading toast", await page.locator('[data-testid="app-frame"]').getAttribute("data-toast-visible") === "false", "completion toast remains visible after ambient");
    await capture(page, "encounter-caught-result");
    await measureEncounter(page, "production caught result");
    await page.locator(".keep-choice").click();
    await waitUntil(() => fixture.decisionCalls === 1);
    const pending = await page.locator(".catch-choice").evaluateAll((buttons) => buttons.map((button) => ({ disabled: button.disabled, ariaDisabled: button.getAttribute("aria-disabled") })));
    requireCheck("pending catch choice is natively and semantically disabled", pending.every((button) => button.disabled && button.ariaDisabled === "true"), JSON.stringify(pending));
    await page.evaluate(() => document.querySelector(".sell-choice")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    requireCheck("programmatic duplicate catch choice is ignored", fixture.decisionCalls === 1, `${fixture.decisionCalls} decision requests`);
    fixture.releaseDecision();
    await page.waitForSelector('[data-testid="decision-result"]', { timeout: 10_000 });
    requireCheck("keep decision receipt is rendered", /Into the livewell|Trophy secured/i.test(await page.locator('[data-testid="decision-result"]').textContent() ?? ""), "keep receipt missing");
    await capture(page, "encounter-keep-receipt");
    await page.locator(".decision-continue").click();
    await page.waitForSelector('[data-testid="lakes-screen"]', { timeout: 10_000 });
    requireCheck("return to lakes clears Phaser fight mode", !(await page.locator("body").evaluate((element) => element.classList.contains("is-fighting"))), "body remains in fight mode");
    await page.close();
  });

  await runFlow("sell decision receipt", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "completion-sell", { decisionMode: "success" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionSettled);
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]');
    await page.locator(".sell-choice").click();
    await page.waitForSelector('[data-testid="decision-result"]');
    const textContent = await page.locator('[data-testid="decision-result"]').textContent();
    requireCheck("sell decision receipt shows the payout", /Nice payday|\+184 coins/i.test(textContent ?? ""), textContent ?? "sell receipt missing");
    await capture(page, "encounter-sell-receipt");
    await page.close();
  });
}

async function verifyFailuresAndRecovery(browser, sourceState) {
  await runFlow("completion failure, retry, and second 401", async () => {
    for (const mode of ["fail-once", "401-twice"]) {
      const { page, fixture } = await openPage(browser, sourceState, `completion-${mode}`, { completionMode: mode });
      await startEncounter(page, fixture);
      await emitComplete(page, fixture.encounter.encounterId);
      await waitUntil(() => fixture.completionCalls === (mode === "401-twice" ? 2 : 1));
      await page.waitForSelector('[data-testid="retry-panel"]', { timeout: 10_000 });
      await emitAmbient(page, fixture.encounter.encounterId);
      requireCheck(`${mode} completion exposes explicit retry`, /catch|completion|connection/i.test(await page.locator('[data-testid="retry-panel"]').textContent() ?? ""), "retry panel copy missing");
      requireCheck(`${mode} completion does not auto-loop`, fixture.completionCalls === (mode === "401-twice" ? 2 : 1), `${fixture.completionCalls} completion requests`);
      if (mode === "401-twice") requireCheck("second completion 401 uses one recovery", fixture.recoveryAuthCalls === 1, `${fixture.recoveryAuthCalls} recovery auth requests`);
      await page.getByRole("button", { name: /Retry catch resolution/ }).click();
      await waitUntil(() => fixture.completionSettled);
      requireCheck(`${mode} completion retry is the only new mutation`, fixture.completionCalls === (mode === "401-twice" ? 3 : 2), `${fixture.completionCalls} completion requests`);
      await page.waitForSelector('[data-testid="catch-decision"]', { timeout: 10_000 });
      requireCheck(`${mode} completion retry clears its loading toast`, await page.locator('[data-testid="app-frame"]').getAttribute("data-toast-visible") === "false", "completion retry toast remains visible");
      await page.close();
    }
  });

  await runFlow("decision failure, retry, and second 401", async () => {
    for (const mode of ["fail-once", "401-twice", "ambiguous-pending"]) {
      const { page, fixture } = await openPage(browser, sourceState, `decision-${mode}`, { decisionMode: mode });
      await startEncounter(page, fixture);
      await emitComplete(page, fixture.encounter.encounterId);
      await waitUntil(() => fixture.completionSettled);
      await emitAmbient(page, fixture.encounter.encounterId);
      await page.waitForSelector('[data-testid="catch-decision"]');
      await page.locator(".keep-choice").click();
      await waitUntil(() => fixture.decisionCalls === (mode === "401-twice" ? 2 : 1));
      await page.waitForSelector('[data-testid="retry-panel"]', { timeout: 10_000 });
      requireCheck(`${mode} decision exposes explicit retry`, /choice|catch|saved/i.test(await page.locator('[data-testid="retry-panel"]').textContent() ?? ""), "decision retry copy missing");
      requireCheck(`${mode} decision does not auto-loop`, fixture.decisionCalls === (mode === "401-twice" ? 2 : 1), `${fixture.decisionCalls} decision requests`);
      if (mode === "401-twice") requireCheck("second decision 401 uses one recovery", fixture.recoveryAuthCalls === 1, `${fixture.recoveryAuthCalls} recovery auth requests`);
      await page.getByRole("button", { name: /Retry choice/ }).click();
      await waitUntil(() => fixture.decisionSettled);
      requireCheck(`${mode} decision retry is the only new mutation`, fixture.decisionCalls === (mode === "401-twice" ? 3 : 2), `${fixture.decisionCalls} decision requests`);
      await page.waitForSelector('[data-testid="decision-result"]', { timeout: 10_000 });
      await page.close();
    }
  });

  await runFlow("ambiguous completion reconciles the active Worker encounter", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "completion-ambiguous-live", { completionMode: "ambiguous-live" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionCalls === 1);
    await page.waitForSelector('[data-testid="screen-loading"]', { state: "attached", timeout: 10_000 });
    await waitUntil(() => fixture.serverActive?.encounterId === fixture.encounter.encounterId);
    await page.waitForFunction(() => document.body.classList.contains("is-fighting") && !document.querySelector('[data-testid="screen-loading"]'));
    requireCheck("ambiguous completion resumes the live encounter", await page.locator('[data-testid="retry-panel"]').count() === 0, "retry panel replaced live encounter");
    requireCheck("ambiguous completion does not duplicate automatically", fixture.completionCalls === 1, `${fixture.completionCalls} completion requests`);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionSettled);
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]');
    await page.close();
  });
}

async function verifyReloadRecovery(browser, sourceState) {
  await runFlow("reload fighting resumes without a new encounter", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "reload-fighting", { initialActive: "live" });
    await page.waitForFunction(() => document.body.classList.contains("is-fighting"), { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitUntil(() => (fixture.requestCounts["GET /api/game/encounters/active"] ?? 0) >= 2, 15_000);
    await page.waitForTimeout(500);
    const reloadState = await page.locator("body").evaluate((element) => ({ className: element.className, text: element.textContent?.slice(0, 180) }));
    requireCheck("reload fighting restores the server encounter", reloadState.className.includes("is-fighting"), JSON.stringify({ reloadState, requestCounts: fixture.requestCounts, active: fixture.serverActive?.encounterId }));
    requireCheck("reload fighting has no start mutation", fixture.startCalls === 0, `${fixture.startCalls} start requests`);
    await page.close();
  });

  await runFlow("reload resolving resumes the live server encounter", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "reload-resolving", { completionMode: "delayed" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionCalls === 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("is-fighting"));
    requireCheck("reload resolving does not replay completion", fixture.completionCalls === 1, `${fixture.completionCalls} completion requests`);
    fixture.releaseCompletion();
    await page.close();
  });

  await runFlow("reload result restores the completion response", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "reload-result");
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionSettled);
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]');
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="catch-decision"]', { timeout: 10_000 });
    requireCheck("reload result does not replay completion", fixture.completionCalls === 1, `${fixture.completionCalls} completion requests`);
    await page.close();
  });

  await runFlow("reload decision recovery restores the pending choice", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "reload-decision", { decisionMode: "delayed" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionSettled);
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]');
    await page.locator(".keep-choice").click();
    await waitUntil(() => fixture.decisionCalls === 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="catch-decision"]', { timeout: 10_000 });
    requireCheck("reload decision recovery does not replay the mutation", fixture.decisionCalls === 1, `${fixture.decisionCalls} decision requests`);
    fixture.releaseDecision();
    await page.close();
  });
}

async function verifyAccessibilityAndModes(browser, sourceState) {
  await runFlow("keyboard, accessibility modes, and full result scroll", async () => {
    const { page, fixture } = await openPage(browser, sourceState, "accessibility-result", { decisionMode: "delayed" });
    await startEncounter(page, fixture);
    await emitComplete(page, fixture.encounter.encounterId);
    await waitUntil(() => fixture.completionSettled);
    await emitAmbient(page, fixture.encounter.encounterId);
    await page.waitForSelector('[data-testid="catch-decision"]');
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    const modes = await page.evaluate(() => ({ reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, forcedColors: matchMedia("(forced-colors: active)").matches, animation: getComputedStyle(document.querySelector(".catch-reveal")).animationName }));
    requireCheck("reduced-motion and forced-colors are active", modes.reducedMotion && modes.forcedColors, JSON.stringify(modes));
    requireCheck("reduced-motion disables result animation", modes.animation === "none", JSON.stringify(modes));
    const buttons = await page.locator(".catch-choice").evaluateAll((elements) => elements.map((element) => ({ name: element.getAttribute("aria-label") ?? element.textContent?.trim(), disabled: element.disabled, ariaDisabled: element.getAttribute("aria-disabled") })));
    requireCheck("catch choices expose accessible names", buttons.every((button) => button.name && button.disabled === false && button.ariaDisabled === "false"), JSON.stringify(buttons));
    await page.locator(".keep-choice").focus();
    await page.keyboard.press("Enter");
    await waitUntil(() => fixture.decisionCalls === 1);
    requireCheck("keyboard catch choice uses the decision lock", fixture.decisionCalls === 1, `${fixture.decisionCalls} decision requests`);
    const pending = await page.locator(".keep-choice").evaluate((element) => ({ disabled: element.disabled, ariaDisabled: element.getAttribute("aria-disabled") }));
    requireCheck("keyboard decision exposes native pending state", pending.disabled && pending.ariaDisabled === "true", JSON.stringify(pending));
    fixture.releaseDecision();
    await page.waitForSelector('[data-testid="decision-result"]');
    await measureEncounter(page, "production accessibility result");
    await page.close();
  });
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
try {
  const sourceState = await loadWorkerState();
  const browser = await chromium.launch();
  try {
    await verifyStartup(browser, sourceState);
    await verifyCompletionAndDecision(browser, sourceState);
    await verifyFailuresAndRecovery(browser, sourceState);
    await verifyReloadRecovery(browser, sourceState);
    await verifyAccessibilityAndModes(browser, sourceState);
  } finally {
    await browser.close();
  }
} catch (error) {
  failures.push(`Encounter browser setup: ${String(error)}`);
}

check("Encounter browser console health", consoleErrors.length === 0, consoleErrors.join(" | ") || "no page or console errors");
check("Encounter browser response health", unexpectedResponses.length === 0, JSON.stringify(unexpectedResponses));

const report = {
  generatedAt: new Date().toISOString(),
  base: pageUrl(),
  workerOrigin: WORKER_ORIGIN,
  checks,
  flows,
  measurements,
  screenshots,
  consoleErrors,
  unexpectedResponses,
  failures,
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Encounter browser report: ${REPORT_PATH}`);
console.log(`Encounter screenshots: ${SCREENSHOT_DIR}`);
console.log(`Encounter flows: ${flows.filter((flow) => flow.passed).length}/${flows.length} passed`);
console.log(`Encounter checks: ${checks.filter((item) => item.passed).length}/${checks.length} passed`);
if (consoleErrors.length > 0) console.log(`Unexpected console errors: ${consoleErrors.length}`);
if (unexpectedResponses.length > 0) console.log(`Unexpected responses: ${unexpectedResponses.length}`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Production encounter browser verification passed.");
}
