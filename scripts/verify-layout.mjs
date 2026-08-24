// Layout verification for the redesigned main screen + shop.
// Requires the dev stack running (game on :5173, worker on :8787).
// iPhone-class mobile viewport with the Telegram iOS chrome mock.
import { chromium } from "playwright";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const failures = [];
const report = [];

function check(label, condition, detail) {
  report.push(`${condition ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!condition) failures.push(`${label}: ${detail}`);
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

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

await page.goto(`${BASE}/?telegramMock=ios`, { waitUntil: "networkidle" });
await page.waitForSelector(".locations-list .location-card", { timeout: 20000 });

// ---------- Main screen ----------
const topbar = await rectOf(page, ".app-topbar");
const hero = await rectOf(page, ".screen-hero");
const gearDock = await rectOf(page, ".gear-dock");
const castBar = await rectOf(page, ".cast-bar");
const tabbar = await rectOf(page, ".tabbar");

check("topbar above hero", topbar.bottom <= hero.top + 1, `topbar bottom ${topbar.bottom.toFixed(1)} vs hero top ${hero.top.toFixed(1)}`);
check("hero above gear dock", hero.bottom <= gearDock.top + 1, `hero bottom ${hero.bottom.toFixed(1)} vs dock top ${gearDock.top.toFixed(1)}`);
check("cast bar clears tabbar with CTA gap", Math.abs(tabbar.top - castBar.bottom - 10) < 2, `gap ${(tabbar.top - castBar.bottom).toFixed(1)}px (expected 10)`);
check("tabbar reaches viewport bottom", Math.abs(tabbar.bottom - 852) < 1, `tabbar bottom ${tabbar.bottom.toFixed(1)} vs 852`);
check("cast bar within viewport", castBar.left >= 0 && castBar.right <= 393, `cast bar spans ${castBar.left.toFixed(1)}–${castBar.right.toFixed(1)}`);

const cardCount = await page.locator(".locations-list .location-card").count();
check("location cards rendered", cardCount >= 2, `${cardCount} cards`);

// Gear dock tiles: 4 tiles, equal widths, no horizontal overflow.
const tiles = await page.locator(".gear-dock .gear-tile").all();
check("4 gear tiles", tiles.length === 4, `${tiles.length} tiles`);
const tileRects = [];
for (const tile of tiles) tileRects.push(await tile.evaluate((el) => el.getBoundingClientRect().toJSON()));
const widths = tileRects.map((r) => Math.round(r.width));
check("gear tiles uniform width", new Set(widths).size === 1, `widths ${widths.join(",")}`);
check("gear dock no horizontal overflow", tileRects[3].right <= 393 - 12 + 1, `right edge ${tileRects[3].right.toFixed(1)}`);

// Readiness chips + CTA visible inside cast bar.
const chipCount = await page.locator(".cast-readiness .readiness-chip").count();
check("3 readiness chips", chipCount === 3, `${chipCount} chips`);
const cta = await rectOf(page, ".cast-cta");
check("CTA inside cast bar", cta.top >= castBar.top && cta.bottom <= castBar.bottom + 1, `cta ${cta.top.toFixed(1)}–${cta.bottom.toFixed(1)} vs bar ${castBar.top.toFixed(1)}–${castBar.bottom.toFixed(1)}`);

// Scroll content to the bottom: last location card must clear the cast bar.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(350);
const lastCard = await rectOf(page, ".locations-list .location-card >> nth=-1");
check("last location card fully visible above cast bar", lastCard.bottom <= castBar.top + 2, `card bottom ${lastCard.bottom.toFixed(1)} vs cast bar top ${castBar.top.toFixed(1)}`);
await page.screenshot({ path: "/tmp/layout-main-scrolled.png" });

// Select a different location card — selection ring + hero should update.
await page.locator(".app-content").evaluate((el) => el.scrollTo(0, 0));
const heroBefore = await page.locator(".screen-hero h1").textContent();
const unlockedCards = page.locator(".location-card:not(.is-locked)");
const secondName = await unlockedCards.nth(1).locator("h2").textContent();
await unlockedCards.nth(1).tap();
await page.waitForTimeout(200);
const heroAfter = await page.locator(".screen-hero h1").textContent();
check("tapping card updates hero + selection", heroAfter === secondName && heroBefore !== heroAfter, `hero "${heroBefore}" → "${heroAfter}"`);
const selectedCount = await page.locator(".location-card.is-selected").count();
check("exactly one selected card", selectedCount === 1, `${selectedCount} selected`);

// Locked card deep-links to shop boats tab.
const lockedCard = page.locator(".location-card.is-locked").first();
if ((await lockedCard.count()) > 0) {
  await lockedCard.tap();
  await page.waitForSelector(".shop-list", { timeout: 10000 });
  const activeTab = await page.locator(".shop-tab.is-active").textContent();
  check("locked card opens shop boats tab", activeTab?.trim() === "Boats", `active tab "${activeTab?.trim()}"`);
} else {
  report.push("SKIP  locked card deep-link  (no locked locations in dev state)");
}

await page.screenshot({ path: "/tmp/layout-main.png" });

// ---------- Shop ----------
await page.locator(".tabbar .tab-button").nth(2).tap();
await page.waitForSelector(".shop-list .shop-item", { timeout: 10000 });

const tabsRect = await rectOf(page, ".shop-tabs");
const topbar2 = await rectOf(page, ".app-topbar");
check("shop tabs below topbar", tabsRect.top >= topbar2.bottom - 1, `tabs top ${tabsRect.top.toFixed(1)} vs topbar bottom ${topbar2.bottom.toFixed(1)}`);

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
await page.screenshot({ path: "/tmp/layout-shop-bait.png" });

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
}
await page.screenshot({ path: "/tmp/layout-shop-boats.png" });

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
await page.screenshot({ path: "/tmp/layout-shop-bait-qty.png" });

// ---------- Console health ----------
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");

await browser.close();

console.log("\n===== LAYOUT VERIFICATION =====");
for (const line of report) console.log(line);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll checks passed.");
