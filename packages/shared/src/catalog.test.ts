import { describe, expect, it } from "vitest";
import { GAME_CATALOG } from "./catalog";

describe("game catalog", () => {
  it("contains the planned freshwater progression and side-water content", () => {
    expect(GAME_CATALOG.locations.map((location) => location.id)).toEqual([
      "willow-pond", "mill-creek", "cedar-marsh", "pinewater-lake", "granite-reservoir",
      "silverpine-river", "lake-greywater", "northwind-channel", "superior-reach", "stormglass-basin",
    ]);
    expect(GAME_CATALOG.boats).toHaveLength(6);
    expect(GAME_CATALOG.rods).toHaveLength(8);
    expect(GAME_CATALOG.lures).toHaveLength(11);
    expect(GAME_CATALOG.baits).toHaveLength(12);
    expect(GAME_CATALOG.fish).toHaveLength(40);
    expect(GAME_CATALOG.locations.find((location) => location.id === "cedar-marsh")?.fishIds).toHaveLength(7);
  });

  it("keeps fish ranges plausible and every catalogue reference resolvable", () => {
    const baitIds = new Set(GAME_CATALOG.baits.map((bait) => bait.id));
    const lureIds = new Set(GAME_CATALOG.lures.map((lure) => lure.id));
    const locationIds = new Set(GAME_CATALOG.locations.map((location) => location.id));
    const fishIds = new Set(GAME_CATALOG.fish.map((species) => species.id));

    for (const species of GAME_CATALOG.fish) {
      expect(species.minimumWeightKg).toBeGreaterThan(0);
      expect(species.minimumWeightKg).toBeLessThan(species.typicalWeightKg);
      expect(species.typicalWeightKg).toBeLessThan(species.maximumWeightKg);
      expect(species.minimumLengthCm).toBeLessThan(species.typicalLengthCm);
      expect(species.typicalLengthCm).toBeLessThan(species.maximumLengthCm);
      expect(species.source.url).toMatch(/^https:\/\//);
      expect(species.acceptedBaitIds.every((baitId) => baitIds.has(baitId))).toBe(true);
      expect(species.preferredLureIds.every((lureId) => lureIds.has(lureId))).toBe(true);
      expect(species.availableLocationIds.every((locationId) => locationIds.has(locationId))).toBe(true);
    }
    for (const location of GAME_CATALOG.locations) {
      expect(location.fishIds.every((fishId) => fishIds.has(fishId))).toBe(true);
      expect(location.expectedValueMinCoins).toBeLessThan(location.expectedValueMaxCoins);
      for (const fishId of location.fishIds) {
        expect(GAME_CATALOG.fish.find((species) => species.id === fishId)?.availableLocationIds).toContain(location.id);
      }
    }
    for (const bait of GAME_CATALOG.baits) {
      expect(bait.fishIds.every((fishId) => fishIds.has(fishId))).toBe(true);
    }
    for (const lure of GAME_CATALOG.lures) {
      expect(lure.preferredFishIds.every((fishId) => fishIds.has(fishId))).toBe(true);
    }

    for (const species of GAME_CATALOG.fish) {
      const hasUsableBait = GAME_CATALOG.baits.some((bait) => bait.fishIds.includes(species.id) && species.acceptedBaitIds.includes(bait.id));
      expect(hasUsableBait, `${species.commonName} needs at least one mutually compatible bait`).toBe(true);
    }
  });

  it("keeps permanent-upgrade prices and capability moving forward", () => {
    for (let index = 1; index < GAME_CATALOG.boats.length; index += 1) {
      expect(GAME_CATALOG.boats[index].tier).toBeGreaterThan(GAME_CATALOG.boats[index - 1].tier);
      expect(GAME_CATALOG.boats[index].priceCoins).toBeGreaterThan(GAME_CATALOG.boats[index - 1].priceCoins);
    }
    for (let index = 1; index < GAME_CATALOG.rods.length; index += 1) {
      expect(GAME_CATALOG.rods[index].priceCoins).toBeGreaterThan(GAME_CATALOG.rods[index - 1].priceCoins);
      expect(GAME_CATALOG.rods[index].maxFishWeightKg).toBeGreaterThan(GAME_CATALOG.rods[index - 1].maxFishWeightKg);
      expect(GAME_CATALOG.rods[index].control).toBeGreaterThan(GAME_CATALOG.rods[index - 1].control);
    }
  });
});
