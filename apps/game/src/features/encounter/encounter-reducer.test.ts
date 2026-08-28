import { describe, expect, it } from "vitest";
import type { CatchDecisionResponse, CompleteFishingResponse, FishingEncounterResponse } from "@fishing/shared/contracts";
import { encounterReducer, initialEncounterState } from "./encounter-reducer";

const encounter: FishingEncounterResponse = {
  encounterId: "encounter-1",
  difficultySeed: 42,
  locationId: "willow-pond",
  locationName: "Willow Pond",
  species: {
    id: "yellow-perch",
    commonName: "Yellow Perch",
    scientificName: "Perca flavescens",
    description: "A fixture fish.",
    habitat: "Pond",
    nativeRange: "Ontario",
    minimumWeightKg: 0.1,
    typicalWeightKg: 0.4,
    maximumWeightKg: 1.2,
    minimumLengthCm: 10,
    typicalLengthCm: 20,
    maximumLengthCm: 35,
    rarity: "common",
    baseValueCoins: 10,
    difficulty: 1,
    movementProfile: { speed: 0.2, acceleration: 0.2, directionChangeFrequency: 0.2, unpredictability: 0.2, fightDurationSeconds: 4 },
    acceptedBaitIds: ["worm"],
    preferredLureIds: ["copper-spinner"],
    availableLocationIds: ["willow-pond"],
    source: { name: "Fixture", url: "https://example.com/fish" },
  },
  miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0.5, catchMeterLossRate: 0.4, durationSeconds: 12 },
  rodRiskBand: "low",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const completeResult: CompleteFishingResponse = {
  outcome: "caught",
  message: "Landed",
  species: encounter.species,
  rodId: "starter-rod",
  rodRiskBand: "low",
  rodBreakChancePercent: 0,
  catch: {
    id: "catch-1",
    speciesId: encounter.species.id,
    species: encounter.species,
    weightKg: 0.4,
    lengthCm: 20,
    quality: "good",
    saleValueCoins: 12,
    caughtAt: "2099-01-01T00:00:00.000Z",
    locationId: encounter.locationId,
    locationName: encounter.locationName,
  },
  rodBroke: false,
  replacementRodId: null,
};

const decisionResult: CatchDecisionResponse = {
  decision: "keep",
  coins: 100,
  catch: completeResult.catch!,
};

