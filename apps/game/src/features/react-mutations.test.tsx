/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  ActiveEquipment,
  BaitDefinition,
  CollectionResponse,
  FishSpecimen,
  FishSpecies,
  GameStateResponse,
  LeaderboardResponse,
  PlayerInventory,
  PurchaseResponse,
} from "@fishing/shared/contracts";
import { createAppQueryClient } from "../api/query-client";
import { CollectionScreen } from "./collection/CollectionScreen";
import { ShopScreen } from "./shop/ShopScreen";

vi.mock("../shared-ui/fish-image-loader", () => ({
  fishArticleUrl: vi.fn(() => "https://en.wikipedia.org/wiki/Yellow_perch"),
  loadFishImage: vi.fn().mockResolvedValue(null),
  loadImageWithRetries: vi.fn().mockResolvedValue(null),
}));

const species: FishSpecies = {
  id: "yellow-perch",
  commonName: "Yellow Perch",
  scientificName: "Perca flavescens",
  description: "A schooling freshwater fish with a bright golden flank.",
  habitat: "Clear lakes and slow rivers",
  nativeRange: "Great Lakes and northern North America",
  minimumWeightKg: 0.05,
  typicalWeightKg: 0.25,
  maximumWeightKg: 1.8,
  minimumLengthCm: 8,
  typicalLengthCm: 25,
  maximumLengthCm: 50,
  rarity: "common",
  baseValueCoins: 42,
  difficulty: 1,
  movementProfile: { speed: 1, acceleration: 1, directionChangeFrequency: 1, unpredictability: 1, fightDurationSeconds: 5 },
  acceptedBaitIds: ["worms"],
  preferredLureIds: ["spinner"],
  availableLocationIds: ["beginner-lake"],
  source: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Yellow_perch" },
};

const bait: BaitDefinition = {
  id: "worms",
  name: "Worms",
  description: "Reliable bait for a patient cast.",
  priceCoins: 1,
  attraction: 1.1,
  fishIds: [species.id],
};

const activeEquipment: ActiveEquipment = { boatId: "canoe", rodId: "starter-rod", lureId: "spinner", baitId: bait.id };
const inventory: PlayerInventory = {
  boats: [{ id: activeEquipment.boatId, quantity: 1, durability: null }],
  rods: [{ id: activeEquipment.rodId, quantity: 1, durability: null }],
  lures: [{ id: activeEquipment.lureId, quantity: 1, durability: 10 }],
  baits: [{ id: bait.id, quantity: 12, durability: null }],
};

