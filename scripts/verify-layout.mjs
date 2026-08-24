// Layout verification for the redesigned main screen + shop.
// Requires the dev stack running (game on :5173, worker on :8787).
// iPhone-class mobile viewport with the Telegram iOS chrome mock.
import { chromium } from "playwright";
import { verifyAsyncFlows } from "./verify-async.mjs";

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
  await page.waitForSelector(".gear-dock .gear-slot:last-child .gear-tile", { timeout: 20_000 });
  const baitTile = page.locator(".gear-dock .gear-slot:last-child .gear-tile");
  check("gear selector exposes expanded state", (await baitTile.getAttribute("aria-expanded")) === "false", "collapsed before tap");
  await baitTile.tap();
  await page.waitForSelector(".gear-dock .gear-slot:last-child .equipment-options:not([hidden])", { timeout: 5_000 });
  check("gear selector opens on tap", (await page.locator(".equipment-options:not([hidden])").count()) === 1, "one menu open");
  check(
    "gear selector keeps full mobile names",
    (await page.locator(".equipment-options:not([hidden]) .equipment-option-name").allTextContents()).includes("Sweet Corn"),
    "full option name rendered",
  );

  await page.locator(".screen-hero").tap();
  check("gear selector dismisses outside tap", (await page.locator(".equipment-options:not([hidden])").count()) === 0, "menu closed");
  await baitTile.tap();
  await page.keyboard.press("Escape");
  check("gear selector dismisses with Escape", (await page.locator(".equipment-options:not([hidden])").count()) === 0, "menu closed");
  await page.close();
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
await page.screenshot({ path: "/tmp/layout-main-scrolled.png" });

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

await page.screenshot({ path: "/tmp/layout-main.png" });

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
  check(`${tabName} tab renders stats`, (await page.locator(".shop-list .shop-stats").count()) === itemCount, "one stat grid per item");
  const actionLabels = await page.locator(".shop-list .buy-btn").allTextContents();
  check(`${tabName} actions use explicit labels`, actionLabels.every((label) => /Buy|Claim/.test(label)), actionLabels.join(" | ") || "all items owned");
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
check("bait cards explain attraction", (await page.locator(".shop-species").count()) === (await page.locator(".shop-list .shop-item").count()), "attracted species visible");
await page.screenshot({ path: "/tmp/layout-shop-bait-qty.png" });

await verifyGearSelector({ browser, base: BASE, check, recordConsoleError });

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

console.log("\n===== LAYOUT VERIFICATION =====");
for (const line of report) console.log(line);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll checks passed.");
