import { describe, expect, it } from "vitest";
import { computeFightLayout, netWidth } from "./ocean-layout";

describe("OceanScene layout", () => {
  it("keeps the standard fight geometry inside safe-area insets", () => {
    const layout = computeFightLayout(393, 852, { top: 24, right: 0, bottom: 34, left: 0 });

    expect(layout.headerX).toBe(12);
    expect(layout.headerY).toBe(36);
    expect(layout.headerW).toBe(369);
    expect(layout.headerH).toBe(58);
    expect(layout.bottomY + layout.bottomH).toBe(808);
    expect(layout.trackX).toBe(196.5);
    expect(layout.trackW).toBeCloseTo(235.8);
    expect(layout.trackTop).toBe(112);
    expect(netWidth(layout)).toBeCloseTo(141.48);
  });

  it("uses the compact fight geometry for short viewports", () => {
    const layout = computeFightLayout(393, 540, { top: 0, right: 16, bottom: 20, left: 8 });

    expect(layout.headerX).toBe(20);
    expect(layout.headerY).toBe(8);
    expect(layout.headerH).toBe(50);
    expect(layout.bottomH).toBe(96);
    expect(layout.trackTop).toBe(68);
    expect(layout.trackBottom).toBe(406);
    expect(layout.trackW).toBeCloseTo(235.8);
  });
});
