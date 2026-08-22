import { describe, expect, it } from "vitest";
import { GAME_CATALOG } from "./catalog";

describe("game catalog", () => {
  it("contains the planned initial freshwater progression", () => {
    expect(GAME_CATALOG.locations.map((location) => location.id)).toEqual(["willow-pond", "pinewater-lake", "lake-greywater"]);
    expect(GAME_CATALOG.boats).toHaveLength(3);
    expect(GAME_CATALOG.rods).toHaveLength(3);
    expect(GAME_CATALOG.lures).toHaveLength(3);
    expect(GAME_CATALOG.baits).toHaveLength(4);
    expect(GAME_CATALOG.fish.length).toBeGreaterThanOrEqual(12);
  });

  it("keeps fish ranges plausible and every catalogue reference resolvable", () => {
    const baitIds = new Set(GAME_CATALOG.baits.map((bait) => bait.id));
    const lureIds = new Set(GAME_CATALOG.lures.map((lure) => lure.id));
    const locationIds = new Set(GAME_CATALOG.locations.map((location) => location.id));

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
  });
});
