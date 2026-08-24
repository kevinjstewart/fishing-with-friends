import { describe, expect, it } from "vitest";
import { rodRiskBandForWeight } from "./risk";

describe("rod risk bands", () => {
  it("matches the authoritative weight thresholds used for previews", () => {
    expect(rodRiskBandForWeight(1.6, 2.5)).toBe("low");
    expect(rodRiskBandForWeight(2.5, 2.5)).toBe("moderate");
    expect(rodRiskBandForWeight(2.51, 2.5)).toBe("high");
  });

  it("treats a missing or unusable rod rating as high risk", () => {
    expect(rodRiskBandForWeight(0, 0)).toBe("high");
  });
});
