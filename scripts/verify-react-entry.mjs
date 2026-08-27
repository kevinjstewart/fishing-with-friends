import { chromium } from "playwright";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const base = process.env.GAME_URL ?? "http://127.0.0.1:5174";
const artifactDirectory = resolve(process.env.REACT_PHASE2_ARTIFACT_DIR ?? "/tmp/fishing-with-friends-phase2");
const defaultHtmlPath = join(repoRoot, "apps/game/index.html");
const reactHtmlPath = join(repoRoot, "apps/game/index.react.html");
const defaultDistDirectory = join(repoRoot, "apps/game/dist");
const reactDistDirectory = join(repoRoot, "apps/game/dist-react");

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else files.push(path);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const defaultHtml = await readFile(defaultHtmlPath, "utf8");
const reactHtml = await readFile(reactHtmlPath, "utf8");
assert(defaultHtml.includes('/src/main.ts"'), "The default HTML entry no longer selects Lit main.ts.");
assert(!defaultHtml.includes("main.tsx"), "The default HTML entry references the React migration entry.");
assert(reactHtml.includes('/src/main.tsx"'), "The React HTML entry does not select main.tsx.");
assert(!reactHtml.includes('/src/main.ts"'), "The React HTML entry references the Lit main.ts entry.");

const reactDistFiles = await collectFiles(reactDistDirectory);
const defaultDistFiles = await collectFiles(defaultDistDirectory);
const reactDistText = await Promise.all(reactDistFiles.map((file) => readFile(file, "utf8"))).then((parts) => parts.join("\n"));
const defaultDistText = await Promise.all(defaultDistFiles.map((file) => readFile(file, "utf8"))).then((parts) => parts.join("\n"));
const reactSourceFiles = (await collectFiles(join(repoRoot, "apps/game/src/app"))).filter((file) => !/\.test\.[^.]+$/.test(file)).concat(join(repoRoot, "apps/game/src/main.tsx"));
const reactSourceText = await Promise.all(reactSourceFiles.map((file) => readFile(file, "utf8"))).then((parts) => parts.join("\n"));
assert(!/@fishing\/shared["']/.test(reactSourceText), "React source imports the shared root barrel.");
assert(!/@fishing\/shared\/catalog["']/.test(reactSourceText), "React source imports the catalogue outside a deliberate catalogue feature.");
assert(reactDistText.includes("React migration scaffold"), "The React migration bundle does not contain the React shell marker.");
assert(!reactDistText.includes('customElements.define("game-app"'), "The React migration bundle contains the Lit application root.");
assert(!reactDistText.includes("customElements.define"), "The React migration bundle contains a custom-element registration.");
assert(!reactDistText.includes("LitElement"), "The React migration bundle contains LitElement code.");
assert(!reactDistText.includes("AppShell"), "The React migration bundle contains the Lit AppShell.");
assert(!defaultDistText.includes("React migration scaffold"), "The default Lit bundle contains the React shell marker.");
assert(!defaultDistFiles.some((file) => file.endsWith("/index.react.html")), "The default Lit output contains the React HTML entry.");

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch();
const scenarios = [
  { name: "iPhone portrait", mock: "ios", viewport: { width: 393, height: 852 } },
  { name: "Android portrait", mock: "android", viewport: { width: 412, height: 915 } },
  { name: "iPhone landscape", mock: "landscape", viewport: { width: 852, height: 393 } },
  { name: "short-height portrait", mock: "ios", viewport: { width: 393, height: 640 } },
];
const scenarioReports = [];
const pageErrors = [];
const consoleErrors = [];
const badSameOriginResponses = [];
const unexpectedApiPaths = [];
const expectedApiPaths = new Set(["/api/auth/dev", "/api/me", "/api/game/state", "/api/game/encounters/active"]);
const origin = new URL(base).origin;

for (const scenario of scenarios) {
  const page = await browser.newPage({
    viewport: scenario.viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const requests = [];
  page.on("pageerror", (error) => pageErrors.push(`${scenario.name}: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${scenario.name}: ${message.text()}`);
  });
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400) {
      badSameOriginResponses.push({ scenario: scenario.name, path: url.pathname, status: response.status() });
    }
  });

  await page.goto(`${base}/index.react.html?telegramMock=${scenario.mock}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=react-bootstrap-success]", { timeout: 20_000 });
  const initialGeometry = await page.evaluate(() => {
    const root = document.querySelector("#react-root");
    const scaffold = document.querySelector("[data-testid=react-scaffold]");
    const panel = document.querySelector("[data-testid=react-bootstrap-success]");
    const rect = (element) => {
      const bounds = element?.getBoundingClientRect();
      return bounds ? { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height } : null;
    };
    const scrollable = document.querySelector(".react-scaffold");
    return {
      reactRoots: document.querySelectorAll("#react-root").length,
      phaserCanvases: document.querySelectorAll("#game-root canvas").length,
      litRoots: document.querySelectorAll("game-app").length,
      root: rect(root),
      scaffold: rect(scaffold),
      successPanel: rect(panel),
      scrollRange: scrollable ? scrollable.scrollHeight - scrollable.clientHeight : null,
      scrollTop: scrollable?.scrollTop ?? null,
    };
  });
  await page.locator(".react-scaffold").evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.waitForTimeout(50);
  const scrolledGeometry = await page.locator(".react-scaffold").evaluate((element) => ({
    scrollRange: element.scrollHeight - element.clientHeight,
    scrollTop: element.scrollTop,
  }));
  await page.screenshot({ path: join(artifactDirectory, `react-entry-${scenario.name.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: true });

  unexpectedApiPaths.push(...requests.filter((path) => path.startsWith("/api/") && !expectedApiPaths.has(path)).map((path) => ({ scenario: scenario.name, path })));
  scenarioReports.push({
    scenario: scenario.name,
    viewport: scenario.viewport,
    initial: initialGeometry,
    scrolled: scrolledGeometry,
  });
  await page.close();
}
await browser.close();

assert(pageErrors.length === 0, `React entry page errors: ${pageErrors.join(" | ")}`);
assert(consoleErrors.length === 0, `React entry console errors: ${consoleErrors.join(" | ")}`);
assert(badSameOriginResponses.length === 0, `React entry same-origin failures: ${JSON.stringify(badSameOriginResponses)}`);
assert(unexpectedApiPaths.length === 0, `React entry requested an unexpected API route: ${JSON.stringify(unexpectedApiPaths)}`);
for (const report of scenarioReports) {
  assert(report.initial.reactRoots === 1, `${report.scenario}: expected one React root, found ${report.initial.reactRoots}.`);
  assert(report.initial.phaserCanvases <= 1, `${report.scenario}: expected at most one Phaser canvas, found ${report.initial.phaserCanvases}.`);
  assert(report.initial.litRoots === 0, `${report.scenario}: React migration entry mounted ${report.initial.litRoots} Lit application roots.`);
  assert(report.scrolled.scrollTop >= report.scrolled.scrollRange - 1, `${report.scenario}: full-range scroll did not reach the end.`);
}

console.log(JSON.stringify({
  base,
  defaultBundle: "Lit marker retained; React marker absent",
  reactBundle: "React marker present; Lit root/AppShell absent",
  scenarios: scenarioReports,
  screenshots: scenarioReports.map((report) => join(artifactDirectory, `react-entry-${report.scenario.toLowerCase().replaceAll(" ", "-")}.png`)),
}, null, 2));
