// Quiet screenshots: main screen + each shop tab, toasts dismissed.
import { chromium } from "playwright";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const FISH_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/fixture-fish.svg";
const FISH_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#244f49" />
      <stop offset="1" stop-color="#071b20" />
    </linearGradient>
    <linearGradient id="scales" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d7b36b" />
      <stop offset="0.52" stop-color="#b86d4c" />
      <stop offset="1" stop-color="#633449" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="12" />
    </filter>
  </defs>
  <rect width="640" height="360" fill="url(#water)" />
  <g fill="none" stroke="#b9d6bd" stroke-linecap="round" opacity="0.15">
    <path d="M38 82h194M422 62h148M82 294h164M390 274h212" stroke-width="3" />
    <path d="M12 122h112M500 130h108M280 38h92M264 326h142" stroke-width="1.5" />
  </g>
  <ellipse cx="323" cy="252" rx="190" ry="26" fill="#02090b" opacity="0.6" filter="url(#shadow)" />
  <path d="M117 187c49-70 169-99 286-38 30 16 56 39 83 69-30 4-62 18-85 38-109 94-246 48-284-25l-48 27 25-42-25-42 48 27Z" fill="url(#scales)" />
  <path d="M484 218 576 164l-26 54 26 54-92-54Z" fill="#d7b36b" opacity="0.9" />
  <path d="M229 149c31-37 76-50 118-43l-36 51ZM278 249c30 35 78 50 124 37l-42-48Z" fill="#e9cd88" opacity="0.75" />
  <circle cx="161" cy="182" r="10" fill="#f4eddf" />
  <circle cx="164" cy="181" r="4" fill="#071018" />
  <path d="M138 210c19 14 39 15 57 3" fill="none" stroke="#351f2b" stroke-width="5" stroke-linecap="round" />
  <path d="M226 166c-5 21-5 44 0 66M270 150c-6 31-6 62 0 92M318 151c-5 29-5 60 0 89M366 164c-4 22-4 44 0 66" fill="none" stroke="#f8d990" stroke-width="3" opacity="0.45" />
</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

await page.goto(`${BASE}/?telegramMock=ios`, { waitUntil: "networkidle" });
await page.waitForSelector(".locations-list .location-card", { timeout: 20000 });

const dismissToasts = async () => {
  await page.locator("game-app").evaluate((element) => element.dismissStatus());
  await page.waitForTimeout(250);
};

await dismissToasts();
await page.screenshot({ path: "/tmp/shot-main.png" });

// Deep-link: tap locked card → shop boats.
const locked = page.locator(".location-card.is-locked").first();
if ((await locked.count()) > 0) {
  await locked.tap();
  await page.waitForSelector(".shop-list .shop-item", { timeout: 10000 });
  await dismissToasts();
  await page.screenshot({ path: "/tmp/shot-shop-boats.png" });
}

for (const tab of ["Rods", "Lures", "Bait"]) {
  await page.locator(".shop-tab", { hasText: tab }).tap();
  await page.waitForTimeout(400);
  await dismissToasts();
  await page.screenshot({ path: `/tmp/shot-shop-${tab.toLowerCase()}.png` });
}

await page.getByRole("button", { name: "Journal", exact: true }).tap();
await page.waitForSelector(".journal-screen", { timeout: 10000 });
await dismissToasts();
await page.screenshot({ path: "/tmp/shot-journal.png" });

await page.getByRole("button", { name: "Lakes", exact: true }).tap();
await page.waitForSelector(".locations-list .location-card", { timeout: 10000 });
const state = await page.evaluate(async () => {
  const token = sessionStorage.getItem("fishing-with-friends.session");
  const response = await fetch("/api/game/state", { headers: { Authorization: `Bearer ${token}` } });
  return response.json();
});
await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query: { pages: [{ thumbnail: { source: FISH_IMAGE_URL } }] } }) });
});
await page.route("https://upload.wikimedia.org/wikipedia/commons/fixture-fish.svg**", async (route) => {
  await route.fulfill({ status: 200, contentType: "image/svg+xml", body: FISH_IMAGE_SVG });
});
await page.evaluate(async (gameState) => {
  const { AppShell } = await import("/src/ui/app-shell.ts");
  const root = document.querySelector("#ui-root");
  const shell = new AppShell(root);
  shell.setGameState(gameState);
  const species = gameState.catalog.fish[0];
  const location = gameState.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]);
  shell.showFishingResult({
    outcome: "caught",
    message: "A clean fight and a beautiful fish.",
    species,
    rodId: gameState.activeEquipment.rodId,
    rodRiskBand: "low",
    rodBreakChancePercent: 0.25,
    catch: {
      id: "screenshot-catch",
      speciesId: species.id,
      species,
      weightKg: species.typicalWeightKg * 1.35,
      lengthCm: Math.round(species.typicalLengthCm * 1.2),
      quality: "trophy",
      saleValueCoins: 184,
      caughtAt: new Date().toISOString(),
      locationId: location.id,
      locationName: location.name,
    },
    rodBroke: false,
    replacementRodId: null,
  }, () => {}, () => {});
}, state);
await page.waitForSelector(".catch-reveal", { timeout: 10000 });
await page.waitForSelector('.catch-hero-image[data-image-state="loaded"]', { timeout: 10000 });
await dismissToasts();
await page.screenshot({ path: "/tmp/shot-catch-result.png" });

await browser.close();
console.log("done");
