import { activeEncounterFromState, apiError, deferred } from "./fixtures/async-flows.mjs";

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

  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForSelector(".friends-screen", { timeout: 10_000 });
  check("screen retry succeeds", (await page.locator(".friends-screen").count()) === 1, "friends screen rendered");
  await page.close();
}

async function verifyLatestNavigation({ browser, base, check, recordConsoleError }) {
  const page = await createPage(browser, recordConsoleError);
  const friendsGate = deferred();
  let friendsAborted = false;

  await page.route("**/api/game/friends", async (route) => {
    try {
      await friendsGate.promise;
      await route.continue();
    } catch {
      friendsAborted = true;
    }
  });

  await waitForLakes(page, base);
  await page.getByRole("button", { name: "Friends" }).click();
  await page.waitForSelector(".fishing-status.is-loading", { timeout: 5_000 });
  check("navigation shows loading screen", (await page.locator(".fishing-status.is-loading").count()) === 1, "loading panel rendered");

  await page.getByRole("button", { name: "Collection" }).click();
  await page.waitForSelector(".collection-screen", { timeout: 10_000 });
  friendsGate.release();
  await page.waitForTimeout(150);

  check(
    "latest navigation wins",
    (await page.locator(".collection-screen").count()) === 1 && (await page.locator(".friends-screen").count()) === 0,
    friendsAborted ? "stale friends request aborted" : "stale friends response ignored",
  );
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
  await page.waitForSelector('.app-content[aria-busy="true"]', { timeout: 5_000 });

  check(
    "pending action marks content busy",
    (await page.locator('.app-content[aria-busy="true"]').count()) === 1,
    "aria-busy=true",
  );
  check(
    "pending action disables controls semantically",
    (await page.locator('.app-content[aria-busy="true"] button[disabled], .app-content[aria-busy="true"] select[disabled]').count()) > 0 &&
      (await page.locator('.app-content[aria-busy="true"] button[aria-disabled="true"], .app-content[aria-busy="true"] select[aria-disabled="true"]').count()) > 0,
    "native disabled and aria-disabled controls present",
  );

  // dispatchEvent bypasses the browser's disabled-control behavior to prove the handler guard too.
  await purchase.dispatchEvent("click");
  check("duplicate purchase is ignored", purchaseRequests === 1, `${purchaseRequests} purchase request`);

  purchaseGate.release();
  await page.waitForFunction(() => document.querySelector("game-app")?.shadowRoot?.querySelector(".app-content")?.getAttribute("aria-busy") === "false", null, { timeout: 10_000 });
  check("pending action clears after response", await page.locator('.app-content[aria-busy="false"]').count() === 1, "aria-busy=false");
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

async function verifyEncounterStartup({ browser, base, check, recordConsoleError, expired }) {
  const page = await createPage(browser, recordConsoleError);
  let gameState;

  await page.route("**/api/game/state", async (route) => {
    const response = await route.fetch();
    gameState = await response.json();
    await fulfillJson(route, gameState);
  });
  await page.route("**/api/game/encounters/active", async (route) => {
    await fulfillJson(route, expired ? { encounter: null, expired: true } : { encounter: activeEncounterFromState(gameState), expired: false });
  });

  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  if (expired) {
    await page.waitForFunction(() => {
      const app = document.querySelector("game-app")?.shadowRoot;
      const toast = app?.querySelector("status-toast")?.shadowRoot?.querySelector(".toast[data-state=ready]");
      return toast?.textContent?.includes("interrupted fishing attempt expired") ?? false;
    }, null, { timeout: 20_000 });
    check("expired encounter is explained", (await page.locator('.toast[data-state="ready"]').textContent()).includes("interrupted fishing attempt expired"), "expired encounter message shown");
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
    check("active encounter shows resume state", (await page.locator('.toast[data-state="loading"]').textContent()).includes("Resuming your fishing attempt"), "resume toast shown");
  }
  await page.close();
}

export async function verifyAsyncFlows({ browser, base, check, recordConsoleError }) {
  await verifyFailedNavigation({ browser, base, check, recordConsoleError });
  await verifyLatestNavigation({ browser, base, check, recordConsoleError });
  await verifyPendingPurchase({ browser, base, check, recordConsoleError });
  await verifySessionRecovery({ browser, base, check, recordConsoleError });
  await verifyEncounterStartup({ browser, base, check, recordConsoleError, expired: false });
  await verifyEncounterStartup({ browser, base, check, recordConsoleError, expired: true });
}
