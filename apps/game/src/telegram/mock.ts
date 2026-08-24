import { publishSafeArea } from "../safe-area";

interface MockSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TelegramViewportPreset {
  viewport: { width: number; height: number };
  safeArea: MockSafeArea;
  contentSafeArea: MockSafeArea;
  chrome: {
    statusBar: boolean;
    homeIndicator: boolean;
    telegramControls: boolean;
  };
}

export const telegramViewportPresets = {
  "telegram-ios-portrait": {
    viewport: { width: 393, height: 852 },
    safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
    contentSafeArea: { top: 48, right: 0, bottom: 0, left: 0 },
    chrome: { statusBar: true, homeIndicator: true, telegramControls: true },
  },
  "telegram-android-portrait": {
    viewport: { width: 412, height: 915 },
    safeArea: { top: 28, right: 0, bottom: 20, left: 0 },
    contentSafeArea: { top: 44, right: 0, bottom: 0, left: 0 },
    chrome: { statusBar: true, homeIndicator: true, telegramControls: true },
  },
  "telegram-ios-landscape": {
    viewport: { width: 852, height: 393 },
    safeArea: { top: 0, right: 47, bottom: 21, left: 47 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    chrome: { statusBar: false, homeIndicator: true, telegramControls: true },
  },
  "telegram-none": {
    viewport: { width: 393, height: 852 },
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    chrome: { statusBar: false, homeIndicator: false, telegramControls: false },
  },
} satisfies Record<string, TelegramViewportPreset>;

export type TelegramMockId = keyof typeof telegramViewportPresets;
const aliases: Record<string, TelegramMockId> = {
  ios: "telegram-ios-portrait",
  android: "telegram-android-portrait",
  landscape: "telegram-ios-landscape",
  none: "telegram-none",
};

export function resolveTelegramMockId(value: string | null): TelegramMockId | undefined {
  if (!value) return undefined;
  if (value in telegramViewportPresets) return value as TelegramMockId;
  return aliases[value];
}

function createChrome(className: string, text: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.textContent = text;
  return element;
}

export function activateTelegramViewportMock(preset: TelegramViewportPreset): void {
  document.documentElement.classList.add("telegram-mock-active");
  publishSafeArea(document.documentElement, {
    device: preset.safeArea,
    content: preset.contentSafeArea,
  });
  window.__FISHING_TELEGRAM_MOCK__ = preset;

  const layer = document.createElement("div");
  layer.className = "telegram-chrome";
  const presetId = Object.entries(telegramViewportPresets).find(([, candidate]) => candidate === preset)?.[0];
  layer.dataset.preset = presetId ?? "custom";

  const effectiveTop = preset.safeArea.top + preset.contentSafeArea.top;
  if (preset.chrome.statusBar) layer.append(createChrome("telegram-chrome-status", "9:41 · 5G ▰"));
  if (preset.chrome.telegramControls && effectiveTop > preset.safeArea.top) {
    layer.append(createChrome("telegram-chrome-controls", "‹ Fishing with Friends ·•••"));
  }
  for (const side of ["left", "right"] as const) {
    if (preset.safeArea[side]) layer.append(createChrome(`telegram-chrome-edge-${side}`, "SAFE"));
  }
  if (preset.chrome.homeIndicator) layer.append(createChrome("telegram-chrome-home", ""));

  document.body.append(layer);
}

declare global {
  interface Window {
    __FISHING_TELEGRAM_MOCK__?: TelegramViewportPreset;
  }
}
