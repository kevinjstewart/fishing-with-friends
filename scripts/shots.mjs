// Quiet screenshots: main screen + each shop tab, toasts dismissed.
import { chromium } from "playwright";

const BASE = process.env.GAME_URL ?? "http://127.0.0.1:5173";
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
  await page.evaluate(() => {
    document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const frame = document.querySelector(".app-frame");
    if (frame instanceof HTMLElement) frame.dataset.toastVisible = "false";
  });
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

await browser.close();
console.log("done");