describe("encounterReducer", () => {
  it("covers boot, active encounter resume, expiry, empty lobby, and start failure/retry", () => {
    expect(encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter })).toMatchObject({ phase: "fighting", encounter, ambientReady: false });
    expect(encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EXPIRED" })).toMatchObject({ phase: "lobby", expired: true, ambientReady: true });
    expect(encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EMPTY" })).toMatchObject({ phase: "lobby", expired: false });

    const lobby = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EMPTY" });
    const starting = encounterReducer(lobby, { type: "START_REQUESTED" });
    expect(starting.phase).toBe("starting");
    const failed = encounterReducer(starting, { type: "START_FAILED", message: "no connection" });
    expect(failed).toMatchObject({ phase: "recoverable-error", error: { operation: "start", message: "no connection" } });
    expect(encounterReducer(failed, { type: "RETRY" }).phase).toBe("starting");

    const fighting = encounterReducer(starting, { type: "START_SUCCEEDED", encounter });
    const runtimeFailed = encounterReducer(fighting, { type: "RUNTIME_FAILED", encounterId: encounter.encounterId, message: "chunk unavailable" });
    expect(runtimeFailed).toMatchObject({ phase: "recoverable-error", error: { operation: "start", encounterId: encounter.encounterId } });
  });

  it("accepts boot retry and successful start, and returns every active phase to lobby", () => {
    const bootFailed = encounterReducer(initialEncounterState, { type: "BOOT_FAILED", message: "offline" });
    expect(encounterReducer(bootFailed, { type: "BOOT_RETRY" })).toEqual(initialEncounterState);

    const lobby = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EMPTY" });
    const starting = encounterReducer(lobby, { type: "START_REQUESTED" });
    const fighting = encounterReducer(starting, { type: "START_SUCCEEDED", encounter });
    expect(fighting).toMatchObject({ phase: "fighting", encounter, ambientReady: false });

    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: encounter.encounterId, performance: 0.8 });
    const result = encounterReducer(
      encounterReducer(resolving, { type: "COMPLETE_SUCCEEDED", encounterId: encounter.encounterId, result: completeResult }),
      { type: "PHASER_AMBIENT" },
    );
    const deciding = encounterReducer(result, { type: "DECISION_REQUESTED", decision: "keep" });
    const decisionResult = encounterReducer(deciding, {
      type: "DECISION_SUCCEEDED",
      catchId: "catch-1",
      result: { decision: "keep", coins: 100, catch: completeResult.catch! },
    });
    const recoverable = encounterReducer(deciding, { type: "DECISION_FAILED", catchId: "catch-1", message: "offline" });

    for (const state of [fighting, resolving, result, deciding, decisionResult, recoverable]) {
      expect(encounterReducer(state, { type: "RETURN_TO_LOBBY" })).toMatchObject({ phase: "lobby", expired: false, encounter: null });
    }
  });

  it("requires Phaser ambient mode before exposing a completed result", () => {
    const fighting = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter });
    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: "encounter-1", performance: 0.8 });
    const resolved = encounterReducer(resolving, { type: "COMPLETE_SUCCEEDED", encounterId: "encounter-1", result: completeResult });
    expect(resolved).toMatchObject({ phase: "resolving", result: completeResult, ambientReady: false });
    expect(encounterReducer(resolved, { type: "PHASER_AMBIENT" })).toMatchObject({ phase: "result", result: completeResult, ambientReady: true });
  });

  it("covers completion failure/retry and catch decision success/failure/retry", () => {
    const fighting = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter });
    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: "encounter-1", performance: 0.8 });
    const failedCompletion = encounterReducer(resolving, { type: "COMPLETE_FAILED", encounterId: "encounter-1", message: "timeout" });
    expect(failedCompletion.error?.operation).toBe("completion");
    const retrying = encounterReducer(failedCompletion, { type: "RETRY" });
    expect(encounterReducer(failedCompletion, { type: "RETRY", ambientReady: true })).toMatchObject({ phase: "resolving", ambientReady: true });
    const result = encounterReducer(
      encounterReducer(retrying, { type: "COMPLETE_SUCCEEDED", encounterId: "encounter-1", result: completeResult }),
      { type: "PHASER_AMBIENT" },
    );
    const deciding = encounterReducer(result, { type: "DECISION_REQUESTED", decision: "keep" });
    expect(deciding).toMatchObject({ phase: "deciding", pendingDecision: "keep" });
    const failedDecision = encounterReducer(deciding, { type: "DECISION_FAILED", catchId: "catch-1", message: "offline" });
    expect(failedDecision.error?.operation).toBe("decision");
    const decisionRetry = encounterReducer(failedDecision, { type: "RETRY" });
    expect(decisionRetry.phase).toBe("deciding");
    expect(encounterReducer(decisionRetry, {
      type: "DECISION_SUCCEEDED",
      catchId: "catch-1",
      result: { decision: "keep", coins: 100, catch: completeResult.catch! },
    })).toMatchObject({ phase: "decision-result", decision: { decision: "keep" } });
  });

  it("rejects stale, invalid, and repeated completion or decision events", () => {
    const lobby = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EMPTY" });
    expect(encounterReducer(lobby, { type: "COMPLETE_REQUESTED", encounterId: "missing", performance: 1 })).toBe(lobby);

    const fighting = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter });
    expect(encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: "missing", performance: 1 })).toBe(fighting);
    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: "encounter-1", performance: 1 });
    expect(encounterReducer(resolving, { type: "COMPLETE_REQUESTED", encounterId: "encounter-1", performance: 1 })).toBe(resolving);
    expect(encounterReducer(resolving, { type: "COMPLETE_SUCCEEDED", encounterId: "stale", result: completeResult })).toBe(resolving);

    const result = encounterReducer(
      encounterReducer(resolving, { type: "COMPLETE_SUCCEEDED", encounterId: "encounter-1", result: completeResult }),
      { type: "PHASER_AMBIENT" },
    );
    expect(encounterReducer(result, { type: "DECISION_REQUESTED", decision: "keep" })).not.toBe(result);
    expect(encounterReducer(result, { type: "DECISION_REQUESTED", decision: "sell" })).toMatchObject({ phase: "deciding", pendingDecision: "sell" });
    const deciding = encounterReducer(result, { type: "DECISION_REQUESTED", decision: "keep" });
    expect(encounterReducer(deciding, { type: "DECISION_REQUESTED", decision: "sell" })).toBe(deciding);
    expect(encounterReducer(deciding, { type: "DECISION_SUCCEEDED", catchId: "stale", result: { decision: "keep", coins: 100, catch: completeResult.catch! } })).toBe(deciding);
  });

  it("returns from every active phase to the lobby and ignores invalid boot events", () => {
    expect(encounterReducer(initialEncounterState, { type: "RETURN_TO_LOBBY" })).toBe(initialEncounterState);
    const lobby = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_EMPTY" });
    expect(encounterReducer(lobby, { type: "RETURN_TO_LOBBY" })).toBe(lobby);
    expect(encounterReducer(initialEncounterState, { type: "PHASER_AMBIENT" })).toBe(initialEncounterState);
    expect(encounterReducer(initialEncounterState, { type: "BOOT_RETRY" })).toBe(initialEncounterState);
  });

  it("restores result and decision receipt snapshots without inventing completion data", () => {
    const restored = encounterReducer(initialEncounterState, { type: "RESULT_RESTORED", encounter, result: completeResult });
    expect(restored).toMatchObject({ phase: "result", encounter, result: completeResult, ambientReady: true });
    const receipt = encounterReducer(initialEncounterState, { type: "DECISION_RESULT_RESTORED", encounter, result: completeResult, decision: decisionResult });
    expect(receipt).toMatchObject({ phase: "decision-result", encounter, result: completeResult, decision: decisionResult, ambientReady: true });
    expect(receipt.result?.rodId).toBe("starter-rod");
  });

  it("reconciles a failed completion back to a live encounter and rejects stale failure/ambient events", () => {
    const fighting = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter });
    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: encounter.encounterId, performance: 0.7 });
    expect(encounterReducer(resolving, { type: "COMPLETE_FAILED", encounterId: "stale", message: "wrong attempt" })).toBe(resolving);
    const liveAgain = encounterReducer(resolving, { type: "ACTIVE_ENCOUNTER_RECONCILED_LIVE", encounter });
    expect(liveAgain).toMatchObject({ phase: "fighting", encounter, result: null, ambientReady: false });
    expect(encounterReducer(liveAgain, { type: "PHASER_AMBIENT", encounterId: encounter.encounterId })).toBe(liveAgain);
  });

  it("keeps independent completion and decision state transitions exact and stale-safe", () => {
    const fighting = encounterReducer(initialEncounterState, { type: "ACTIVE_ENCOUNTER_LIVE", encounter });
    const resolving = encounterReducer(fighting, { type: "COMPLETE_REQUESTED", encounterId: encounter.encounterId, performance: 0.8 });
    const completed = encounterReducer(resolving, { type: "COMPLETE_SUCCEEDED", encounterId: encounter.encounterId, result: completeResult });
    expect(encounterReducer(completed, { type: "COMPLETE_SUCCEEDED", encounterId: "stale", result: completeResult })).toBe(completed);
    const result = encounterReducer(completed, { type: "PHASER_AMBIENT", encounterId: encounter.encounterId });
    const deciding = encounterReducer(result, { type: "DECISION_REQUESTED", decision: "keep" });
    expect(encounterReducer(deciding, { type: "DECISION_FAILED", catchId: "stale", message: "wrong catch" })).toBe(deciding);
    expect(encounterReducer(deciding, { type: "DECISION_SUCCEEDED", catchId: "stale", result: decisionResult })).toBe(deciding);
    expect(encounterReducer(deciding, { type: "DECISION_SUCCEEDED", catchId: "catch-1", result: decisionResult })).toMatchObject({ phase: "decision-result", decision: decisionResult });
  });
});
