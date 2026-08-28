/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveFishingEncounterResponse,
  FishingEncounterResponse,
  GameStateResponse,
  RecoveryResponse,
  SelectEquipmentResponse,
} from "@fishing/shared/contracts";
import { createAppQueryClient } from "../api/query-client";
import { LakesScreen } from "./lakes/LakesScreen";
import type { LakesMutationApi } from "./lakes/mutations";

const species = {
  id: "yellow-perch",
  commonName: "Yellow Perch",
  scientificName: "Perca flavescens",
  description: "A schooling freshwater fish.",
  habitat: "Clear lakes",
  nativeRange: "Great Lakes",
  minimumWeightKg: 0.05,
  typicalWeightKg: 0.25,
  maximumWeightKg: 1.8,
  minimumLengthCm: 8,
  typicalLengthCm: 25,
  maximumLengthCm: 50,
  rarity: "common" as const,
  baseValueCoins: 42,
  difficulty: 1,
  movementProfile: { speed: 1, acceleration: 1, directionChangeFrequency: 1, unpredictability: 1, fightDurationSeconds: 5 },
  acceptedBaitIds: ["worm"],
  preferredLureIds: ["spinner"],
  availableLocationIds: ["beginner-lake", "granite-reservoir"],
  source: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Yellow_perch" },
};

