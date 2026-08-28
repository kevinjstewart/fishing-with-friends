// Deterministic screenshots for every screen and encounter result.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { installDeterministicReadFixtures } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const ARTIFACT_DIR = resolve(process.env.BROWSER_ARTIFACT_DIR ?? "/private/tmp/fishing-with-friends-browser");
const SCREENSHOT_DIR = join(ARTIFACT_DIR, "screenshots");
await mkdir(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const fixtures = await installDeterministicReadFixtures(page);
const screenshots = [];

async function capture(name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path });
  screenshots.push({ name, path, viewport: page.viewportSize() });
}

async function dismissToasts() {
  await page.locator(".status-toast-host").evaluateAll((elements) => elements.forEach((element) => { element.hidden = true; }));
  await page.waitForTimeout(250);
}

await page.goto(`${BASE}/?telegramMock=ios`, { waitUntil: "networkidle" });
await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
const state = fixtures.getState();
if (!state) throw new Error("The deterministic game-state fixture did not initialize.");

await dismissToasts();
await capture("shot-screen-lakes");
await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
await page.waitForTimeout(180);
await capture("shot-screen-lakes-scrolled");
await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, 0));

await page.getByRole("button", { name: "Shop", exact: true }).tap();
await page.waitForSelector(".shop-list .shop-item", { timeout: 10_000 });
for (const tab of ["Bait", "Lures", "Rods", "Boats"]) {
  await page.getByRole("tab", { name: tab, exact: true }).tap();
  await page.locator(".shop-tab.is-active").filter({ hasText: tab }).waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(300);
  await dismissToasts();
  await capture(`shot-screen-shop-${tab.toLowerCase()}`);
}

await page.getByRole("button", { name: "Collection", exact: true }).tap();
await page.waitForSelector("[data-testid=collection-screen]", { timeout: 10_000 });
await dismissToasts();
await capture("shot-screen-collection");
await page.locator("[data-testid=app-content]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
await page.waitForTimeout(180);
await capture("shot-screen-collection-scrolled");

await page.getByRole("button", { name: "Journal", exact: true }).tap();
await page.waitForSelector("[data-testid=journal-screen]", { timeout: 10_000 });
await dismissToasts();
await capture("shot-screen-journal");

await page.getByRole("button", { name: "Friends", exact: true }).tap();
await page.waitForSelector("[data-testid=friends-screen]", { timeout: 10_000 });
await dismissToasts();
await capture("shot-screen-friends");

await page.getByRole("button", { name: "Lakes", exact: true }).tap();
await page.waitForSelector("[data-testid=lakes-screen]", { timeout: 10_000 });

async function renderCatchResult(options = {}) {
  await page.evaluate(async ({ gameState, resultOptions }) => {
    const fixture = await import("/src/test/render-fixture.tsx");
    fixture.renderEncounterFixture({ gameState, view: resultOptions.outcome === "lost" ? "lost" : resultOptions.rodBroke ? "broken-rod" : "catch" });
  }, { gameState: state, resultOptions: options });
  await page.waitForSelector("[data-testid=catch-result]", { timeout: 10_000 });
  if (options.outcome !== "lost") await page.waitForSelector('.catch-hero-image[data-image-state="loaded"]', { timeout: 10_000 });
  await dismissToasts();
}

await renderCatchResult();
await capture("shot-result-catch");
await renderCatchResult({ outcome: "lost" });
await capture("shot-result-loss");
await renderCatchResult({ rodBroke: true });
await capture("shot-result-broken-rod");

async function renderDecisionResult(decision) {
  await page.evaluate(async ({ gameState, decision }) => {
    const fixture = await import("/src/test/render-fixture.tsx");
    fixture.renderEncounterFixture({ gameState, view: decision === "sell" ? "decision-sell" : "decision-keep" });
  }, { gameState: state, decision });
  await page.waitForSelector("[data-testid=decision-result]", { timeout: 10_000 });
  await page.waitForTimeout(350);
}

await renderDecisionResult("keep");
await capture("shot-result-keep");
await renderDecisionResult("sell");
await capture("shot-result-sell");

await page.evaluate(async ({ gameState }) => {
  const fixture = await import("/src/test/render-fixture.tsx");
  fixture.renderEncounterFixture({ gameState, view: "retry" });
}, { gameState: state });
await page.waitForSelector("[data-testid=retry-panel]", { timeout: 10_000 });
await page.waitForTimeout(350);
await capture("shot-result-retry");

const manifestPath = join(ARTIFACT_DIR, "screenshot-manifest.json");
await writeFile(manifestPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  viewport: page.viewportSize(),
  screenshots,
}, null, 2)}\n`);

await browser.close();
console.log(`Captured ${screenshots.length} screenshots.`);
console.log(`Manifest: ${manifestPath}`);