const state: GameStateResponse = {
  coins: 999,
  activeEquipment,
  inventory,
  locations: [{ id: "beginner-lake", name: "Beginner Lake", description: "A calm starting lake.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: activeEquipment.boatId, expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id], unlocked: true }],
  catalog: {
    fish: [species],
    locations: [{ id: "beginner-lake", name: "Beginner Lake", description: "A calm starting lake.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: activeEquipment.boatId, expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id] }],
    boats: [{ id: activeEquipment.boatId, name: "Canoe", description: "A small boat.", tier: 1, priceCoins: 0, unlocksLocationIds: ["beginner-lake"] }],
    rods: [{ id: activeEquipment.rodId, name: "Starter Rod", description: "A steady first rod.", priceCoins: 25, strength: 1, control: 1, maxFishWeightKg: 1, breakResistance: 0.9, catchZoneBonus: 0.05 }],
    lures: [{ id: activeEquipment.lureId, name: "Spinner", description: "A bright spinner.", priceCoins: 12, maximumDurability: 10, catchZoneBonus: 0.05, difficultyModifier: 0, preferredFishIds: [species.id] }],
    baits: [bait],
  },
};

const board: LeaderboardResponse = {
  metric: "kept",
  metricDescription: "Ranked by kept fish. Sold fish do not count.",
  viewer: { playerId: "player-1", displayName: "Local developer", rank: 1, keptFishCount: 2, heaviestKeptFishKg: 0.4 },
  entries: [{ rank: 1, playerId: "player-1", displayName: "Local developer", keptFishCount: 2, heaviestKeptFishKg: 0.4, catchCount: 2, heaviestCatchKg: 0.4 }],
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function purchaseResponse(overrides: Partial<PurchaseResponse> = {}): PurchaseResponse {
  return { coins: 998, inventory, activeEquipment, ...overrides };
}

function specimen(id: string, saleValueCoins: number): FishSpecimen {
  return {
    id,
    speciesId: species.id,
    species,
    weightKg: saleValueCoins === 42 ? 0.3 : 0.45,
    lengthCm: saleValueCoins === 42 ? 28 : 34,
    quality: saleValueCoins === 42 ? "good" : "large",
    saleValueCoins,
    caughtAt: "2026-01-01T12:00:00.000Z",
    locationId: "beginner-lake",
    locationName: "Beginner Lake",
  };
}

function renderWithClient(element: React.ReactNode) {
  return render(<QueryClientProvider client={createAppQueryClient()}>{element}</QueryClientProvider>);
}

describe("React mutation components", () => {
  it("locks a purchase before rerender, exposes matching disabled state, and releases it in finally", async () => {
    const request = deferred<PurchaseResponse>();
    const purchase = vi.fn(() => request.promise);
    const user = userEvent.setup();
    renderWithClient(<ShopScreen state={state} api={{ purchase }} />);
    const item = within(screen.getByTestId("shop-item"));
    await user.click(item.getByRole("button", { name: "×5" }));
    const buy = item.getByRole("button", { name: "Buy bait Worms for 5 coins" });

    buy.click();
    buy.click();
    await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(buy).toBeDisabled();
      expect(buy).toHaveAttribute("aria-disabled", "true");
    });
    buy.focus();
    await user.keyboard("{Enter}");
    expect(purchase).toHaveBeenCalledTimes(1);

    request.resolve(purchaseResponse());
    await waitFor(() => {
      expect(buy).not.toBeDisabled();
      expect(buy).toHaveAttribute("aria-disabled", "false");
    });
    expect(item.getByRole("button", { name: "×1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Purchased worms");
  });

  it("does not replay a failed purchase automatically and offers an explicit keyboard-usable retry", async () => {
    const purchase = vi.fn().mockRejectedValueOnce(new Error("Shop offline.")).mockResolvedValueOnce(purchaseResponse());
    const user = userEvent.setup();
    renderWithClient(<ShopScreen state={state} api={{ purchase }} />);
    const buy = within(screen.getByTestId("shop-item")).getByRole("button", { name: "Buy bait Worms for 1 coins" });

    await user.click(buy);
    expect(await screen.findByRole("alert")).toHaveTextContent("Shop offline.");
    expect(purchase).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole("button", { name: "Retry purchase" });
    retry.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(purchase).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Purchased worms"));
  });

  it("keeps sell-one locked across duplicate calls and restores both accessibility states", async () => {
    const request = deferred<{ coins: number; catch: FishSpecimen }>();
    const fish = specimen("fish-1", 42);
    const collection: CollectionResponse = { fish: [fish] };
    const sellCatch = vi.fn(() => request.promise);
    const api = {
      getCollection: vi.fn().mockResolvedValue(collection),
      getGameState: vi.fn().mockResolvedValue(state),
      getLeaderboard: vi.fn().mockResolvedValue(board),
      sellCatch,
    };
    renderWithClient(<CollectionScreen collection={collection} api={api} onGoFishing={vi.fn()} />);
    const sell = screen.getByRole("button", { name: "Sell Yellow Perch for 42 coins" });

    sell.click();
    sell.click();
    await waitFor(() => expect(sellCatch).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(sell).toBeDisabled();
      expect(sell).toHaveAttribute("aria-disabled", "true");
    });
    request.resolve({ coins: 1041, catch: fish });
    await waitFor(() => {
      expect(sell).not.toBeDisabled();
      expect(sell).toHaveAttribute("aria-disabled", "false");
    });
  });

  it("cancels sell-all without a mutation and reconciles sequential partial success", async () => {
    const first = specimen("fish-1", 42);
    const second = specimen("fish-2", 81);
    const before: CollectionResponse = { fish: [first, second] };
    const afterPartial: CollectionResponse = { fish: [second] };
    const getCollection = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(afterPartial);
    const sellCatch = vi.fn()
      .mockResolvedValueOnce({ coins: 1041, catch: first })
      .mockRejectedValueOnce(new Error("The second sale timed out."));
    const api = {
      getCollection,
      getGameState: vi.fn().mockResolvedValue(state),
      getLeaderboard: vi.fn().mockResolvedValue(board),
      sellCatch,
    };
    const user = userEvent.setup();
    renderWithClient(<CollectionScreen collection={before} api={api} onGoFishing={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sell all 2 fish for 123 coins" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(sellCatch).not.toHaveBeenCalled();

    const confirm = screen.getByRole("button", { name: "Sell all 2 fish for 123 coins" });
    await user.click(confirm);
    const confirmation = screen.getByRole("button", { name: "Confirm selling all 2 fish for 123 coins" });
    confirmation.click();
    confirmation.click();
    await waitFor(() => expect(sellCatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sold 1 of 2 fish for 42 coins. The second sale timed out. Wallet and collection are up to date."));
    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(api.getGameState).toHaveBeenCalledTimes(1);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("keeps quantity and confirmation state local across remounts", async () => {
    const purchase = vi.fn().mockResolvedValue(purchaseResponse());
    const user = userEvent.setup();
    const shop = renderWithClient(<ShopScreen state={state} api={{ purchase }} />);
    const shopItem = within(screen.getByTestId("shop-item"));
    await user.click(shopItem.getByRole("button", { name: "×5" }));
    expect(shopItem.getByRole("button", { name: "×5" })).toHaveAttribute("aria-pressed", "true");
    shop.unmount();

    const remountedShop = renderWithClient(<ShopScreen state={state} api={{ purchase }} />);
    const remountedShopItem = within(screen.getByTestId("shop-item"));
    expect(remountedShopItem.getByRole("button", { name: "×1" })).toHaveAttribute("aria-pressed", "true");
    remountedShop.unmount();

    const collection = { fish: [specimen("fish-1", 42)] };
    const collectionView = renderWithClient(<CollectionScreen collection={collection} api={{ getCollection: vi.fn().mockResolvedValue(collection), getGameState: vi.fn().mockResolvedValue(state), getLeaderboard: vi.fn().mockResolvedValue(board), sellCatch: vi.fn() }} onGoFishing={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell all 1 fish for 42 coins" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    collectionView.unmount();
    renderWithClient(<CollectionScreen collection={collection} api={{ getCollection: vi.fn().mockResolvedValue(collection), getGameState: vi.fn().mockResolvedValue(state), getLeaderboard: vi.fn().mockResolvedValue(board), sellCatch: vi.fn() }} onGoFishing={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});
