/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompleteFishingResponse, FishSpecimen, FishSpecies, GameStateResponse } from "@fishing/shared/contracts";
import { CatchResult, DecisionResult } from "./CatchResult";

vi.mock("../../shared-ui/fish-image-loader", () => ({
  fishArticleUrl: vi.fn(() => "https://example.com/fish"),
  loadFishImage: vi.fn().mockResolvedValue(null),
  loadImageWithRetries: vi.fn().mockResolvedValue(null),
}));

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
  availableLocationIds: ["pond"],
  source: { name: "Fixture", url: "https://example.com/fish" },
};
const specimen: FishSpecimen = { id: "catch-1", speciesId: species.id, species, weightKg: 0.4, lengthCm: 20, quality: "good", saleValueCoins: 12, caughtAt: "2099-01-01T00:00:00.000Z", locationId: "pond", locationName: "Willow Pond" };
const state: GameStateResponse = {
  coins: 100,
  activeEquipment: { boatId: "canoe", rodId: "starter-rod", lureId: "spinner", baitId: "worm" },
  inventory: { boats: [], rods: [], lures: [], baits: [] },
  locations: [{ id: "pond", name: "Willow Pond", description: "Pond", riskReason: "Low", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 1, expectedValueMaxCoins: 20, fishIds: [species.id], unlocked: true }],
  catalog: {
    fish: [species],
    locations: [{ id: "pond", name: "Willow Pond", description: "Pond", riskReason: "Low", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 1, expectedValueMaxCoins: 20, fishIds: [species.id] }],
    boats: [],
    rods: [{ id: "starter-rod", name: "Starter Rod", description: "Rod", priceCoins: 0, strength: 1, control: 1, maxFishWeightKg: 2, breakResistance: 0.9, catchZoneBonus: 0.05 }, { id: "replacement", name: "Replacement Rod", description: "Rod", priceCoins: 0, strength: 1, control: 1, maxFishWeightKg: 2, breakResistance: 0.9, catchZoneBonus: 0.05 }],
    lures: [],
    baits: [],
  },
};

const caught: CompleteFishingResponse = { outcome: "caught", message: "A clean fight.", species, rodId: "starter-rod", rodRiskBand: "low", rodBreakChancePercent: 0.25, catch: specimen, rodBroke: false, replacementRodId: null };

afterEach(() => cleanup());

describe("React result components", () => {
  it("renders catch decisions, preserves native disabled state, and accepts keyboard decisions", async () => {
    const onDecision = vi.fn();
    const user = userEvent.setup();
    render(<CatchResult result={caught} gameState={state} actionPending={false} onDecision={onDecision} onBack={vi.fn()} />);
    expect(screen.getByTestId("catch-result")).toBeInTheDocument();
    expect(screen.getByTestId("catch-sale-value")).toHaveAccessibleName("Sell value: 12 coins");
    expect(screen.getAllByRole("button", { name: /Keep|Sell/ })).toHaveLength(2);
    const keep = screen.getByRole("button", { name: /^Keep/ });
    keep.focus();
    await user.keyboard("{Enter}");
    expect(onDecision).toHaveBeenCalledWith("keep");
    cleanup();
    render(<CatchResult result={caught} gameState={state} actionPending onDecision={onDecision} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Keep/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Keep/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("renders loss and broken-rod recovery copy, and both decision receipts", async () => {
    const onBack = vi.fn();
    const lost: CompleteFishingResponse = { ...caught, outcome: "lost", message: "The hook shook free.", catch: null, rodBroke: true, rodRiskBand: "high", rodBreakChancePercent: 27.5, replacementRodId: "replacement" };
    const user = userEvent.setup();
    render(<CatchResult result={lost} gameState={state} actionPending={false} onDecision={vi.fn()} onBack={onBack} />);
    expect(screen.getByRole("heading", { name: "It got away" })).toBeInTheDocument();
    expect(screen.getByText("Replacement Rod is equipped now.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cast again" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    cleanup();
    render(<DecisionResult decision={{ decision: "keep", coins: 100, catch: specimen }} onBack={onBack} />);
    expect(screen.getByRole("heading", { name: "Into the livewell!" })).toBeInTheDocument();
    expect(screen.getByText("Collection +1")).toBeInTheDocument();
    cleanup();
    render(<DecisionResult decision={{ decision: "sell", coins: 112, catch: specimen }} onBack={onBack} />);
    expect(screen.getByRole("heading", { name: "Nice payday!" })).toBeInTheDocument();
    expect(screen.getByText("+12 coins")).toBeInTheDocument();
  });
});
