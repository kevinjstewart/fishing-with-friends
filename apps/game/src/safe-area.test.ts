import { describe, expect, it } from "vitest";
import { telegramViewportPresets } from "./telegram/mock";

describe("Telegram viewport presets", () => {
  const presets = Object.entries(telegramViewportPresets);

  it.each(presets)("has deterministic non-negative insets for %s", (_id, preset) => {
    expect(preset.viewport.width).toBeGreaterThan(0);
    expect(preset.viewport.height).toBeGreaterThan(0);
    for (const inset of [preset.safeArea, preset.contentSafeArea]) {
      expect(inset.top).toBeGreaterThanOrEqual(0);
      expect(inset.right).toBeGreaterThanOrEqual(0);
      expect(inset.bottom).toBeGreaterThanOrEqual(0);
      expect(inset.left).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps portrait and landscape coverage explicit", () => {
    expect(Object.keys(telegramViewportPresets)).toEqual([
      "telegram-ios-portrait",
      "telegram-android-portrait",
      "telegram-ios-landscape",
      "telegram-none",
    ]);
  });
});
