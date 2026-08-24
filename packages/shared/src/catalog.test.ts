import { describe, expect, it } from "vitest";
import { GAME_CATALOG } from "./catalog";

describe("game catalog", () => {
  it("contains the planned freshwater progression and side-water content", () => {
    expect(GAME_CATALOG.locations.map((location) => location.id)).toEqual(["willow-pond", "cedar-marsh", "pinewater-lake", "lake-greywater"]);
    expect(GAME_CATALOG.boats).toHaveLength(3);
    expect(GAME_CATALOG.rods).toHaveLength(3);
    expect(GAME_CATALOG.lures).toHaveLength(4);
    expect(GAME_CATALOG.baits).toHaveLength(5);
    expect(GAME_CATALOG.fish).toHaveLength(17);
    expect(GAME_CATALOG.locations.find((location) => location.id === "cedar-marsh")?.fishIds).toEqual(["black-crappie", "common-carp", "bowfin", "freshwater-drum"]);
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
    }
    for (const bait of GAME_CATALOG.baits) {
      expect(bait.fishIds.every((fishId) => fishIds.has(fishId))).toBe(true);
    }
    for (const lure of GAME_CATALOG.lures) {
      expect(lure.preferredFishIds.every((fishId) => fishIds.has(fishId))).toBe(true);
    }
  });
});
