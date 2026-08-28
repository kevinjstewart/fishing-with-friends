// Layout verification for the redesigned main screen + shop.
// Requires the Vite + Cloudflare Worker dev server running on :5173.
// Covers iPhone portrait, Android portrait, landscape, and short-height mobile
// viewports with deterministic external-image and accessibility fixtures.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyAsyncFlows } from "./verify-async.mjs";
import { completionResultFromState, decisionResultFromState, installDeterministicReadFixtures } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const ARTIFACT_DIR = resolve(process.env.PHASE0_ARTIFACT_DIR ?? "/tmp/fishing-with-friends-phase0");
await mkdir(ARTIFACT_DIR, { recursive: true });
const failures = [];
const report = [];
const measurements = [];
const viewportBaselines = [];
const stylesSource = await readFile(new URL("../apps/game/src/styles.css", import.meta.url), "utf8");
const viewportScenarios = [
  { name: "iPhone portrait", mock: "ios", viewport: { width: 393, height: 852 }, expectedGap: 10 },
  { name: "Android portrait", mock: "android", viewport: { width: 412, height: 915 }, expectedGap: 10 },
  { name: "iPhone landscape", mock: "landscape", viewport: { width: 852, height: 393 }, expectedGap: 2 },
  { name: "short-height portrait", mock: "ios", viewport: { width: 393, height: 640 }, expectedGap: 10 },
];
const screenBaselines = [
  { id: "lakes", label: "Lakes", selector: "[data-testid=lakes-screen]", lastSelector: ".locations-list .location-card" },
  { id: "shop", label: "Shop", selector: "[data-testid=shop-screen]", lastSelector: ".shop-list .shop-item" },
  { id: "collection", label: "Collection", selector: "[data-testid=collection-screen]", lastSelector: ".collection-grid .collection-card" },
  { id: "journal", label: "Journal", selector: "[data-testid=journal-screen]", lastSelector: ".journal-grid .journal-card" },
  { id: "friends", label: "Friends", selector: "[data-testid=friends-screen]", lastSelector: ".crew-row" },
];

function check(label, condition, detail) {
  report.push(`${condition ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!condition) failures.push(`${label}: ${detail}`);
}

function recordMeasurement(label, value) {
  measurements.push({ label, value });
  report.push(`MEASURE  ${label}  ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

function screenshotPath(name) {
  return join(ARTIFACT_DIR, `${name}.png`);
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function rectOf(page, selector) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });
}

function attachConsoleListeners(page, recordConsoleError) {
  page.on("console", (message) => {
    if (message.type() === "error") recordConsoleError(message.text());
  });
  page.on("pageerror", (error) => recordConsoleError(String(error)));
}

