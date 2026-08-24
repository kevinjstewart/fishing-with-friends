import type { RiskBand } from "./contracts";

/**
 * Keep the risk thresholds shared by the Worker and the browser preview.
 * The Worker remains authoritative for the actual encounter and break roll.
 */
export function rodRiskBandForWeight(weightKg: number, rodMaxFishWeightKg: number): RiskBand {
  if (rodMaxFishWeightKg <= 0) return "high";
  const ratio = weightKg / rodMaxFishWeightKg;
  if (ratio <= 0.65) return "low";
  if (ratio <= 1) return "moderate";
  return "high";
}
