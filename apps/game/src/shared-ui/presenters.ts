import type { FishSpecimen, FishSpecies, GameStateResponse, LocationAvailability, RiskBand } from "@fishing/shared/contracts";
import type { CollectionSortMode } from "../ui/types";

export const collectionSorters: Record<CollectionSortMode, (a: FishSpecimen, b: FishSpecimen) => number> = {
  newest: (a, b) => b.caughtAt.localeCompare(a.caughtAt),
  heaviest: (a, b) => b.weightKg - a.weightKg,
  value: (a, b) => b.saleValueCoins - a.saleValueCoins,
  species: (a, b) => a.species.commonName.localeCompare(b.species.commonName) || b.weightKg - a.weightKg,
};

export const RISK_PRESENTATION: Record<RiskBand, { label: string; consequence: string }> = {
  low: {
    label: "Low rod risk",
    consequence: "A suitable rod should handle the fish here without a break roll.",
  },
  moderate: {
    label: "Moderate rod risk",
    consequence: "A poor fight against a heavy fish can damage or break your rod.",
  },
  high: {
    label: "High rod risk",
    consequence: "A heavy fish can snap this rod; if it breaks, it leaves your loadout.",
  },
};

export function formatCoins(coins: number): string {
  return coins.toLocaleString();
}

export function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatWeight(weightKg: number): string {
  return weightKg > 0 ? `${weightKg.toFixed(1)} kg` : "—";
}

export function riskLabel(band: RiskBand): string {
  return RISK_PRESENTATION[band].label;
}

export function journalDiscoveryHint(state: GameStateResponse, species: FishSpecimen["species"]): string {
  const locationCandidates = species.availableLocationIds
    .map((id) => state.locations.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is LocationAvailability => candidate !== undefined);
  const location = locationCandidates.find((candidate) => candidate.unlocked);
  const locationDefinition = location ?? locationCandidates[0] ?? state.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]);
  const boat = locationDefinition ? state.catalog.boats.find((candidate) => candidate.id === locationDefinition.requiredBoatId) : undefined;
  const locationHint = location
    ? `Try ${location.name}`
    : locationDefinition
      ? `Unlock ${locationDefinition.name}${boat ? ` with a ${boat.name}` : ""}`
      : "Explore the lakes";
  const baitNames = species.acceptedBaitIds
    .map((id) => state.catalog.baits.find((candidate) => candidate.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 2);
  const baitHint = baitNames.length > 0 ? ` using ${baitNames.join(" or ")}` : " with a patient cast";
  return `${locationHint}${baitHint}.`;
}

export function speciesNamesForIds(state: GameStateResponse, ids: string[]): string[] {
  return ids
    .map((id) => state.catalog.fish.find((species) => species.id === id)?.commonName ?? id)
    .filter((name, index, names) => names.indexOf(name) === index);
}

export function eligibleFishForSetup(state: GameStateResponse, location: LocationAvailability, baitId?: string): FishSpecies[] {
  if (!baitId) return [];
  return state.catalog.fish.filter(
    (species) =>
      location.fishIds.includes(species.id) &&
      species.availableLocationIds.includes(location.id) &&
      species.acceptedBaitIds.includes(baitId),
  );
}

export function locationNamesForBoat(state: GameStateResponse, ids: string[]): string[] {
  return ids.map((id) => state.catalog.locations.find((location) => location.id === id)?.name ?? id);
}

export type { FishSpecies };
