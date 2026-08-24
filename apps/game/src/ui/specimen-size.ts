import type { FishSpecimen } from "@fishing/shared";

export interface SpeciesSizeComparison {
  fillPercent: number;
  typicalMarkerPercent: number;
  percentOfMaximum: number;
  label: "Above typical" | "Typical size" | "Below typical";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getSpeciesSizeComparison(specimen: Pick<FishSpecimen, "weightKg" | "species">): SpeciesSizeComparison {
  const { minimumWeightKg, typicalWeightKg, maximumWeightKg } = specimen.species;
  const range = Math.max(maximumWeightKg - minimumWeightKg, Number.EPSILON);
  return {
    fillPercent: clamp(((specimen.weightKg - minimumWeightKg) / range) * 100, 0, 100),
    typicalMarkerPercent: clamp(((typicalWeightKg - minimumWeightKg) / range) * 100, 0, 100),
    percentOfMaximum: clamp(Math.round((specimen.weightKg / maximumWeightKg) * 100), 0, 100),
    label: specimen.weightKg > typicalWeightKg * 1.1 ? "Above typical" : specimen.weightKg < typicalWeightKg * 0.9 ? "Below typical" : "Typical size",
  };
}