const activeEquipment = { boatId: "canoe", rodId: "starter-rod", lureId: "spinner", baitId: "worm" };
const state: GameStateResponse = {
  coins: 100,
  activeEquipment,
  inventory: {
    boats: [{ id: "canoe", quantity: 1, durability: null }],
    rods: [{ id: "starter-rod", quantity: 1, durability: null }, { id: "heavy-rod", quantity: 1, durability: null }],
    lures: [{ id: "spinner", quantity: 1, durability: 10 }, { id: "jig", quantity: 1, durability: 8 }],
    baits: [{ id: "worm", quantity: 12, durability: null }, { id: "minnow", quantity: 3, durability: null }],
  },
  locations: [
    { id: "beginner-lake", name: "Beginner Lake", description: "Calm water.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id], unlocked: true },
    { id: "granite-reservoir", name: "Granite Reservoir", description: "Deep water.", riskReason: "Heavy structure", riskBand: "high", requiredBoatId: "skiff", expectedValueMinCoins: 30, expectedValueMaxCoins: 120, fishIds: [species.id], unlocked: false },
  ],
  catalog: {
    fish: [species],
    locations: [
      { id: "beginner-lake", name: "Beginner Lake", description: "Calm water.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id] },
      { id: "granite-reservoir", name: "Granite Reservoir", description: "Deep water.", riskReason: "Heavy structure", riskBand: "high", requiredBoatId: "skiff", expectedValueMinCoins: 30, expectedValueMaxCoins: 120, fishIds: [species.id] },
    ],
    boats: [{ id: "canoe", name: "Canoe", description: "A starter boat.", tier: 1, priceCoins: 0, unlocksLocationIds: ["beginner-lake"] }, { id: "skiff", name: "River Skiff", description: "A deeper boat.", tier: 2, priceCoins: 80, unlocksLocationIds: ["granite-reservoir"] }],
    rods: [{ id: "starter-rod", name: "Starter Rod", description: "A steady rod.", priceCoins: 25, strength: 1, control: 1, maxFishWeightKg: 2, breakResistance: 0.9, catchZoneBonus: 0.05 }, { id: "heavy-rod", name: "Heavy Rod", description: "A strong rod.", priceCoins: 50, strength: 2, control: 1, maxFishWeightKg: 5, breakResistance: 0.95, catchZoneBonus: 0.1 }],
    lures: [{ id: "spinner", name: "Spinner", description: "A bright lure.", priceCoins: 12, maximumDurability: 10, catchZoneBonus: 0.05, difficultyModifier: 0, preferredFishIds: [species.id] }, { id: "jig", name: "Jig", description: "A deep lure.", priceCoins: 16, maximumDurability: 8, catchZoneBonus: 0.04, difficultyModifier: 0.1, preferredFishIds: [species.id] }],
    baits: [{ id: "worm", name: "Worms", description: "Natural bait.", priceCoins: 8, attraction: 1, fishIds: [species.id] }, { id: "minnow", name: "Minnows", description: "Live bait.", priceCoins: 12, attraction: 1.1, fishIds: [species.id] }],
  },
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function encounter(): FishingEncounterResponse {
  return {
    encounterId: "encounter-1",
    difficultySeed: 123,
    locationId: "beginner-lake",
    locationName: "Beginner Lake",
    species,
    miniGame: { catchZoneSize: 0.3, catchMeterGainRate: 0.2, catchMeterLossRate: 0.1, durationSeconds: 5 },
    rodRiskBand: "low",
    expiresAt: "2026-01-01T12:05:00.000Z",
  };
}

function renderLakes(api: LakesMutationApi, props: Partial<React.ComponentProps<typeof LakesScreen>> = {}) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <LakesScreen state={state} api={api} onOpenShop={vi.fn()} onEncounterStarted={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

function baseApi(overrides: Partial<LakesMutationApi> = {}): LakesMutationApi {
  return {
    getGameState: vi.fn().mockResolvedValue(state),
    getActiveEncounter: vi.fn().mockResolvedValue({ encounter: null, expired: false }),
    selectEquipment: vi.fn().mockResolvedValue({ activeEquipment, inventory: state.inventory }),
    digForWorms: vi.fn().mockResolvedValue({ wormsGranted: 5, lureRestored: true, coins: state.coins }),
    startFishing: vi.fn().mockResolvedValue(encounter()),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("React lakes", () => {
  it("renders authoritative lakes state, selects locations, and routes locked locations to boats", async () => {
    const onOpenShop = vi.fn();
    const user = userEvent.setup();
    renderLakes(baseApi(), { onOpenShop });

    expect(screen.getByRole("heading", { name: "Beginner Lake", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Fishing locations" })).toBeInTheDocument();
    expect(screen.getByText("Gentle water")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Moderate rod risk/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Granite Reservoir, locked/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Granite Reservoir, locked/i }));
    expect(onOpenShop).toHaveBeenCalledWith("boats");

    const beginner = screen.getByRole("radio", { name: /Beginner Lake/ });
    await user.click(beginner);
    expect(beginner).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Cast at Beginner Lake" })).toBeInTheDocument();
  });

  it("opens gear menus from touch and keyboard, closes outside and Escape, and restores focus", async () => {
    const user = userEvent.setup();
    renderLakes(baseApi());
    const rodSlot = document.querySelector('[data-equipment-type="rod"]') as HTMLElement;
    const tile = within(rodSlot).getByRole("button", { name: /Starter Rod.*Tap to switch/ });

    await user.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(within(rodSlot).getByRole("menu", { hidden: true })).toBeInTheDocument();
    await user.click(document.body);
    expect(tile).toHaveAttribute("aria-expanded", "false");

    await user.click(tile);
    tile.focus();
    await user.keyboard("{Escape}");
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(tile).toHaveFocus();
  });

  it("locks equipment selection synchronously, sends one request, and releases disabled state in finally", async () => {
    const request = deferred<SelectEquipmentResponse>();
    const selectEquipment = vi.fn(() => request.promise);
    const user = userEvent.setup();
    renderLakes(baseApi({ selectEquipment }));
    const rodSlot = document.querySelector('[data-equipment-type="rod"]') as HTMLElement;
    const tile = within(rodSlot).getByRole("button", { name: /Starter Rod.*Tap to switch/ });
    await user.click(tile);
    const heavyRod = screen.getByRole("menuitemradio", { name: /Heavy Rod/ });
    heavyRod.click();
    heavyRod.click();
    await waitFor(() => expect(selectEquipment).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(tile).toBeDisabled();
      expect(tile).toHaveAttribute("aria-disabled", "true");
    });
    request.resolve({ activeEquipment: { ...activeEquipment, rodId: "heavy-rod" }, inventory: state.inventory });
    await waitFor(() => expect(tile).not.toBeDisabled());
    expect(tile).toHaveAttribute("aria-disabled", "false");
  });

  it("locks duplicate recovery, refreshes authoritative state, and exposes a safe error retry", async () => {
    const recoveryState: GameStateResponse = { ...state, coins: 0, inventory: { ...state.inventory, baits: [{ id: "worm", quantity: 0, durability: null }], lures: [{ id: "spinner", quantity: 1, durability: 0 }] } };
    const request = deferred<RecoveryResponse>();
    const digForWorms = vi.fn(() => request.promise);
    const api = baseApi({ digForWorms });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <LakesScreen state={recoveryState} api={api} onOpenShop={vi.fn()} onEncounterStarted={vi.fn()} />
      </QueryClientProvider>,
    );
    const recovery = screen.getByRole("button", { name: "Dig for worms" });
    recovery.click();
    recovery.click();
    await waitFor(() => expect(digForWorms).toHaveBeenCalledTimes(1));
    expect(recovery).toBeDisabled();
    expect(recovery).toHaveAttribute("aria-disabled", "true");
    request.resolve({ wormsGranted: 5, lureRestored: true, coins: 0 });
    await waitFor(() => expect(recovery).not.toBeDisabled());
    expect(api.getGameState).toHaveBeenCalledTimes(1);

    cleanup();
    const failed = baseApi({ digForWorms: vi.fn().mockRejectedValue(new Error("Recovery offline.")) });
    renderLakes(failed, { state: recoveryState });
    await user.click(screen.getByRole("button", { name: "Dig for worms" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recovery offline.");
    expect(screen.getByRole("button", { name: "Retry recovery" })).toBeInTheDocument();
  });

  it("starts Phaser only from the returned encounter and reconciles failed or ambiguous casts", async () => {
    const request = deferred<FishingEncounterResponse>();
    const startFishing = vi.fn(() => request.promise);
    const onEncounterStarted = vi.fn();
    const user = userEvent.setup();
    renderLakes(baseApi({ startFishing }), { onEncounterStarted });
    const cast = screen.getByRole("button", { name: "Cast at Beginner Lake" });
    cast.click();
    cast.click();
    await waitFor(() => expect(startFishing).toHaveBeenCalledTimes(1));
    expect(cast).toBeDisabled();
    expect(cast).toHaveAttribute("aria-disabled", "true");
    expect(onEncounterStarted).not.toHaveBeenCalled();
    request.resolve(encounter());
    await waitFor(() => expect(onEncounterStarted).toHaveBeenCalledWith(expect.objectContaining({ encounterId: "encounter-1" })));

    cleanup();
    const failedStart = vi.fn().mockRejectedValue(new Error("Worker unavailable."));
    const failedActive = vi.fn().mockResolvedValue({ encounter: null, expired: false } satisfies ActiveFishingEncounterResponse);
    const failedApi = baseApi({ startFishing: failedStart, getActiveEncounter: failedActive });
    renderLakes(failedApi);
    await user.click(screen.getByRole("button", { name: "Cast at Beginner Lake" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Worker unavailable.");
    expect(failedActive).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Try casting again" })).toBeInTheDocument();

    cleanup();
    const resumed = vi.fn();
    const active = encounter();
    const ambiguousApi = baseApi({ startFishing: vi.fn().mockRejectedValue(new Error("Request timed out.")), getActiveEncounter: vi.fn().mockResolvedValue({ encounter: active, expired: false }) });
    renderLakes(ambiguousApi, { onEncounterStarted: resumed });
    await user.click(screen.getByRole("button", { name: "Cast at Beginner Lake" }));
    await waitFor(() => expect(resumed).toHaveBeenCalledWith(active));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
