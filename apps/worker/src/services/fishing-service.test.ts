import { describe, expect, it } from "vitest";
import { minimumFightSeconds, rodBreakChancePercent } from "./fishing-service";

const starterRod = { maxFishWeightKg: 2.5, breakResistance: 0.995 };
const heavyRod = { maxFishWeightKg: 18, breakResistance: 0.985 };

describe("rodBreakChancePercent", () => {
  it("never breaks a suitable rod on easy fish", () => {
    const chance = rodBreakChancePercent({ weightKg: 1.2, rodMaxFishWeightKg: starterRod.maxFishWeightKg, breakResistance: starterRod.breakResistance, performance: 0 });
    expect(chance).toBe(0);
  });

  it("keeps normal fish with a suitable rod in the 0-0.1% band", () => {
    const chance = rodBreakChancePercent({ weightKg: 2, rodMaxFishWeightKg: starterRod.maxFishWeightKg, breakResistance: starterRod.breakResistance, performance: 0.7 });
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThanOrEqual(0.1);
  });

  it("keeps trophy fish just over the limit within about 0.5-1.5% with good play", () => {
    const chance = rodBreakChancePercent({ weightKg: 8.4, rodMaxFishWeightKg: 8, breakResistance: 0.99, performance: 0.9 });
    expect(chance).toBeGreaterThan(0.3);
    expect(chance).toBeLessThanOrEqual(1.5);
  });

  it("raises the mismatch band to roughly 2-8% and rewards strong play", () => {
    const poorPlay = rodBreakChancePercent({ weightKg: 12, rodMaxFishWeightKg: 8, breakResistance: 0.99, performance: 0.1 });
    const goodPlay = rodBreakChancePercent({ weightKg: 12, rodMaxFishWeightKg: 8, breakResistance: 0.99, performance: 0.95 });
    expect(poorPlay).toBeGreaterThanOrEqual(4);
    expect(goodPlay).toBeLessThan(poorPlay);
    expect(poorPlay).toBeLessThanOrEqual(12);
  });

  it("scales with rod fragility at extreme mismatch", () => {
    const fragile = rodBreakChancePercent({ weightKg: 30, rodMaxFishWeightKg: heavyRod.maxFishWeightKg, breakResistance: heavyRod.breakResistance, performance: 0 });
    const tough = rodBreakChancePercent({ weightKg: 30, rodMaxFishWeightKg: 30, breakResistance: 1, performance: 0 });
    expect(fragile).toBeGreaterThan(tough);
  });

  it("is capped at twelve percent", () => {
    const chance = rodBreakChancePercent({ weightKg: 200, rodMaxFishWeightKg: 1, breakResistance: 0.98, performance: 0 });
    expect(chance).toBe(12);
  });
});

describe("minimumFightSeconds", () => {
  it("sits below honest fight durations but above scripted instant submissions", () => {
    expect(minimumFightSeconds(1)).toBeGreaterThanOrEqual(0.5);
    expect(minimumFightSeconds(1)).toBeLessThan(3);
    expect(minimumFightSeconds(1.32)).toBeLessThan(3);
  });
});
