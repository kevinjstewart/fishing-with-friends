// Repeatable cold-start measurement for the Telegram-shaped mobile profile.
// Run against the local dev stack before and after a client bundle change.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { installDeterministicReadFixtures } from "./fixtures/browser-fixtures.mjs";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const SAMPLE_COUNT = Math.max(1, Number.parseInt(process.env.COLD_START_SAMPLES ?? "5", 10));
const REPORT_PATH = resolve(process.env.COLD_START_REPORT_PATH ?? "/private/tmp/fishing-with-friends-phase8-cold-start.json");
const profile = {
  name: "Telegram iPhone portrait mock",
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  telegramMock: "ios",
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function sameOriginStaticResource(name) {
  const url = new URL(name);
  return url.origin === new URL(BASE).origin && /\.(?:html|css|js)$/i.test(url.pathname);
}

async function measureSample(browser, sample) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  await installDeterministicReadFixtures(page);

  const startedAt = performance.now();
  await page.goto(`${BASE}/?telegramMock=${profile.telegramMock}`, { waitUntil: "domcontentloaded" });
  const domContentLoadedAt = performance.now();
  await page.waitForSelector(".locations-list .location-card", { timeout: 20_000 });
  const appReadyAt = performance.now();
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    duration: entry.duration,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
  })));
  const staticResources = resources.filter((resource) => sameOriginStaticResource(resource.name));
  const javascriptResources = staticResources.filter((resource) => /\.js(?:[?#]|$)/i.test(new URL(resource.name).pathname));

  await context.close();
  return {
    sample,
    domContentLoadedMs: Number((domContentLoadedAt - startedAt).toFixed(1)),
    appReadyMs: Number((appReadyAt - startedAt).toFixed(1)),
    staticResourceCount: staticResources.length,
    javascriptResources: javascriptResources.map((resource) => ({
      path: new URL(resource.name).pathname,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    })),
    staticTransferBytes: staticResources.reduce((sum, resource) => sum + resource.transferSize, 0),
    staticEncodedBytes: staticResources.reduce((sum, resource) => sum + resource.encodedBodySize, 0),
  };
}

const browser = await chromium.launch();
const samples = [];
try {
  for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
    samples.push(await measureSample(browser, sample));
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  definition: "Fresh Playwright browser contexts with cache disabled; app-ready is the first visible deterministic lakes card.",
  profile,
  samples,
  summary: {
    sampleCount: samples.length,
    medianDomContentLoadedMs: median(samples.map((sample) => sample.domContentLoadedMs)),
    medianAppReadyMs: median(samples.map((sample) => sample.appReadyMs)),
    medianStaticTransferBytes: median(samples.map((sample) => sample.staticTransferBytes)),
    medianStaticEncodedBytes: median(samples.map((sample) => sample.staticEncodedBytes)),
    initialJavascriptPaths: [...new Set(samples.flatMap((sample) => sample.javascriptResources.map((resource) => resource.path)))].sort(),
  },
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Cold-start report: ${REPORT_PATH}`);
