import type { GameStateResponse } from "@fishing/shared/contracts";
import { rodRiskBandForWeight } from "@fishing/shared/risk";

export function sharedContractsProbe(state: GameStateResponse | undefined): string {
  return `${state ? "contracts" : "empty"}:${rodRiskBandForWeight(1, 2)}`;
}
