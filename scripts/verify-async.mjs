import { activeEncounterFromState, apiError, deferred } from "./fixtures/async-flows.mjs";
import {
  collectionFromState,
  completionResultFromState,
  installDeterministicReadFixtures,
  leaderboardFixture,
} from "./fixtures/browser-fixtures.mjs";

const VIEWPORT = { width: 393, height: 852 };

async function createPage(browser, recordConsoleError) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on("console", (message) => {
    if (message.type() === "error") recordConsoleError(message.text());
  });
  page.on("pageerror", (error) => recordConsoleError(String(error)));
  return page;
}

async function fulfillJson(route, json, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(json),
  });
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for a browser fixture condition.`);
}

async function waitForLakes(page, base) {
  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
}

async function verifyFailedNavigation({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  let friendsAttempts = 0;
  await page.route("**/api/game/friends", async (route) => {
    friendsAttempts += 1;
    if (friendsAttempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fulfillJson(route, apiError("The catch board is temporarily unavailable."), 503);
      return;
    }
    await route.continue();
  });

  await waitForLakes(page, base);
  await page.getByRole("button", { name: "Friends" }).click();
  await page.waitForSelector(".fishing-status:not(.is-loading)", { timeout: 10_000 });

  check(
    "failed navigation shows retry UI",
    (await page.getByRole("button", { name: "Try again" }).count()) === 1,
    `friends attempts ${friendsAttempts}`,
  );
  check(
    "failed navigation clears loading toast",
    (await page.locator('.toast[data-state="loading"]').count()) === 0,
    "no stale loading toast",
  );
  const retryBounds = await page.locator("[data-testid=retry-panel]").boundingBox();
  const topbarBounds = await page.locator(".app-topbar").boundingBox();
  const tabbarBounds = await page.locator(".tabbar").boundingBox();
  check(
    "retry panel clears fixed chrome",
    Boolean(retryBounds && topbarBounds && tabbarBounds && retryBounds.y >= topbarBounds.y + topbarBounds.height && retryBounds.y + retryBounds.height <= tabbarBounds.y),
    `retry ${retryBounds ? `${retryBounds.y.toFixed(1)}–${(retryBounds.y + retryBounds.height).toFixed(1)}` : "missing"}, topbar bottom ${topbarBounds ? (topbarBounds.y + topbarBounds.height).toFixed(1) : "missing"}, tabbar top ${tabbarBounds?.y?.toFixed(1) ?? "missing"}`,
  );

  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForSelector(".friends-screen", { timeout: 10_000 });
  check("screen retry succeeds", (await page.locator(".friends-screen").count()) === 1, "friends screen rendered");
  await page.close();
}

async function verifyLatestNavigation({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const friendsGate = deferred();
  let friendsAborted = false;
  let friendsResponseReleased = false;
  let friendsResponseFulfillFailed = false;
  let collectionAttempts = 0;

  await page.route("**/api/game/friends", async (route) => {
    try {
      await friendsGate.promise;
      friendsResponseReleased = true;
      await fulfillJson(route, leaderboardFixture());
    } catch {
      friendsAborted = true;
      friendsResponseFulfillFailed = true;
    }
  });
  await page.route("**/api/game/collection", async (route) => {
    collectionAttempts += 1;
    await route.continue();
  });

  await waitForLakes(page, base);
  await page.getByRole("button", { name: "Friends" }).click();
  await page.waitForSelector(".fishing-status.is-loading", { timeout: 5_000 });
  check("navigation shows loading screen", (await page.locator(".fishing-status.is-loading").count()) === 1, "loading panel rendered");

  await page.getByRole("button", { name: "Collection" }).click();
  await page.waitForSelector(".collection-screen", { timeout: 10_000 });
  friendsGate.release();
  await waitUntil(() => friendsResponseReleased || friendsResponseFulfillFailed, 5_000);
  await page.waitForTimeout(150);

  check(
    "latest navigation wins",
    (await page.locator(".collection-screen").count()) === 1 && (await page.locator(".friends-screen").count()) === 0,
    friendsAborted || friendsResponseFulfillFailed ? "stale friends response was aborted/ignored" : "stale friends response was fulfilled after collection",
  );
  check("out-of-order response was exercised", friendsResponseReleased || friendsResponseFulfillFailed, "friends response released after collection committed");
  check("latest screen request completed", collectionAttempts === 1, `${collectionAttempts} collection request`);
  await page.close();
}

async function verifyPendingPurchase({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const purchaseGate = deferred();
  let purchaseRequests = 0;
  let gameState;

  await page.route("**/api/game/state", async (route) => {
    const response = await route.fetch();
    gameState = await response.json();
    // Keep this fixture independent of whatever the persistent local dev player has bought.
    gameState.coins = 999_999;
    await fulfillJson(route, gameState);
  });
  await page.route("**/api/game/shop/purchase", async (route) => {
    purchaseRequests += 1;
    await purchaseGate.promise;
    await fulfillJson(route, {
      coins: gameState.coins,
      inventory: gameState.inventory,
      activeEquipment: gameState.activeEquipment,
    });
  });

  await waitForLakes(page, base);
  await page.getByRole("button", { name: "Shop", exact: true }).click();
  await page.waitForSelector(".shop-list .shop-item", { timeout: 10_000 });
  const purchase = page.locator(".shop-list .buy-btn").first();
  await purchase.click();
  await page.waitForSelector('.shop-feedback.is-loading', { timeout: 5_000 });

  check(
    "pending action exposes loading feedback",
    (await page.locator('.shop-feedback.is-loading').count()) === 1,
    "purchase feedback is loading",
  );
  check(
    "pending action disables controls semantically",
    (await page.locator('.shop-list button[disabled], .shop-list select[disabled]').count()) > 0 &&
      (await page.locator('.shop-list button[aria-disabled="true"], .shop-list select[aria-disabled="true"]').count()) > 0,
    "native disabled and aria-disabled controls present",
  );

  // dispatchEvent bypasses the browser's disabled-control behavior to prove the handler guard too.
  await purchase.dispatchEvent("click");
  check("duplicate purchase is ignored", purchaseRequests === 1, `${purchaseRequests} purchase request`);

  purchaseGate.release();
  await page.locator('.shop-feedback.is-ready').waitFor({ state: "visible", timeout: 10_000 });
  check("pending action clears after response", await purchase.isEnabled(), "purchase control re-enabled");
  await page.close();
}

async function verifySessionRecovery({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  let friendsAttempts = 0;
  let authAttempts = 0;

  await page.route("**/api/auth/dev", async (route) => {
    authAttempts += 1;
    await route.continue();
  });
  await page.route("**/api/game/friends", async (route) => {
    friendsAttempts += 1;
    if (friendsAttempts === 1) {
      await fulfillJson(route, apiError("Session expired.", "UNAUTHORIZED"), 401);
      return;
    }
    await route.continue();
  });

  await waitForLakes(page, base);
  const authAttemptsBeforeNavigation = authAttempts;
  await page.getByRole("button", { name: "Friends" }).click();
  await page.waitForSelector(".friends-screen", { timeout: 10_000 });
  check("expired session recovers once", authAttempts - authAttemptsBeforeNavigation === 1, `${authAttempts - authAttemptsBeforeNavigation} recovery auth request`);
  check("expired session retries the request", friendsAttempts === 2, `${friendsAttempts} friends requests`);
  await page.close();
}

async function verifySharedSessionRecovery({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const fixtures = await installDeterministicReadFixtures(page, { multipleEquipment: true });
  const firstUnauthorizedGate = deferred();
  const unauthorizedResponsesReady = deferred();
  let unauthorizedRequests = 0;
  let unauthorizedResponses = 0;
  let purchaseRequests = 0;
  let selectionRequests = 0;
  let authAttempts = 0;
  let actionsStarted = false;

  await page.route("**/api/auth/dev", async (route) => {
    authAttempts += 1;
    if (actionsStarted) await unauthorizedResponsesReady.promise;
    await route.continue();
  });
  await page.route("**/api/game/shop/purchase", async (route) => {
    purchaseRequests += 1;
    if (purchaseRequests === 1) {
      unauthorizedRequests += 1;
      if (unauthorizedRequests === 2) firstUnauthorizedGate.release();
      await firstUnauthorizedGate.promise;
      await fulfillJson(route, apiError("Purchase session expired.", "UNAUTHORIZED"), 401);
      unauthorizedResponses += 1;
      if (unauthorizedResponses === 2) {
        // Let both browser fetches reject and enter AuthenticatedClient's shared
        // recovery promise before the recovery response is allowed through.
        await new Promise((resolve) => setTimeout(resolve, 250));
        unauthorizedResponsesReady.release();
      }
      return;
    }
    const state = fixtures.getState();
    await fulfillJson(route, {
      coins: state?.coins ?? 999_999,
      inventory: state?.inventory,
      activeEquipment: state?.activeEquipment,
    });
  });
  await page.route("**/api/game/equipment/select", async (route) => {
    selectionRequests += 1;
    if (selectionRequests === 1) {
      unauthorizedRequests += 1;
      if (unauthorizedRequests === 2) firstUnauthorizedGate.release();
      await firstUnauthorizedGate.promise;
      await fulfillJson(route, apiError("Equipment session expired.", "UNAUTHORIZED"), 401);
      unauthorizedResponses += 1;
      if (unauthorizedResponses === 2) {
        // Let both browser fetches reject and enter AuthenticatedClient's shared
        // recovery promise before the recovery response is allowed through.
        await new Promise((resolve) => setTimeout(resolve, 250));
        unauthorizedResponsesReady.release();
      }
      return;
    }
    const state = fixtures.getState();
    await fulfillJson(route, {
      inventory: state?.inventory,
      activeEquipment: state?.activeEquipment,
    });
  });

  await waitForLakes(page, base);
  const state = fixtures.getState();
  if (!state) throw new Error("The deterministic game-state fixture did not initialize.");
  const authAttemptsBeforeActions = authAttempts;
  actionsStarted = true;
  await page.getByRole("button", { name: "Shop", exact: true }).click();
  await page.waitForSelector(".shop-list .shop-item", { timeout: 10_000 });
  const purchaseButton = page.locator(".shop-list .buy-btn").first();
  await purchaseButton.click();
  await page.getByRole("button", { name: "Lakes", exact: true }).click();
  await page.waitForSelector(".gear-dock", { timeout: 10_000 });
  const rodTile = page.locator('.gear-slot[data-equipment-type="rod"] .gear-tile').first();
  await rodTile.click();
  const rodOption = page.locator('.gear-slot[data-equipment-type="rod"] .equipment-option:not([aria-checked="true"])').first();
  if (await rodOption.count()) await rodOption.click();
  try {
    await waitUntil(() => purchaseRequests === 2 && selectionRequests === 2, 10_000);
  } catch (error) {
    throw new Error(`${String(error)} purchaseRequests=${purchaseRequests} selectionRequests=${selectionRequests} unauthorizedRequests=${unauthorizedRequests} authAttempts=${authAttempts}`);
  }

  check("concurrent 401s share one recovery", authAttempts - authAttemptsBeforeActions === 1, `${authAttempts - authAttemptsBeforeActions} recovery auth request for two expired operations`);
  check("each concurrent operation retries once", purchaseRequests === 2 && selectionRequests === 2, `${purchaseRequests} purchase and ${selectionRequests} equipment requests`);
  check("shared recovery has no third mutation attempt", purchaseRequests <= 2 && selectionRequests <= 2, "no automatic retry loop");
  await page.close();
}

async function verifySecondUnauthorizedFailure({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const fixtures = await installDeterministicReadFixtures(page);
  let friendsAttempts = 0;
  let authAttempts = 0;

  await page.route("**/api/auth/dev", async (route) => {
    authAttempts += 1;
    await route.continue();
  });
  await page.route("**/api/game/friends", async (route) => {
    friendsAttempts += 1;
    if (friendsAttempts <= 2) {
      await fulfillJson(route, apiError("The session is still expired.", "UNAUTHORIZED"), 401);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(leaderboardFixture()),
    });
  });

  await waitForLakes(page, base);
  const authAttemptsBeforeNavigation = authAttempts;
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByRole("button", { name: "Try again" }).waitFor({ state: "visible", timeout: 10_000 });
  check("second 401 surfaces retry UI", (await page.locator("[data-testid=retry-panel]").count()) === 1, "retry panel remains visible");
  check("second 401 does not start a loop", friendsAttempts === 2 && authAttempts - authAttemptsBeforeNavigation === 1, `${friendsAttempts} friends requests and ${authAttempts - authAttemptsBeforeNavigation} recovery auth request`);

  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForSelector(".friends-screen", { timeout: 10_000 });
  check("user retry recovers the second 401", friendsAttempts === 3 && (await page.locator(".friends-screen").count()) === 1, `${friendsAttempts} friends requests; friends screen rendered`);
  if (!fixtures.getState()) throw new Error("The deterministic fixture state was lost during session recovery.");
  await page.close();
}

async function verifyReloadInterruptedEncounter({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const fixtures = await installDeterministicReadFixtures(page);
  let activeAttempts = 0;
  let startAttempts = 0;

  await page.route("**/api/game/encounters/active", async (route) => {
    activeAttempts += 1;
    let state = fixtures.getState();
    if (!state) {
      await waitUntil(() => Boolean(fixtures.getState()), 10_000);
      state = fixtures.getState();
    }
    await fulfillJson(route, { encounter: activeEncounterFromState(state), expired: false });
  });
  await page.route("**/api/game/encounters", async (route) => {
    startAttempts += 1;
    await route.continue();
  });

  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.classList.contains("is-fighting"), null, { timeout: 20_000 });
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains("is-fighting"), null, { timeout: 20_000 });
  check("reload during fighting resumes the server encounter", activeAttempts >= 2 && (await page.locator("body.is-fighting").count()) === 1, `${activeAttempts} active-encounter reads; fight mode restored`);
  check("reload does not create a second encounter", startAttempts === 0, "no start encounter request");
  await page.close();
}

async function verifyCatchDecisionRetry({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const fixtures = await installDeterministicReadFixtures(page);
  let completionRequests = 0;
  let decisionRequests = 0;
  const decisionFailureGate = deferred();
  let encounter;

  await page.route("**/api/game/encounters", async (route) => {
    await fulfillJson(route, encounter);
  });

  await page.route("**/api/game/encounters/phase0-catch-encounter/complete", async (route) => {
    completionRequests += 1;
    const state = fixtures.getState();
    if (!state) throw new Error("The deterministic fixture state did not initialize.");
    await fulfillJson(route, completionResultFromState(state, { id: "phase0-catch" }));
  });
  await page.route("**/api/game/catches/phase0-catch/decision", async (route) => {
    decisionRequests += 1;
    if (decisionRequests === 1) {
      await decisionFailureGate.promise;
      await fulfillJson(route, apiError("The catch choice could not be saved."), 503);
      return;
    }
    const state = fixtures.getState();
    if (!state) throw new Error("The deterministic fixture state did not initialize.");
    await fulfillJson(route, {
      decision: "keep",
      coins: state.coins,
      catch: completionResultFromState(state).catch,
    });
  });

  await page.goto(`${base}/?telegramMock=ios&phase0=results`, { waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  const state = fixtures.getState();
  if (!state) throw new Error("The deterministic game-state fixture did not initialize.");
  encounter = activeEncounterFromState(state);
  encounter.encounterId = "phase0-catch-encounter";
  await page.locator('[data-testid="cast-cta"]').click();
  await page.waitForFunction(() => document.body.classList.contains("is-fighting"), null, { timeout: 10_000 });
  await page.evaluate(() => {
    const hook = window.__FISHING_REACT__;
    if (!hook) throw new Error("React result test hook is missing.");
    hook.emitFishingComplete({ encounterId: "phase0-catch-encounter", performance: 1 });
  });
  await page.waitForSelector("[data-testid=catch-decision]", { timeout: 10_000 });

  const keepChoice = page.locator("[data-testid=catch-decision] .keep-choice");
  await keepChoice.click();
  await page.locator("[data-testid=app-content][aria-busy=\"true\"]").waitFor({ state: "visible", timeout: 5_000 });
  check("catch decision has native pending state", await keepChoice.getAttribute("disabled") !== null && (await keepChoice.getAttribute("aria-disabled")) === "true", "Keep is disabled natively and semantically");
  await keepChoice.dispatchEvent("click");
  check("duplicate catch decision is ignored", decisionRequests === 1, `${decisionRequests} decision request while first is pending`);

  decisionFailureGate.release();
  await page.getByRole("button", { name: "Retry choice" }).waitFor({ state: "visible", timeout: 10_000 });
  check("catch decision failure exposes explicit retry", (await page.locator("[data-testid=retry-panel]").textContent()).includes("still waiting"), "retry explains the pending catch");
  await page.getByRole("button", { name: "Retry choice" }).click();
  await page.getByText("Fish kept", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "Fish again", exact: true }).click();
  await page.waitForSelector(".locations-list .location-card", { timeout: 10_000 });
  check("catch decision retry succeeds once", decisionRequests === 2 && completionRequests === 1 && (await page.locator(".locations-list .location-card").count()) > 0, `${decisionRequests} decision requests; one completion; lakes restored after receipt`);
  await page.close();
}

async function verifySellAllPartialReconciliation({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const fixtures = await installDeterministicReadFixtures(page);
  let collectionRequests = 0;
  let sellRequests = 0;
  let specimens;

  await page.route("**/api/game/collection", async (route) => {
    collectionRequests += 1;
    const state = fixtures.getState();
    if (!state) {
      await route.continue();
      return;
    }
    specimens ??= collectionFromState(state, { count: 2 }).fish;
    const fish = collectionRequests >= 3 ? [specimens[1]] : specimens;
    await fulfillJson(route, { fish });
  });
  await page.route("**/api/game/catches/phase0-collection-1/sell", async (route) => {
    sellRequests += 1;
    await fulfillJson(route, { coins: 1_000_041, catch: specimens?.[0] });
  });
  await page.route("**/api/game/catches/phase0-collection-2/sell", async (route) => {
    sellRequests += 1;
    await fulfillJson(route, apiError("The second sale timed out."), 503);
  });

  await waitForLakes(page, base);
  await page.getByRole("button", { name: "Collection" }).click();
  await page.waitForSelector("[data-testid=collection-screen]", { timeout: 10_000 });
  const sellAll = page.locator(".collection-actions .secondary-action").first();
  await sellAll.click();
  await page.locator(".collection-actions .is-confirming").waitFor({ state: "visible", timeout: 5_000 });
  const confirmationBounds = await page.locator(".collection-actions .is-confirming").boundingBox();
  const tabbarBounds = await page.locator(".tabbar").boundingBox();
  check("sell-all confirmation clears the tab bar", Boolean(confirmationBounds && tabbarBounds && confirmationBounds.y + confirmationBounds.height <= tabbarBounds.y), `confirmation bottom ${confirmationBounds ? (confirmationBounds.y + confirmationBounds.height).toFixed(1) : "missing"} vs tabbar top ${tabbarBounds?.y?.toFixed(1) ?? "missing"}`);

  const confirmingSellAll = page.locator(".collection-actions .is-confirming");
  await confirmingSellAll.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await waitUntil(() => collectionRequests >= 3 && sellRequests >= 2, 10_000);
  await waitUntil(async () => (await page.locator(".collection-card").count()) === 1, 10_000);
  await page.locator('.collection-feedback.is-ready').waitFor({ state: "visible", timeout: 10_000 });
  const status = await page.locator('.collection-feedback.is-ready').textContent();
  check("sell-all stops after the failed specimen", sellRequests === 2, `${sellRequests} sequential sell requests for two specimens`);
  check("sell-all reconciles partial success", collectionRequests === 3 && /Sold 1 of 2 fish for 42 coins/.test(status ?? ""), `${collectionRequests} collection reads; status "${status?.trim()}"`);
  check("sell-all duplicate invocation is ignored", collectionRequests === 3 && sellRequests === 2, "one before snapshot and one final reconciliation");
  await page.close();
}

async function verifyEncounterStartup({ browser, base, check, recordConsoleError, expired }) {
  const page = await createPage(browser, recordConsoleError);
  let gameState;
  const gameStateReady = deferred();

  await page.route("**/api/game/state", async (route) => {
    try {
      const response = await route.fetch();
      gameState = await response.json();
      gameStateReady.release();
      await fulfillJson(route, gameState);
    } catch (error) {
      if (error instanceof Error && /context disposed|target closed|request was aborted/i.test(error.message)) return;
      throw error;
    }
  });
  await page.route("**/api/game/encounters/active", async (route) => {
    try {
      if (!expired) await gameStateReady.promise;
      await fulfillJson(route, expired ? { encounter: null, expired: true } : { encounter: activeEncounterFromState(gameState), expired: false });
    } catch (error) {
      if (error instanceof Error && /context disposed|target closed|request was aborted/i.test(error.message)) return;
      throw error;
    }
  });

  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  if (expired) {
    await page.waitForFunction(() => document.querySelector('.toast[data-state="error"]')?.textContent?.includes("previous fishing encounter expired") ?? false, null, { timeout: 20_000 });
    check("expired encounter is explained", (await page.locator('.toast[data-state="error"]').textContent()).includes("previous fishing encounter expired"), "expired encounter message shown");
    const toastBounds = await page.locator(".toast").boundingBox();
    const topbarBounds = await page.locator(".app-topbar").boundingBox();
    const tabbarBounds = await page.locator(".tabbar").boundingBox();
    check(
      "status toast sits below the topbar",
      Boolean(toastBounds && topbarBounds && toastBounds.y >= topbarBounds.y + topbarBounds.height),
      `toast top ${toastBounds?.y?.toFixed(1)} vs topbar bottom ${topbarBounds ? (topbarBounds.y + topbarBounds.height).toFixed(1) : "missing"}`,
    );
    check(
      "status toast clears the bottom chrome",
      Boolean(toastBounds && tabbarBounds && toastBounds.y + toastBounds.height <= tabbarBounds.y),
      `toast bottom ${toastBounds ? (toastBounds.y + toastBounds.height).toFixed(1) : "missing"} vs tabbar top ${tabbarBounds?.y?.toFixed(1)}`,
    );
  } else {
    await page.waitForFunction(() => document.body.classList.contains("is-fighting"), null, { timeout: 20_000 });
    check("active encounter resumes after reload", await page.locator("body.is-fighting").count() === 1, "fight mode restored");
    check("active encounter shows resume state", (await page.locator('.toast[data-state="ready"]').textContent()).includes("Resuming your active encounter"), "resume toast shown");
  }
  await page.close();
}

export async function verifyAsyncFlows({ browser, base, check, recordConsoleError }) {
  await verifyFailedNavigation({ browser, base, check, recordConsoleError });
  await verifyLatestNavigation({ browser, base, check, recordConsoleError });
  await verifyPendingPurchase({ browser, base, check, recordConsoleError });
  await verifySessionRecovery({ browser, base, check, recordConsoleError });
  await verifySharedSessionRecovery({ browser, base, check, recordConsoleError });
  await verifySecondUnauthorizedFailure({ browser, base, check, recordConsoleError });
  await verifyCatchDecisionRetry({ browser, base, check, recordConsoleError });
  await verifySellAllPartialReconciliation({ browser, base, check, recordConsoleError });
  await verifyEncounterStartup({ browser, base, check, recordConsoleError, expired: false });
  await verifyEncounterStartup({ browser, base, check, recordConsoleError, expired: true });
  await verifyReloadInterruptedEncounter({ browser, base, check, recordConsoleError });
}
