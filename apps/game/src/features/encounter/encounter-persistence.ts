import type { CatchDecisionResponse, CompleteFishingResponse, FishingEncounterResponse } from "@fishing/shared/contracts";

const STORAGE_KEY = "fishing-with-friends.encounter-recovery";

export interface EncounterRecoverySnapshot {
  encounter: FishingEncounterResponse;
  result: CompleteFishingResponse;
  decision?: CatchDecisionResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSnapshot(value: unknown): value is EncounterRecoverySnapshot {
  if (!isRecord(value) || !isRecord(value.encounter) || !isRecord(value.result)) return false;
  if (typeof value.encounter.encounterId !== "string" || typeof value.result.outcome !== "string") return false;
  if (value.decision !== undefined) {
    if (!isRecord(value.decision) || (value.decision.decision !== "keep" && value.decision.decision !== "sell")) return false;
  }
  return value.result.outcome === "caught" || value.result.outcome === "lost";
}

export function readEncounterRecovery(): EncounterRecoverySnapshot | undefined {
  try {
    const encoded = sessionStorage.getItem(STORAGE_KEY);
    if (!encoded) return undefined;
    const decoded: unknown = JSON.parse(encoded);
    return isSnapshot(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function writeEncounterRecovery(snapshot: EncounterRecoverySnapshot): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Recovery is best effort. The Worker remains authoritative if storage is unavailable.
  }
}

export function writeEncounterDecision(snapshot: EncounterRecoverySnapshot, decision: CatchDecisionResponse): void {
  writeEncounterRecovery({ ...snapshot, decision });
}

export function clearEncounterRecovery(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage teardown failures; the active encounter endpoint is authoritative.
  }
}
