import { describe, expect, it } from "vitest";
import { GAME_CATALOG } from "@fishing/shared";
import { minimumFightSeconds, rodBreakChancePercent, speciesSelectionWeight } from "./fishing-service";

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

describe("economy progression", () => {
  const rarityValue = { common: 1, uncommon: 1.12, rare: 1.32, legendary: 1.7 } as const;

  function bestTypicalNet(locationId: string): number {
    const location = GAME_CATALOG.locations.find((candidate) => candidate.id === locationId)!;
    let best = Number.NEGATIVE_INFINITY;
    for (const bait of GAME_CATALOG.baits) {
      for (const lure of GAME_CATALOG.lures) {
        const eligible = GAME_CATALOG.fish.filter(
          (species) => location.fishIds.includes(species.id) && bait.fishIds.includes(species.id) && species.acceptedBaitIds.includes(bait.id),
        );
        if (eligible.length === 0) continue;
        const weights = eligible.map((species) => speciesSelectionWeight(species, bait, lure));
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const gross = eligible.reduce(
          (sum, species, index) => sum + weights[index] * species.baseValueCoins * rarityValue[species.rarity],
          0,
        ) / totalWeight;
        best = Math.max(best, gross - bait.priceCoins - lure.priceCoins / lure.maximumDurability);
      }
    }
    return best;
  }

  it("increases the best skilled-play return at every boat tier without a grind wall", () => {
    const bestNetByTier = GAME_CATALOG.boats.map((boat) => Math.max(
      ...GAME_CATALOG.locations
        .filter((location) => location.requiredBoatId === boat.id)
        .map((location) => bestTypicalNet(location.id)),
    ));

    for (let index = 1; index < bestNetByTier.length; index += 1) {
      expect(bestNetByTier[index]).toBeGreaterThan(bestNetByTier[index - 1] * 1.2);
      const upgradeCost = GAME_CATALOG.boats[index].priceCoins - GAME_CATALOG.boats[index - 1].priceCoins;
      const skilledCatchesForUpgrade = upgradeCost / bestNetByTier[index - 1];
      expect(skilledCatchesForUpgrade).toBeGreaterThanOrEqual(8);
      expect(skilledCatchesForUpgrade).toBeLessThanOrEqual(60);
    }
  });

  it("makes bait attraction improve scarce-fish odds instead of cancelling out", () => {
    const common = GAME_CATALOG.fish.find((species) => species.rarity === "common")!;
    const rare = GAME_CATALOG.fish.find((species) => species.rarity === "rare")!;
    const basicBait = GAME_CATALOG.baits.find((bait) => bait.id === "worm")!;
    const premiumBait = GAME_CATALOG.baits.find((bait) => bait.id === "spawn-sack")!;
    const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === "copper-spinner")!;
    const basicRatio = speciesSelectionWeight(rare, basicBait, lure) / speciesSelectionWeight(common, basicBait, lure);
    const premiumRatio = speciesSelectionWeight(rare, premiumBait, lure) / speciesSelectionWeight(common, premiumBait, lure);
    expect(premiumRatio).toBeGreaterThan(basicRatio);
  });
});
