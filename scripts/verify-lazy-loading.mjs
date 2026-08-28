// Browser proof for the production lazy-loading boundary.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { installDeterministicReadFixtures } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const ARTIFACT_DIR = resolve(process.env.LAZY_LOADING_ARTIFACT_DIR ?? "/private/tmp/fishing-with-friends-lazy-loading");
const REPORT_PATH = join(ARTIFACT_DIR, "browser-report.json");
const profile = { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true, telegramMock: "ios" };
const failures = [];
const checks = [];
const requests = [];
const consoleErrors = [];
let initialCode = [];
const featureLoads = [];
let deferredPhaserLoads = [];
let encounterLoads = [];

function check(label, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail });
  if (!passed) failures.push(`${label}: ${detail}`);
}

function codePath(url) {
  const parsed = new URL(url);
  if (parsed.origin !== new URL(BASE).origin) return undefined;
  if (!/(?:\.js|\.ts|\.tsx)(?:[?#]|$)/i.test(parsed.pathname)) return undefined;
  return parsed.pathname;
}

function isPhaserPath(path) {
  return /(?:^|\/)phaser-runtime(?:[./?]|$)|\/node_modules\/\.vite\/deps\/phaser(?:[./?]|$)|create-game|OceanScene|BootScene/i.test(path);
}

function encounterForState(state) {
  const location = state.locations.find((candidate) => candidate.unlocked) ?? state.locations[0];
  const species = state.catalog.fish.find((candidate) => candidate.availableLocationIds.includes(location.id)) ?? state.catalog.fish[0];
  return {
    encounterId: "lazy-loading-encounter",
    difficultySeed: 2187,
    locationId: location.id,
    locationName: location.name,
    species,
    miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0, catchMeterLossRate: 0, durationSeconds: 600 },
    rodRiskBand: location.riskBand,
    expiresAt: "2099-01-01T12:05:00.000Z",
  };
}

await mkdir(ARTIFACT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext(profile);
const page = await context.newPage();
page.on("request", (request) => {
  const path = codePath(request.url());
  if (path) requests.push(path);
});
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  const fixtures = await installDeterministicReadFixtures(page);
  await page.goto(`${BASE}/?telegramMock=${profile.telegramMock}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  initialCode = [...new Set(requests)];
  const initialPhaser = initialCode.filter(isPhaserPath);
  check("initial screen does not request Phaser code", initialPhaser.length === 0, initialPhaser.join(", ") || "no Phaser module requested");
  check("initial screen has no noninitial feature route modules", !initialCode.some((path) => /(?:FriendsRoute|JournalRoute|ShopRoute|CollectionRoute)/i.test(path)), initialCode.join(", "));

  await page.waitForSelector("#game-root canvas", { state: "attached", timeout: 20_000 });
  deferredPhaserLoads = [...new Set(requests.filter(isPhaserPath).filter((path) => !initialCode.includes(path)))];
  check("Phaser loads after the initial shell is visible", deferredPhaserLoads.length > 0, deferredPhaserLoads.join(", ") || "no deferred Phaser module request");

  for (const feature of [
    { label: "Friends", selector: "[data-testid=friends-screen]", token: "friendsroute" },
    { label: "Journal", selector: "[data-testid=journal-screen]", token: "journalroute" },
    { label: "Shop", selector: "[data-testid=shop-screen]", token: "shoproute" },
    { label: "Collection", selector: "[data-testid=collection-screen]", token: "collectionroute" },
  ]) {
    const before = requests.length;
    await page.getByRole("button", { name: feature.label, exact: true }).tap();
    await page.waitForSelector(feature.selector, { timeout: 15_000 });
    const loaded = [...new Set(requests.slice(before))];
    const matching = loaded.filter((path) => path.toLowerCase().includes(feature.token));
    check(`${feature.label} loads its route module on navigation`, matching.length > 0, loaded.join(", ") || "no new module request");
    featureLoads.push({ screen: feature.label, requests: loaded, matching });
    await page.getByRole("button", { name: "Lakes", exact: true }).tap();
    await page.waitForSelector("[data-testid=lakes-screen]", { timeout: 15_000 });
  }

  const state = fixtures.getState();
  if (!state) throw new Error("The deterministic game-state fixture did not initialize.");
  await page.route("**/api/game/encounters", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(encounterForState(state)) });
  });
  const beforeFight = requests.length;
  await page.getByRole("button", { name: /^Cast at / }).click();
  await page.waitForFunction(() => document.body.classList.contains("is-fighting"), undefined, { timeout: 20_000 });
  encounterLoads = [...new Set(requests.slice(beforeFight))];
  const duplicatePhaserLoads = encounterLoads.filter(isPhaserPath);
  check("encounter start reuses the initialized Phaser runtime", duplicatePhaserLoads.length === 0, encounterLoads.join(", ") || "no duplicate Phaser module request");
  check("browser reports no unexpected console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");
} finally {
  await context.close();
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  profile,
  initialCode,
  featureLoads,
  deferredPhaserLoads,
  encounterLoads,
  checks,
  failures,
  consoleErrors,
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Lazy-loading report: ${REPORT_PATH}`);
for (const result of checks) console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.label}  ${result.detail}`);
if (failures.length > 0) process.exit(1);
