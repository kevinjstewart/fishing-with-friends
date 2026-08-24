import { describe, expect, it } from "vitest";
import { GAME_CATALOG } from "@fishing/shared";
import { getSpeciesSizeComparison } from "./specimen-size";

describe("species size comparison", () => {
  const species = GAME_CATALOG.fish.find((candidate) => candidate.id === "yellow-perch");

  it("marks a typical specimen against its species range", () => {
    expect(species).toBeDefined();
    const comparison = getSpeciesSizeComparison({ species: species!, weightKg: species!.typicalWeightKg });

    expect(comparison.label).toBe("Typical size");
    expect(comparison.fillPercent).toBeCloseTo(comparison.typicalMarkerPercent, 5);
    expect(comparison.percentOfMaximum).toBe(13);
  });

  it("clamps unusually small and large specimens to the scale", () => {
    expect(species).toBeDefined();
    expect(getSpeciesSizeComparison({ species: species!, weightKg: 0 })).toMatchObject({
      fillPercent: 0,
      label: "Below typical",
    });
    expect(getSpeciesSizeComparison({ species: species!, weightKg: species!.maximumWeightKg })).toMatchObject({
      fillPercent: 100,
      percentOfMaximum: 100,
      label: "Above typical",
    });
  });
});