async function verifyViewportChrome({ browser, base, check, recordConsoleError }) {
  for (const scenario of viewportScenarios) {
    const page = await browser.newPage({
      viewport: scenario.viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    attachConsoleListeners(page, recordConsoleError);
    await installDeterministicReadFixtures(page);
    await page.goto(`${base}/?telegramMock=${scenario.mock}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });

    const viewport = page.viewportSize();
    for (const screen of screenBaselines) {
      if (screen.id !== "lakes") {
        await page.getByRole("button", { name: screen.label, exact: true }).tap();
        await page.waitForSelector(screen.selector, { timeout: 15_000 });
      }
      await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, 0));
      await page.waitForTimeout(80);

      const topbar = await rectOf(page, ".app-topbar");
      const firstControl = await rectOf(page, screen.id === "lakes" || screen.id === "shop" ? ".screen-hero" : ".dashboard-header");
      const tabbar = await rectOf(page, ".tabbar");
      const scrollRange = await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollHeight - element.clientHeight);
      await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await page.waitForTimeout(180);
      const lastContent = await rectOf(page, `${screen.lastSelector} >> nth=-1`);
      const castBar = screen.id === "lakes" ? await rectOf(page, ".cast-bar") : undefined;
      const gapToFixedChrome = castBar ? castBar.top - lastContent.bottom : tabbar.top - lastContent.bottom;
      const heroGap = firstControl.top - topbar.bottom;

      check(
        `${scenario.name} ${screen.label}: tabbar stays inside viewport`,
        Boolean(viewport && tabbar.bottom <= viewport.height + 1),
        `tabbar bottom ${tabbar.bottom.toFixed(1)} vs viewport ${viewport?.height ?? 0}`,
      );
      check(
        `${scenario.name} ${screen.label}: full-range scroll clears fixed chrome`,
        gapToFixedChrome >= -2,
        `last content bottom ${lastContent.bottom.toFixed(1)} vs ${castBar ? "cast bar" : "tabbar"} top ${(castBar ?? tabbar).top.toFixed(1)}`,
      );
      if (castBar) {
        check(
          `${scenario.name}: cast bar clears tabbar`,
          Math.abs(tabbar.top - castBar.bottom - scenario.expectedGap) < 3,
          `gap ${(tabbar.top - castBar.bottom).toFixed(1)}px (expected ${scenario.expectedGap})`,
        );
        check(
          `${scenario.name}: cast bar stays within safe horizontal bounds`,
          Boolean(viewport && castBar.left >= 0 && castBar.right <= viewport.width),
          `cast bar spans ${castBar.left.toFixed(1)}–${castBar.right.toFixed(1)} of ${viewport?.width ?? 0}`,
        );
      }
      recordMeasurement(`${scenario.name} ${screen.label} baseline`, {
        viewport,
        scrollRange,
        topbar,
        firstControl,
        castBar,
        tabbar,
        lastContent,
        gaps: {
          topbarToFirstControl: heroGap,
          lastContentToFixedChrome: gapToFixedChrome,
          castBarToTabbar: castBar ? tabbar.top - castBar.bottom : null,
        },
      });
    }
    await page.close();
  }
}

async function verifyFishImageResilience({ browser, base, check }) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  let gameState;
  let apiAttempts = 0;
  let imageAttempts = 0;

  await page.route("**/api/game/state", async (route) => {
    const response = await route.fetch();
    gameState = await response.json();
    await route.fulfill({ status: response.status(), headers: { "content-type": "application/json" }, body: JSON.stringify(gameState) });
  });
  await page.route("**/api/game/collection", async (route) => {
    const species = gameState.catalog.fish[0];
    const location = gameState.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fish: [{
          id: "image-resilience-fixture",
          speciesId: species.id,
          species,
          weightKg: species.typicalWeightKg,
          lengthCm: species.typicalLengthCm,
          quality: "good",
          saleValueCoins: species.baseValueCoins,
          caughtAt: new Date().toISOString(),
          locationId: location.id,
          locationName: location.name,
        }],
      }),
    });
  });
  await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
    apiAttempts += 1;
    if (apiAttempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary outage" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ query: { pages: [{ thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/fixture-fish.jpg" } }] } }),
    });
  });
  await page.route("https://upload.wikimedia.org/**", async (route) => {
    imageAttempts += 1;
    await route.abort("failed");
  });

  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Collection", exact: true }).tap();
  await page.waitForSelector(".collection-screen .fish-image", { timeout: 10_000 });
  await page.locator('.fish-image[data-image-state="unavailable"]').first().waitFor({ timeout: 15_000 });

  check("fish image API retries a transient failure", apiAttempts === 2, `${apiAttempts} API attempts`);
  check("fish image load retries a failed external image", imageAttempts >= 2, `${imageAttempts} image attempts`);
  check(
    "failed fish images settle on an explicit fallback",
    (await page.locator('.fish-image[data-image-state="unavailable"] .fish-image-placeholder').textContent()) === "Photo unavailable",
    "placeholder remains readable",
  );
  await page.close();
}

async function verifyAccessibilityModes({ browser, base, check, recordConsoleError }) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  attachConsoleListeners(page, recordConsoleError);
  try {
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  } catch (error) {
    report.push(`SKIP  accessibility media emulation  (${String(error)})`);
    await page.close();
    return;
  }
  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  const styles = {
    forcedColors: await page.evaluate(() => window.matchMedia("(forced-colors: active)").matches),
    animationName: await page.locator(".screen").first().evaluate((element) => getComputedStyle(element).animationName),
    castShadow: await page.locator(".cast-bar").first().evaluate((element) => getComputedStyle(element).boxShadow),
  };
  check("reduced-motion disables screen transitions", styles.animationName === "none", `animation-name ${styles.animationName}`);
  check("forced-colors mode is active", styles.forcedColors, "forced-colors media query matched");
  check("forced-colors removes decorative cast shadow", styles.castShadow === "none", `cast bar shadow ${styles.castShadow}`);
  await page.close();
}

async function verifyToastAndStyleIsolation({ page, check }) {
  const readToastLayout = () => page.locator(".app-content").evaluate((element) => {
    const frame = element.closest(".app-frame");
    const contentStyles = getComputedStyle(element);
    return {
      paddingTop: Number.parseFloat(contentStyles.paddingTop),
      frameToastVisible: frame?.dataset.toastVisible ?? "missing",
      toastHostHidden: document.querySelector(".status-toast-host")?.hasAttribute("hidden") ?? false,
    };
  });

  // A fresh bootstrap in development produces a short-lived status toast.
  // Measure it before and after React clears it rather than reaching into a
  // component instance or dispatching an application-wide event.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  await page.locator(".toast").waitFor({ state: "visible", timeout: 5_000 });
  const visible = await readToastLayout();
  await page.locator('.status-toast-host[hidden]').waitFor({ state: "attached", timeout: 8_000 });
  const hidden = await readToastLayout();
  const expectedReserve = page.viewportSize()?.height && page.viewportSize().height <= 640 ? 56 : 64;
  check("visible toast reserves the expected layout space", visible.paddingTop - hidden.paddingTop === expectedReserve && visible.frameToastVisible === "true" && !visible.toastHostHidden, `${JSON.stringify(visible)}; delta ${(visible.paddingTop - hidden.paddingTop).toFixed(1)}px expected ${expectedReserve}px`);
  check("hidden toast reserves zero layout space", hidden.paddingTop === 4 && hidden.frameToastVisible === "false" && hidden.toastHostHidden, JSON.stringify(hidden));

  const isolation = await page.evaluate(() => {
    const shell = document.querySelector(".react-app-shell");
    return {
      oneReactRoot: document.querySelectorAll("#react-root").length === 1,
      oneReactSurface: document.querySelectorAll(".react-app-shell").length === 1,
      chromeInsideReactShell: Boolean(shell?.querySelector(".app-topbar") && shell.querySelector(".tabbar") && shell.querySelector(".status-toast-host")),
      noCustomElements: !Array.from(document.querySelectorAll("*")).some((element) => element.tagName.includes("-")),
    };
  });
  check("React chrome stays within one isolated application surface", Object.values(isolation).every(Boolean), JSON.stringify(isolation));
}

async function verifyLandscapeScreens({ browser, base, check, recordConsoleError }) {
  const page = await browser.newPage({
    viewport: { width: 852, height: 393 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  attachConsoleListeners(page, recordConsoleError);
  await page.goto(`${base}/?telegramMock=landscape`, { waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });

  const screens = [
    { label: "Shop", selector: ".shop-list .shop-item" },
    { label: "Collection", selector: ".collection-screen" },
    { label: "Journal", selector: ".journal-grid .journal-card" },
    { label: "Friends", selector: ".friends-screen" },
  ];
  for (const screen of screens) {
    await page.getByRole("button", { name: screen.label, exact: true }).tap();
    await page.waitForSelector(screen.selector, { timeout: 15_000 });
    await page.locator(".app-content").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(180);
    const last = await rectOf(page, `${screen.selector} >> nth=-1`);
    const tabbar = await rectOf(page, ".tabbar");
    const contentOverflow = await page.locator(".app-content").evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    check(`${screen.label} landscape scroll clears fixed chrome`, last.bottom <= tabbar.top + 2, `last ${last.bottom.toFixed(1)} vs tabbar top ${tabbar.top.toFixed(1)}`);
    check(`${screen.label} landscape has no horizontal content overflow`, !contentOverflow, `scrollWidth overflow ${contentOverflow}`);
  }
  await page.close();
}

async function verifyGearSelector({ browser, base, check, recordConsoleError }) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on("console", (message) => {
    if (message.type() === "error") recordConsoleError(message.text());
  });
  page.on("pageerror", (error) => recordConsoleError(String(error)));
  await page.route("**/api/game/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    if (!state.inventory.baits.some((bait) => bait.id === "sweet-corn" && bait.quantity > 0)) {
      state.inventory.baits.push({ id: "sweet-corn", quantity: 3, durability: null });
    }
    await route.fulfill({
      status: response.status(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  });

  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  const baitTile = page.locator('.gear-slot[data-equipment-type="bait"] .gear-tile').first();
  await baitTile.waitFor({ state: "visible", timeout: 20_000 });
  check("gear selector exposes expanded state", (await baitTile.getAttribute("aria-expanded")) === "false", "collapsed before tap");
  await baitTile.tap();
  await page.locator('.gear-slot[data-equipment-type="bait"] .equipment-options:not([hidden])').waitFor({ state: "visible", timeout: 5_000 });
  check("gear selector opens on tap", (await page.locator(".equipment-options:not([hidden])").count()) === 1, "one menu open");
  check(
    "gear selector keeps full mobile names",
    (await page.locator(".equipment-options:not([hidden]) .equipment-option-name").allTextContents()).includes("Sweet Corn"),
    "full option name rendered",
  );
  const optionClipping = await page.locator(".equipment-options:not([hidden]) .equipment-option-name").evaluateAll((elements) =>
    elements.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).length,
  );
  check("gear selector does not clip equipment names", optionClipping === 0, `${optionClipping} clipped names`);

  await page.locator(".screen-hero").tap();
  check("gear selector dismisses outside tap", (await page.locator(".equipment-options:not([hidden])").count()) === 0, "menu closed");
  await baitTile.tap();
  await page.keyboard.press("Escape");
  check("gear selector dismisses with Escape", (await page.locator(".equipment-options:not([hidden])").count()) === 0, "menu closed");
  await page.close();
}

async function verifyCatchResults({ browser, base, check, recordConsoleError }) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  attachConsoleListeners(page, recordConsoleError);
  await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query: { pages: [] } }) });
  });
  await page.goto(`${base}/?telegramMock=ios`, { waitUntil: "networkidle" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  const state = await page.evaluate(async () => {
    const token = sessionStorage.getItem("fishing-with-friends.session");
    const response = await fetch("/api/game/state", { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  });

  const renderResult = async ({ outcome = "caught", rodBroke = false } = {}) => {
    await page.evaluate(async ({ state, outcome, rodBroke }) => {
      const fixture = await import("/src/test/render-fixture.tsx");
      fixture.renderEncounterFixture({ gameState: state, view: outcome === "lost" ? "lost" : rodBroke ? "broken-rod" : "catch", resultOptions: { outcome, rodBroke } });
    }, { state, outcome, rodBroke });
  };

  await renderResult();
  await page.waitForSelector(".catch-reveal");
  check("catch result leads with trophy reveal", (await page.locator(".catch-reveal .catch-hero-image").count()) === 1, "fish reveal rendered");
  check("catch result shows three primary stats", (await page.locator(".catch-specimen .stat-chip").count()) === 3, "weight, length, and value visible");
  check("catch result makes sell value prominent", (await page.locator("[data-testid=catch-sale-value]").count()) === 1 && /184/.test(await page.locator("[data-testid=catch-sale-value]").textContent()), "sell value badge shows +184 coins");
  const catchVisual = await rectOf(page, ".catch-visual");
  const sellValueBadge = await rectOf(page, "[data-testid=catch-sale-value]");
  const catchQuality = await rectOf(page, ".catch-quality");
  recordMeasurement("catch result sell value badge", {
    width: sellValueBadge.width,
    height: sellValueBadge.height,
    left: sellValueBadge.left,
    top: sellValueBadge.top,
  });
  check("sell value badge stays inside catch image", sellValueBadge.left >= catchVisual.left && sellValueBadge.right <= catchVisual.right && sellValueBadge.top >= catchVisual.top && sellValueBadge.bottom <= catchVisual.bottom, `badge ${sellValueBadge.left.toFixed(1)}–${sellValueBadge.right.toFixed(1)} × ${sellValueBadge.top.toFixed(1)}–${sellValueBadge.bottom.toFixed(1)} inside image`);
  check("sell value badge clears quality badge", !rectsOverlap(sellValueBadge, catchQuality), "top-right payout badge does not overlap bottom-left quality badge");
  check("catch result presents keep and sell equally", (await page.locator(".catch-choice").count()) === 2, "two decision cards rendered");
  check("catch result keeps tackle report collapsed", !(await page.locator(".result-risk").getAttribute("open")), "low-risk report collapsed");
  const catchTabbar = await rectOf(page, ".tabbar");
  const initialDecision = await rectOf(page, ".catch-decision");
  const decisionStyles = await page.locator(".catch-decision").evaluate((element) => {
    return {
      position: getComputedStyle(element).position,
      bottom: getComputedStyle(element).bottom,
      parentTransform: element.parentElement ? getComputedStyle(element.parentElement).transform : "none",
      parentAnimation: element.parentElement ? getComputedStyle(element.parentElement).animationName : "none",
    };
  });
  recordMeasurement("catch result decision to tabbar", catchTabbar.top - initialDecision.bottom);
  check("catch decision is immediately visible", initialDecision.top >= 0 && initialDecision.bottom <= catchTabbar.top + 2, `decision ${initialDecision.top.toFixed(1)}–${initialDecision.bottom.toFixed(1)} vs tabbar top ${catchTabbar.top.toFixed(1)}; ${JSON.stringify(decisionStyles)}`);
  await page.screenshot({ path: screenshotPath("layout-catch-result-top") });
  await page.locator(".app-content").evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.waitForTimeout(180);
  const sellChoice = await rectOf(page, ".sell-choice");
  check("catch decisions clear bottom chrome", sellChoice.bottom <= catchTabbar.top + 2, `decision bottom ${sellChoice.bottom.toFixed(1)} vs tabbar top ${catchTabbar.top.toFixed(1)}`);
  await page.screenshot({ path: screenshotPath("layout-catch-result") });

  await renderResult({ rodBroke: true });
  check("broken rod report opens automatically", (await page.locator(".result-risk").getAttribute("open")) !== null, "action-needed report expanded");
  check("broken rod report names replacement", /equipped now|claim a free/i.test(await page.locator(".tackle-report-body").textContent()), "recovery path visible");

  await renderResult({ outcome: "lost" });
  check("lost result has a focused retry state", (await page.locator(".lost-reveal").count()) === 1 && (await page.locator(".retry-cast").count()) === 1, "lost reveal and retry rendered");
  await page.close();
}

async function verifyResultViewportBaselines({ browser, base, check, recordConsoleError }) {
  for (const scenario of viewportScenarios) {
    const page = await browser.newPage({
      viewport: scenario.viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    attachConsoleListeners(page, recordConsoleError);
    const fixtures = await installDeterministicReadFixtures(page);
    await page.goto(`${base}/?telegramMock=${scenario.mock}&phase0=results`, { waitUntil: "networkidle" });
    await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
    const state = fixtures.getState();
    if (!state) throw new Error("The deterministic result fixture did not initialize.");

    const showFishingResult = async (result) => {
      await page.evaluate(async ({ gameState, result }) => {
        const fixture = await import("/src/test/render-fixture.tsx");
        fixture.renderEncounterFixture({ gameState, view: result.catch ? "catch" : "lost", result });
      }, { gameState: state, result });
      await page.waitForSelector("[data-testid=catch-result]", { timeout: 10_000 });
    };

    await showFishingResult(completionResultFromState(state));
    const topbar = await rectOf(page, ".app-topbar");
    const tabbar = await rectOf(page, ".tabbar");
    const catchResultTop = await rectOf(page, "[data-testid=catch-result]");
    const catchVisual = await rectOf(page, ".catch-visual");
    const saleValue = await rectOf(page, "[data-testid=catch-sale-value]");
    const catchQuality = await rectOf(page, ".catch-quality");
    const catchDecision = await rectOf(page, "[data-testid=catch-decision]");
    const resultScrollRange = await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollHeight - element.clientHeight);
    check(
      `${scenario.name}: catch decision keeps the expected dock gap`,
      Math.abs(tabbar.top - catchDecision.bottom - 10) < 3,
      `gap ${(tabbar.top - catchDecision.bottom).toFixed(1)}px (expected 10)`,
    );
    check(
      `${scenario.name}: result payout badges stay inside the visual`,
      saleValue.left >= catchVisual.left && saleValue.right <= catchVisual.right && !rectsOverlap(saleValue, catchQuality),
      `payout ${saleValue.left.toFixed(1)}–${saleValue.right.toFixed(1)}; visual ${catchVisual.left.toFixed(1)}–${catchVisual.right.toFixed(1)}`,
    );
    await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(120);
    const catchResultBottom = await rectOf(page, "[data-testid=catch-result]");
    check(
      `${scenario.name}: scrolled catch result clears bottom chrome`,
      catchResultBottom.bottom <= tabbar.top + 2,
      `result bottom ${catchResultBottom.bottom.toFixed(1)} vs tabbar top ${tabbar.top.toFixed(1)}`,
    );
    const catchBaseline = {
      viewport: scenario.viewport,
      topbar,
      tabbar,
      result: catchResultTop,
      catchDecision,
      catchVisual,
      saleValue,
      catchQuality,
      scrollRange: resultScrollRange,
      scrolledResult: catchResultBottom,
      gaps: {
        decisionToTabbar: tabbar.top - catchDecision.bottom,
        scrolledResultToTabbar: tabbar.top - catchResultBottom.bottom,
      },
    };
    recordMeasurement(`${scenario.name} catch result baseline`, catchBaseline);

    await showFishingResult(completionResultFromState(state, { outcome: "lost" }));
    await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, 0));
    const lostRetryAtTop = await rectOf(page, ".retry-cast");
    const lostResultAtTop = await rectOf(page, "[data-testid=catch-result]");
    await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(120);
    const lostRetry = await rectOf(page, ".retry-cast");
    const lostResult = await rectOf(page, "[data-testid=catch-result]");
    check(
      `${scenario.name}: loss retry action clears bottom chrome`,
      lostRetry.bottom <= tabbar.top + 2,
      `retry bottom ${lostRetry.bottom.toFixed(1)} vs tabbar top ${tabbar.top.toFixed(1)}`,
    );
    recordMeasurement(`${scenario.name} loss result baseline`, {
      resultAtTop: lostResultAtTop,
      retryAtTop: lostRetryAtTop,
      resultAtFullScroll: lostResult,
      retryAtFullScroll: lostRetry,
      tabbar,
      gaps: {
        initialRetryToTabbar: tabbar.top - lostRetryAtTop.bottom,
        fullScrollRetryToTabbar: tabbar.top - lostRetry.bottom,
      },
    });

    await page.evaluate(async ({ gameState, result }) => {
      const fixture = await import("/src/test/render-fixture.tsx");
      fixture.renderEncounterFixture({ gameState, view: result.decision === "sell" ? "decision-sell" : "decision-keep", decision: result });
    }, { gameState: state, result: decisionResultFromState(state, "keep") });
    await page.waitForSelector("[data-testid=decision-result]", { timeout: 10_000 });
    await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, 0));
    const decisionResultAtTop = await rectOf(page, "[data-testid=decision-result]");
    const continueActionAtTop = await rectOf(page, ".decision-continue");
    await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(120);
    const decisionResult = await rectOf(page, "[data-testid=decision-result]");
    const continueAction = await rectOf(page, ".decision-continue");
    check(
      `${scenario.name}: decision receipt action clears bottom chrome`,
      continueAction.bottom <= tabbar.top + 2,
      `continue bottom ${continueAction.bottom.toFixed(1)} vs tabbar top ${tabbar.top.toFixed(1)}`,
    );
    recordMeasurement(`${scenario.name} decision result baseline`, {
      resultAtTop: decisionResultAtTop,
      continueActionAtTop: continueActionAtTop,
      resultAtFullScroll: decisionResult,
      continueActionAtFullScroll: continueAction,
      tabbar,
      gaps: {
        initialContinueToTabbar: tabbar.top - continueActionAtTop.bottom,
        fullScrollContinueToTabbar: tabbar.top - continueAction.bottom,
      },
    });

    await page.evaluate(async (gameState) => {
      const fixture = await import("/src/test/render-fixture.tsx");
      fixture.renderEncounterFixture({ gameState, view: "retry" });
    }, state);
    await page.waitForSelector("[data-testid=retry-panel]", { timeout: 10_000 });
    const retryPanel = await rectOf(page, "[data-testid=retry-panel]");
    check(
      `${scenario.name}: retry panel clears fixed chrome`,
      retryPanel.top >= topbar.bottom - 1 && retryPanel.bottom <= tabbar.top + 2,
      `retry ${retryPanel.top.toFixed(1)}–${retryPanel.bottom.toFixed(1)} between ${topbar.bottom.toFixed(1)} and ${tabbar.top.toFixed(1)}`,
    );
    recordMeasurement(`${scenario.name} retry panel baseline`, {
      retryPanel,
      topbar,
      tabbar,
      gaps: {
        topbarToRetry: retryPanel.top - topbar.bottom,
        retryToTabbar: tabbar.top - retryPanel.bottom,
      },
    });

    viewportBaselines.push({
      scenario: scenario.name,
      viewport: scenario.viewport,
      catch: catchBaseline,
      loss: { result: lostResult, retry: lostRetry, resultAtTop: lostResultAtTop, retryAtTop: lostRetryAtTop },
      decision: { result: decisionResult, continueAction, resultAtTop: decisionResultAtTop, continueActionAtTop },
      retryPanel,
    });
    await page.close();
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const consoleErrors = [];
const recordConsoleError = (message) => {
  if (/Failed to load resource: the server responded with a status of (401|503)/.test(message)) return;
  if (message.includes("Blocked call to navigator.vibrate because user hasn't tapped")) return;
  consoleErrors.push(message);
};
page.on("console", (message) => {
  if (message.type() === "error") recordConsoleError(message.text());
});
page.on("pageerror", (error) => recordConsoleError(String(error)));

await page.goto(`${BASE}/?telegramMock=ios`, { waitUntil: "networkidle" });
await page.waitForSelector(".locations-list .location-card", { timeout: 20000 });

const declaredCssVariables = new Set([...stylesSource.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
const referencedCssVariables = [...stylesSource.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
const undefinedCssVariables = [...new Set(referencedCssVariables)].filter((name) => !declaredCssVariables.has(name) && !name.startsWith("--tg-"));
check("all internal CSS variables are defined", undefinedCssVariables.length === 0, undefinedCssVariables.join(", ") || "no undefined variables");
check("panel surface token is defined", declaredCssVariables.has("--panel"), "--panel has a concrete fallback");

await verifyViewportChrome({ browser, base: BASE, check, recordConsoleError });
await verifyFishImageResilience({ browser, base: BASE, check });
await verifyAccessibilityModes({ browser, base: BASE, check, recordConsoleError });
await verifyToastAndStyleIsolation({ page, check });
await verifyLandscapeScreens({ browser, base: BASE, check, recordConsoleError });

// ---------- Main screen ----------
const topbar = await rectOf(page, ".app-topbar");
const hero = await rectOf(page, ".screen-hero");
const gearDock = await rectOf(page, ".gear-dock");
const castBar = await rectOf(page, ".cast-bar");
const tabbar = await rectOf(page, ".tabbar");

check("topbar above hero", topbar.bottom <= hero.top + 1, `topbar bottom ${topbar.bottom.toFixed(1)} vs hero top ${hero.top.toFixed(1)}`);
check("hero above gear dock", hero.bottom <= gearDock.top + 1, `hero bottom ${hero.bottom.toFixed(1)} vs dock top ${gearDock.top.toFixed(1)}`);
check("cast bar clears tabbar with CTA gap", Math.abs(tabbar.top - castBar.bottom - 10) < 2, `gap ${(tabbar.top - castBar.bottom).toFixed(1)}px (expected 10)`);
recordMeasurement("iPhone portrait topbar to hero", hero.top - topbar.bottom);
recordMeasurement("iPhone portrait hero to first control", gearDock.top - hero.bottom);
recordMeasurement("iPhone portrait cast bar to tabbar", tabbar.top - castBar.bottom);
check("hero-to-first-control spacing stays compact", gearDock.top - hero.bottom >= 0 && gearDock.top - hero.bottom <= 20, `gap ${(gearDock.top - hero.bottom).toFixed(1)}px (expected 0–20)`);
check("tabbar reaches viewport bottom", Math.abs(tabbar.bottom - 852) < 1, `tabbar bottom ${tabbar.bottom.toFixed(1)} vs 852`);
check("cast bar within viewport", castBar.left >= 0 && castBar.right <= 393, `cast bar spans ${castBar.left.toFixed(1)}–${castBar.right.toFixed(1)}`);
const startupToast = page.locator(".toast").first();
if (await startupToast.count()) {
  const toast = await rectOf(page, ".toast");
  check("toast sits below topbar", toast.top >= topbar.bottom, `toast top ${toast.top.toFixed(1)} vs topbar bottom ${topbar.bottom.toFixed(1)}`);
  check("toast stays above bottom chrome", toast.bottom <= tabbar.top, `toast bottom ${toast.bottom.toFixed(1)} vs tabbar top ${tabbar.top.toFixed(1)}`);
} else {
  report.push("SKIP  startup toast placement  (no startup toast visible)");
}
const screenAnimationName = await page.locator(".screen").evaluate((element) => getComputedStyle(element).animationName);
check("screen transitions have an entry animation", screenAnimationName !== "none", `animation-name ${screenAnimationName}`);

const cardCount = await page.locator(".locations-list .location-card").count();
check("location cards rendered", cardCount >= 2, `${cardCount} cards`);

const iconPaintState = await page.locator("svg.icon").evaluateAll((elements) => ({
  count: elements.length,
  invalidPathCount: elements.reduce((count, element) => count + [...element.querySelectorAll("path")].filter((path) => path.namespaceURI !== "http://www.w3.org/2000/svg").length, 0),
  emptyIconCount: elements.filter((element) => element.querySelectorAll("path").length === 0).length,
}));
check("icons render as native SVG paths", iconPaintState.count > 0 && iconPaintState.invalidPathCount === 0 && iconPaintState.emptyIconCount === 0, JSON.stringify(iconPaintState));

// Gear dock tiles: 4 tiles, equal widths, no horizontal overflow.
const tiles = await page.locator(".gear-dock .gear-tile").all();
check("4 gear tiles", tiles.length === 4, `${tiles.length} tiles`);
const tileRects = [];
for (const tile of tiles) tileRects.push(await tile.evaluate((el) => el.getBoundingClientRect().toJSON()));
const widths = tileRects.map((r) => r.width);
check("gear tiles uniform width", Math.max(...widths) - Math.min(...widths) < 1.01, `widths ${widths.map((width) => width.toFixed(2)).join(",")}`);
check("gear dock no horizontal overflow", tileRects[3].right <= 393 - 12 + 1, `right edge ${tileRects[3].right.toFixed(1)}`);
const clippedGearNames = await page.locator(".gear-name").evaluateAll((elements) =>
  elements.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).length,
);
check("gear tiles show complete equipment names", clippedGearNames === 0, `${clippedGearNames} clipped names`);

// Readiness chips + CTA visible inside cast bar.
const chipCount = await page.locator(".cast-readiness .readiness-chip").count();
check("3 readiness chips", chipCount === 3, `${chipCount} chips`);
const cta = await rectOf(page, ".cast-cta");
check("CTA inside cast bar", cta.top >= castBar.top && cta.bottom <= castBar.bottom + 1, `cta ${cta.top.toFixed(1)}–${cta.bottom.toFixed(1)} vs bar ${castBar.top.toFixed(1)}–${castBar.bottom.toFixed(1)}`);
const castDetailsText = await page.locator(".cast-details").textContent();
check("cast cost is explicit", /1 .* \+ 1 lure use/.test(castDetailsText ?? ""), `details "${castDetailsText?.trim()}"`);
check("cast projects resource consumption", /After casting:/.test(castDetailsText ?? ""), `details "${castDetailsText?.trim()}"`);
check("locations explain rod risk", (await page.locator(".location-risk-reason").count()) === cardCount, `${await page.locator(".location-risk-reason").count()} explanations for ${cardCount} cards`);
check("location fish lists avoid non-interactive +N", (await page.locator(".fish-chip.is-more").count()) === 0, "no +N fish indicators");
const fishDetails = page.locator(".fish-list-details").first();
if ((await fishDetails.count()) > 0) {
  await fishDetails.locator("summary").tap();
  check("location fish list expands", (await fishDetails.locator(".fish-chips-expanded .fish-chip").count()) > 0, "additional species are revealed");
} else {
  report.push("SKIP  location fish list expands  (no location has more than three species)");
}

// Scroll content to the bottom: last location card must clear the cast bar.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(350);
const lastCard = await rectOf(page, ".locations-list .location-card >> nth=-1");
check("last location card fully visible above cast bar", lastCard.bottom <= castBar.top + 2, `card bottom ${lastCard.bottom.toFixed(1)} vs cast bar top ${castBar.top.toFixed(1)}`);
recordMeasurement("iPhone portrait last location card to cast bar", castBar.top - lastCard.bottom);
await page.screenshot({ path: screenshotPath("layout-main-scrolled") });

// Select a different location card — selection ring + hero should update.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, 0));
const heroBefore = await page.locator(".screen-hero h1").textContent();
const unlockedCards = page.locator(".location-card:not(.is-locked)");
if ((await unlockedCards.count()) > 1) {
  const secondName = await unlockedCards.nth(1).locator("h2").textContent();
  await unlockedCards.nth(1).tap();
  await page.waitForTimeout(200);
  const heroAfter = await page.locator(".screen-hero h1").textContent();
  check("tapping card updates hero + selection", heroAfter === secondName && heroBefore !== heroAfter, `hero "${heroBefore}" → "${heroAfter}"`);
  const selectedCount = await page.locator(".location-card.is-selected").count();
  check("exactly one selected card", selectedCount === 1, `${selectedCount} selected`);
} else {
  report.push("SKIP  tapping card updates hero + selection  (only one unlocked location in dev state)");
}

// Locked card deep-links to shop boats tab.
const lockedCard = page.locator(".location-card.is-locked").first();
if ((await lockedCard.count()) > 0) {
  const lockText = await lockedCard.locator(".lock-tag").textContent();
  check("locked location explains its unlock path", /Requires|Buy/.test(lockText ?? ""), lockText?.trim() || "no lock guidance");
  await lockedCard.tap();
  await page.waitForSelector(".shop-list", { timeout: 10000 });
  const activeTab = await page.locator(".shop-tab.is-active").textContent();
  check("locked card opens shop boats tab", activeTab?.trim() === "Boats", `active tab "${activeTab?.trim()}"`);
  check("boats explain their unlocked waters", (await page.locator('.shop-detail-label', { hasText: "Unlocks these waters" }).count()) > 0, "location unlocks rendered");
} else {
  report.push("SKIP  locked card deep-link  (no locked locations in dev state)");
}

await page.screenshot({ path: screenshotPath("layout-main") });

// ---------- Shop ----------
await page.locator(".tabbar .tab-button").nth(2).tap();
await page.waitForSelector(".shop-list .shop-item", { timeout: 10000 });

const tabsRect = await rectOf(page, ".shop-tabs");
const topbar2 = await rectOf(page, ".app-topbar");
check("shop tabs below topbar", tabsRect.top >= topbar2.bottom - 1, `tabs top ${tabsRect.top.toFixed(1)} vs topbar bottom ${topbar2.bottom.toFixed(1)}`);
check("shop renders catalog descriptions", (await page.locator(".shop-description").count()) === (await page.locator(".shop-list .shop-item").count()), "one description per item");
check("shop renders equipment state", (await page.locator(".shop-state").count()) > 0, "owned or equipped state visible");

// Sticky behavior: scroll the shop and confirm tabs pin under the topbar
// (only meaningful when the list is tall enough to scroll).
const scrollRange = await page.locator(".app-content").evaluate((el) => el.scrollHeight - el.clientHeight);
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, 400));
await page.waitForTimeout(250);
const tabsSticky = await rectOf(page, ".shop-tabs");
const tabbarRect = await rectOf(page, ".tabbar");
if (scrollRange > 40) {
  check("shop tabs stick while scrolling", tabsSticky.top <= topbar2.bottom + 8 && tabsSticky.bottom > topbar2.bottom, `sticky top ${tabsSticky.top.toFixed(1)}`);
} else {
  report.push(`SKIP  shop tabs stick while scrolling  (shop content not scrollable: range ${scrollRange.toFixed(0)}px)`);
}
check("sticky tabs do not overlap tabbar", !rectsOverlap(tabsSticky, tabbarRect), `tabs bottom ${tabsSticky.bottom.toFixed(1)} vs tabbar top ${tabbarRect.top.toFixed(1)}`);
check("sticky tabs do not overlap topbar", !rectsOverlap(tabsSticky, topbar2), `tabs top ${tabsSticky.top.toFixed(1)} vs topbar bottom ${topbar2.bottom.toFixed(1)}`);
await page.screenshot({ path: screenshotPath("layout-shop-bait") });

// Bottom of shop list clears the tabbar.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(250);
const lastItem = await rectOf(page, ".shop-list .shop-item >> nth=-1");
check("last shop item clears tabbar", lastItem.bottom <= tabbarRect.top + 2, `item bottom ${lastItem.bottom.toFixed(1)} vs tabbar top ${tabbarRect.top.toFixed(1)}`);

// Switch tabs and verify content swaps.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, 0));
for (const tabName of ["Rods", "Lures", "Boats"]) {
  await page.locator(".shop-tab", { hasText: tabName }).tap();
  await page.waitForTimeout(300);
  const itemCount = await page.locator(".shop-list .shop-item").count();
  check(`${tabName} tab renders items`, itemCount >= 1, `${itemCount} items`);
  check(`${tabName} tab renders stats`, (await page.locator(".shop-list .shop-stats").count()) === itemCount, "one stat grid per item");
  const actionLabels = await page.locator(".shop-list .buy-btn").allTextContents();
  check(`${tabName} actions use explicit labels`, actionLabels.every((label) => /Buy|Claim/.test(label)), actionLabels.join(" | ") || "all items owned");
}
await page.screenshot({ path: screenshotPath("layout-shop-boats") });

// Quantity chips update the bait buy total.
await page.locator(".shop-tab", { hasText: "Bait" }).tap();
await page.waitForSelector(".qty-chips", { timeout: 5000 });
const firstBait = page.locator(".shop-item").first();
await firstBait.locator(".qty-chip", { hasText: "×10" }).tap();
await page.waitForTimeout(250);
const buyText = await firstBait.locator(".buy-btn").textContent();
check("bait ×10 chip updates buy total", /\d+/.test(buyText ?? ""), `buy button "${buyText?.trim()}"`);
const activeChip = await firstBait.locator(".qty-chip.is-active").textContent();
check("active quantity chip is ×10", activeChip?.trim() === "×10", `active chip "${activeChip?.trim()}"`);
check("bait cards explain attraction", (await page.locator(".shop-species").count()) === (await page.locator(".shop-list .shop-item").count()), "attracted species visible");
await page.screenshot({ path: screenshotPath("layout-shop-bait-qty") });

await verifyGearSelector({ browser, base: BASE, check, recordConsoleError });
await verifyCatchResults({ browser, base: BASE, check, recordConsoleError });
await verifyResultViewportBaselines({ browser, base: BASE, check, recordConsoleError });

// ---------- Chunk 3 economy confirmation ----------
const stateForCollection = await page.evaluate(async () => {
  const token = sessionStorage.getItem("fishing-with-friends.session");
  const response = await fetch("/api/game/state", { headers: { Authorization: `Bearer ${token}` } });
  return response.json();
});
const species = stateForCollection.catalog.fish[0];
const location = stateForCollection.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]);
const specimen = (id, value, weight) => ({
  id,
  speciesId: species.id,
  species,
  weightKg: weight,
  lengthCm: species.typicalLengthCm,
  quality: "good",
  saleValueCoins: value,
  caughtAt: new Date().toISOString(),
  locationId: location.id,
  locationName: location.name,
});
await page.route("**/api/game/collection", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fish: [specimen("fixture-catch-1", 42, 0.4), specimen("fixture-catch-2", 81, 0.7)] }),
  });
});
await page.getByRole("button", { name: "Collection", exact: true }).tap();
await page.waitForSelector(".collection-screen", { timeout: 10000 });
await page.locator(".collection-actions .secondary-action").first().tap();
const confirmButtonText = await page.locator(".collection-actions .is-confirming").textContent();
check("Sell All requires confirmation", /Confirm: sell 2 fish for 123 coins/.test(confirmButtonText ?? ""), `button "${confirmButtonText?.trim()}"`);
check("Sell All confirmation offers cancel", (await page.locator(".collection-actions .collection-cancel").count()) === 1, "cancel action rendered");
check("collection shows catch location", (await page.locator(".specimen-location").count()) === 2, "location shown for each specimen");
check("collection shows caught date", (await page.locator(".specimen-caught-date").count()) === 2, "date shown for each specimen");
check("collection exposes species notes", (await page.locator(".collection-species-info").count()) === 2, "species notes available for each specimen");
await page.locator(".collection-actions .collection-cancel").tap();
check("Sell All confirmation can be cancelled", (await page.locator(".collection-actions .is-confirming").count()) === 0, "confirmation cleared");
await page.unroute("**/api/game/collection");

// ---------- Chunk 5 journal, empty collection, and social surfaces ----------
await page.route("**/api/game/journal", async (route) => {
  const response = await route.fetch();
  const journal = await response.json();
  // Keep the browser check deterministic even when the persisted local player
  // has not made a catch yet.
  if (journal.entries.length > 0) {
    const first = journal.entries[0];
    journal.entries[0] = {
      ...first,
      discovered: true,
      timesCaught: Math.max(1, first.timesCaught),
      heaviestWeightKg: first.heaviestWeightKg ?? first.species.typicalWeightKg,
      longestLengthCm: first.longestLengthCm ?? first.species.typicalLengthCm,
      bestSaleValueCoins: first.bestSaleValueCoins ?? first.species.baseValueCoins,
      firstCaughtAt: first.firstCaughtAt ?? new Date().toISOString(),
      lastCaughtAt: first.lastCaughtAt ?? new Date().toISOString(),
    };
  }
  await route.fulfill({ status: response.status(), headers: { "content-type": "application/json" }, body: JSON.stringify(journal) });
});
await page.getByRole("button", { name: "Journal", exact: true }).tap();
await page.waitForSelector(".journal-screen", { timeout: 10000 });
const journalCards = await page.locator(".journal-card").count();
check("journal renders species entries", journalCards > 0, `${journalCards} cards`);
check("journal replaces repeated placeholders", !(await page.locator(".journal-card").allTextContents()).some((text) => text.includes("A uncommon fish")), "no generic rarity placeholder");
check("undiscovered entries have discovery hints", (await page.locator(".journal-card.is-undiscovered .journal-hint").count()) > 0, "hint rendered");
check("discovered entries show field notes", (await page.locator(".journal-card:not(.is-undiscovered) .journal-bio").count()) > 0, "description rendered");
check("discovered entries show habitat and range", (await page.locator(".journal-card:not(.is-undiscovered) .journal-facts").count()) > 0, "habitat/range rendered");
check("discovered entries show source and dates", (await page.locator(".journal-card:not(.is-undiscovered) .journal-source").count()) > 0 && (await page.locator(".journal-record-dates").count()) > 0, "source and discovery dates rendered");

await page.locator("#journal-filter").selectOption("undiscovered");
await page.waitForTimeout(150);
const undiscoveredCards = await page.locator(".journal-card").count();
check("journal filter shows undiscovered entries", undiscoveredCards > 0 && (await page.locator(".journal-card.is-undiscovered").count()) === undiscoveredCards, `${undiscoveredCards} undiscovered cards`);
await page.locator("#journal-filter").selectOption("all");
await page.waitForTimeout(150);
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(250);
const journalTabbar = await rectOf(page, ".tabbar");
const lastJournalCard = await rectOf(page, ".journal-grid .journal-card >> nth=-1");
check("journal cards clear bottom tabbar", lastJournalCard.bottom <= journalTabbar.top + 2, `card bottom ${lastJournalCard.bottom.toFixed(1)} vs tabbar top ${journalTabbar.top.toFixed(1)}`);
await page.unroute("**/api/game/journal");

await page.route("**/api/game/collection", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fish: [] }) });
});
await page.getByRole("button", { name: "Collection", exact: true }).tap();
await page.waitForSelector(".collection-screen", { timeout: 10000 });
check("empty collection offers Go fishing", (await page.getByRole("button", { name: "Go fishing", exact: true }).count()) === 1, "CTA rendered");
await page.getByRole("button", { name: "Go fishing", exact: true }).tap();
await page.waitForSelector(".locations-list .location-card", { timeout: 10000 });
await page.unroute("**/api/game/collection");

await page.getByRole("button", { name: "Friends", exact: true }).tap();
await page.waitForSelector(".friends-screen", { timeout: 10000 });
const friendsText = await page.locator(".friends-screen").textContent();
check("friends board explains kept-fish scoring", /kept fish/i.test(friendsText ?? "") && /sold fish/i.test(friendsText ?? ""), friendsText?.trim() ?? "no board copy");
check("friends board shows self standing", (await page.locator(".crew-self").count()) === 1, "self-ranking panel rendered");
if ((await page.locator(".crew-row").count()) > 0) {
  check("friends rows use kept-fish labels", (await page.locator(".crew-row small").allTextContents()).every((text) => /kept/.test(text)), "rows identify kept fish");
} else {
  check("empty friends board offers next action", (await page.getByRole("button", { name: "Go fishing", exact: true }).count()) === 1, "empty-board CTA rendered");
}
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(250);
const friendsTabbar = await rectOf(page, ".tabbar");
const friendsPanel = await rectOf(page, ".friends-screen");
check("friends screen clears bottom tabbar", friendsPanel.bottom <= friendsTabbar.top + 2, `panel bottom ${friendsPanel.bottom.toFixed(1)} vs tabbar top ${friendsTabbar.top.toFixed(1)}`);

// ---------- Console health ----------
check("no layout console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");

await verifyAsyncFlows({ browser, base: BASE, check, recordConsoleError });

check("no browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");

await browser.close();

const browserReportPath = resolve(process.env.PHASE0_BROWSER_REPORT_PATH ?? join(ARTIFACT_DIR, "browser-report.json"));
await mkdir(resolve(browserReportPath, ".."), { recursive: true });
await writeFile(browserReportPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  viewportScenarios,
  viewportBaselines,
  measurements,
  checks: report,
  failures,
  consoleErrors,
}, null, 2)}\n`);
console.log(`Browser report: ${browserReportPath}`);

console.log("\n===== LAYOUT VERIFICATION =====");
for (const line of report) console.log(line);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll checks passed.");
