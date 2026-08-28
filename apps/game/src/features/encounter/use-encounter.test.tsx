/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveFishingEncounterResponse,
  AuthResponse,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishSpecies,
  FishingEncounterResponse,
  GameStateResponse,
  LeaderboardResponse,
  MeResponse,
  PlayerProfile,
} from "@fishing/shared/contracts";
import { createAppQueryClient } from "../../api/query-client";
import type { FishingCompleteEvent, FishingRuntime } from "../../game/phaser-runtime";
import { useEncounter, type EncounterController } from "./use-encounter";
import type { BootstrapApi } from "../../app/use-bootstrap";

const species: FishSpecies = {
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
  preferredLureIds: ["spinner"],
  availableLocationIds: ["willow-pond"],
  source: { name: "Fixture", url: "https://example.com/fish" },
};

const encounter: FishingEncounterResponse = {
  encounterId: "encounter-1",
  difficultySeed: 42,
  locationId: "willow-pond",
  locationName: "Willow Pond",
  species,
  miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0.5, catchMeterLossRate: 0.4, durationSeconds: 12 },
  rodRiskBand: "low",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const gameState = {
  catalog: {
    fish: [species],
    locations: [{ id: "willow-pond", name: "Willow Pond", description: "A fixture pond.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id] }],
    boats: [{ id: "canoe", name: "Canoe", description: "A fixture boat.", tier: 1, priceCoins: 0, unlocksLocationIds: ["willow-pond"] }],
    rods: [{ id: "starter-rod", name: "Starter Rod", description: "A fixture rod.", priceCoins: 0, strength: 1, control: 1, maxFishWeightKg: 2, breakResistance: 0.9, catchZoneBonus: 0.05 }],
    lures: [{ id: "spinner", name: "Spinner", description: "A fixture lure.", priceCoins: 0, maximumDurability: 10, catchZoneBonus: 0.05, difficultyModifier: 0, preferredFishIds: [species.id] }],
    baits: [{ id: "worm", name: "Worms", description: "A fixture bait.", priceCoins: 0, attraction: 1, fishIds: [species.id] }],
  },
  coins: 100,
  activeEquipment: { boatId: "canoe", rodId: "starter-rod", lureId: "spinner", baitId: "worm" },
  inventory: { boats: [{ id: "canoe", quantity: 1, durability: null }], rods: [{ id: "starter-rod", quantity: 1, durability: null }], lures: [{ id: "spinner", quantity: 1, durability: 10 }], baits: [{ id: "worm", quantity: 10, durability: null }] },
  locations: [{ id: "willow-pond", name: "Willow Pond", description: "A fixture pond.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id], unlocked: true }],
} satisfies GameStateResponse;

const specimen = {
  id: "catch-1",
  speciesId: species.id,
  species,
  weightKg: 0.4,
  lengthCm: 20,
  quality: "good" as const,
  saleValueCoins: 12,
  caughtAt: "2099-01-01T00:00:00.000Z",
  locationId: encounter.locationId,
  locationName: encounter.locationName,
};
const completeResult: CompleteFishingResponse = { outcome: "caught", message: "Landed", species, rodId: "starter-rod", rodRiskBand: "low", rodBreakChancePercent: 0, catch: specimen, rodBroke: false, replacementRodId: null };
const decisionResult: CatchDecisionResponse = { decision: "keep", coins: 100, catch: specimen };
const player: PlayerProfile = { id: "player-1", telegramUsername: "fixture", displayName: "Fixture", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z" };

function createApi(overrides: Partial<BootstrapApi> = {}): BootstrapApi {
  return {
    hasSession: true,
    getMe: vi.fn<(...args: [AbortSignal?]) => Promise<MeResponse>>().mockResolvedValue({ player } as MeResponse),
    authenticateWithTelegram: vi.fn<(...args: [string]) => Promise<AuthResponse>>(),
    authenticateForDevelopment: vi.fn<() => Promise<AuthResponse>>(),
    getGameState: vi.fn<(...args: [AbortSignal?]) => Promise<GameStateResponse>>().mockResolvedValue(gameState),
    getActiveEncounter: vi.fn<(...args: [AbortSignal?]) => Promise<ActiveFishingEncounterResponse>>().mockResolvedValue({ encounter: null, expired: false }),
    getJournal: vi.fn<(...args: [AbortSignal?]) => Promise<FishJournalResponse>>().mockResolvedValue({ entries: [] }),
    getLeaderboard: vi.fn<(...args: [AbortSignal?]) => Promise<LeaderboardResponse>>().mockResolvedValue({ metric: "kept", metricDescription: "Fixture", viewer: { playerId: player.id, displayName: player.displayName, rank: 1, keptFishCount: 0, heaviestKeptFishKg: 0 }, entries: [] }),
    getCollection: vi.fn<(...args: [AbortSignal?]) => Promise<CollectionResponse>>().mockResolvedValue({ fish: [] }),
    purchase: vi.fn(),
    sellCatch: vi.fn(),
    selectEquipment: vi.fn(),
    digForWorms: vi.fn(),
    startFishing: vi.fn().mockResolvedValue(encounter),
    completeFishing: vi.fn().mockResolvedValue(completeResult),
    decideCatch: vi.fn().mockResolvedValue(decisionResult),
    ...overrides,
  };
}

function createRuntime() {
  const completeHandlers = new Set<(event: FishingCompleteEvent) => void>();
  const ambientHandlers = new Set<(encounterId?: string) => void>();
  const runtime: FishingRuntime = {
    setSafeArea: vi.fn(),
    startFight: vi.fn(),
    returnToLobby: vi.fn(async () => {}),
    onComplete: vi.fn((handler) => { completeHandlers.add(handler); return () => completeHandlers.delete(handler); }),
    onAmbient: vi.fn((handler) => { ambientHandlers.add(handler); return () => ambientHandlers.delete(handler); }),
    destroy: vi.fn(),
    emitCompleteForTest: vi.fn((event) => completeHandlers.forEach((handler) => handler(event))),
    emitAmbientForTest: vi.fn((encounterId) => ambientHandlers.forEach((handler) => handler(encounterId))),
  };
  return runtime;
}

function Harness({ api, runtime, activeEncounter }: { api: BootstrapApi; runtime: FishingRuntime; activeEncounter: ActiveFishingEncounterResponse }) {
  const controller = useEncounter({ api, runtime, bootstrapPhase: "ready", activeEncounter, isDevelopment: false, telegramAvailable: true });
  return <HarnessView controller={controller} />;
}

function HarnessView({ controller }: { controller: EncounterController }) {
  const { state } = controller;
  return (
    <div>
      <output data-testid="phase">{state.phase}</output>
      {state.result?.catch && (state.phase === "result" || state.phase === "deciding") ? <><button type="button" disabled={state.phase === "deciding"} onClick={() => controller.chooseDecision("keep")}>Keep</button><button type="button" onClick={() => controller.chooseDecision("sell")}>Sell</button></> : null}
      {state.phase === "recoverable-error" ? <button type="button" onClick={controller.retry}>Retry</button> : null}
      <button type="button" onClick={() => void controller.returnToLakes()}>Back</button>
    </div>
  );
}

function renderHarness(api: BootstrapApi, runtime: FishingRuntime, active: ActiveFishingEncounterResponse) {
  return render(<QueryClientProvider client={createAppQueryClient()}><Harness api={api} runtime={runtime} activeEncounter={active} /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  document.body.classList.remove("is-fighting");
});

describe("React Phase 6 encounter lifecycle", () => {
  it("resumes, gates DOM results on ambient mode, and sends completion/decision once", async () => {
    const decisionRequest = new Promise<CatchDecisionResponse>(() => {});
    const api = createApi({ decideCatch: vi.fn(() => decisionRequest) });
    const runtime = createRuntime();
    renderHarness(api, runtime, { encounter, expired: false });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("fighting"));
    expect(runtime.startFight).toHaveBeenCalledTimes(1);

    runtime.emitCompleteForTest({ encounterId: encounter.encounterId, performance: 0.85 });
    runtime.emitCompleteForTest({ encounterId: encounter.encounterId, performance: 0.85 });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("resolving"));
    expect(api.completeFishing).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Keep" })).not.toBeInTheDocument();

    runtime.emitAmbientForTest(encounter.encounterId);
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("result"));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    screen.getByRole("button", { name: "Keep" }).click();
    expect(api.decideCatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
  });

  it("offers explicit completion and decision retries after non-401 failures", async () => {
    const api = createApi({ completeFishing: vi.fn().mockRejectedValueOnce(new Error("Completion offline.")).mockResolvedValueOnce(completeResult), decideCatch: vi.fn().mockRejectedValueOnce(new Error("Choice offline.")).mockResolvedValueOnce(decisionResult) });
    const runtime = createRuntime();
    renderHarness(api, runtime, { encounter, expired: false });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("fighting"));
    runtime.emitCompleteForTest({ encounterId: encounter.encounterId, performance: 0.5 });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("recoverable-error"));
    expect(api.completeFishing).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.completeFishing).toHaveBeenCalledTimes(2));
    runtime.emitAmbientForTest(encounter.encounterId);
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("result"));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("recoverable-error"));
    expect(api.decideCatch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.decideCatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("decision-result"));
  });

  it("restores a completed decision receipt after remount without replaying mutations", async () => {
    const api = createApi();
    const runtime = createRuntime();
    const first = renderHarness(api, runtime, { encounter, expired: false });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("fighting"));
    runtime.emitCompleteForTest({ encounterId: encounter.encounterId, performance: 0.9 });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("resolving"));
    runtime.emitAmbientForTest(encounter.encounterId);
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("result"));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("decision-result"));
    first.unmount();

    const remountRuntime = createRuntime();
    renderHarness(api, remountRuntime, { encounter: null, expired: false });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("decision-result"));
    expect(api.completeFishing).toHaveBeenCalledTimes(1);
    expect(api.decideCatch).toHaveBeenCalledTimes(1);
    expect(remountRuntime.startFight).not.toHaveBeenCalled();
  });

  it("explicitly shows expiry, ignores stale ambient, and returns to lobby", async () => {
    const api = createApi();
    const runtime = createRuntime();
    renderHarness(api, runtime, { encounter: null, expired: true });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("lobby"));
    expect(screen.queryByRole("button", { name: "Keep" })).not.toBeInTheDocument();
    const activeRuntime = createRuntime();
    cleanup();
    const activeView = renderHarness(api, activeRuntime, { encounter, expired: false });
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("fighting"));
    activeRuntime.emitAmbientForTest("old-encounter");
    expect(screen.getByTestId("phase")).toHaveTextContent("fighting");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("lobby"));
    expect(activeRuntime.returnToLobby).toHaveBeenCalledTimes(1);
    activeView.unmount();
  });
});
