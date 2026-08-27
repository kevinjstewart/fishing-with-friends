/** @vitest-environment jsdom */
import { describe, expect, beforeEach, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ActiveFishingEncounterResponse,
  AuthResponse,
  FishJournalResponse,
  FishSpecies,
  GameStateResponse,
  LeaderboardResponse,
  MeResponse,
  PlayerProfile,
} from "@fishing/shared/contracts";
import { createAppQueryClient } from "../api/query-client";
import { App } from "../app/App";
import { AppProviders } from "../app/AppProviders";
import type { ReactAppServices } from "../app/react-services";
import { FriendsRoute } from "./friends/FriendsRoute";
import { FriendsScreen } from "./friends/FriendsScreen";
import { JournalRoute } from "./journal/JournalRoute";
import { JournalScreen } from "./journal/JournalScreen";
import { GameTabbar } from "./chrome/GameTabbar";
import { GameTopbar } from "./chrome/GameTopbar";
import { LoadingPanel, RetryPanel } from "./chrome/ScreenStatus";
import { StatusToast } from "./chrome/StatusToast";
import { FishImage } from "../shared-ui/FishImage";
import { SpecimenDetails } from "../shared-ui/SpecimenDetails";
import { loadFishImage, loadImageWithRetries } from "../shared-ui/fish-image-loader";

vi.mock("../shared-ui/fish-image-loader", () => ({
  fishArticleUrl: vi.fn(() => "https://en.wikipedia.org/wiki/Yellow_perch"),
  loadFishImage: vi.fn(),
  loadImageWithRetries: vi.fn(),
}));

const player: PlayerProfile = {
  id: "player-1",
  telegramUsername: "local_developer",
  displayName: "Local developer",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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

const state: GameStateResponse = {
  coins: 999,
  activeEquipment: { boatId: "canoe", rodId: "starter-rod", lureId: "spinner", baitId: "worms" },
  inventory: { boats: [], rods: [], lures: [], baits: [] },
  locations: [{ id: "beginner-lake", name: "Beginner Lake", description: "A calm starting lake.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id], unlocked: true }],
  catalog: {
    fish: [species],
    locations: [{ id: "beginner-lake", name: "Beginner Lake", description: "A calm starting lake.", riskReason: "Gentle water", riskBand: "low", requiredBoatId: "canoe", expectedValueMinCoins: 10, expectedValueMaxCoins: 50, fishIds: [species.id] }],
    boats: [{ id: "canoe", name: "Canoe", description: "A small boat.", tier: 1, priceCoins: 0, unlocksLocationIds: ["beginner-lake"] }],
    rods: [],
    lures: [],
    baits: [{ id: "worms", name: "Worms", description: "Natural bait.", priceCoins: 1, attraction: 1, fishIds: [species.id] }],
  },
};

const journal: FishJournalResponse = {
  entries: [
    {
      speciesId: species.id,
      species,
      discovered: true,
      timesCaught: 2,
      heaviestWeightKg: 0.3,
      longestLengthCm: 28,
      bestSaleValueCoins: 184,
      firstCaughtAt: "2026-01-01T12:00:00.000Z",
      lastCaughtAt: "2026-01-02T12:00:00.000Z",
    },
    {
      speciesId: "unknown-fish",
      species: { ...species, id: "unknown-fish", commonName: "Hidden Fish", acceptedBaitIds: ["worms"] },
      discovered: false,
      timesCaught: 0,
      heaviestWeightKg: null,
      longestLengthCm: null,
      bestSaleValueCoins: null,
      firstCaughtAt: null,
      lastCaughtAt: null,
    },
  ],
};

const board: LeaderboardResponse = {
  metric: "kept",
  metricDescription: "Ranked by kept fish. Sold fish do not count.",
  viewer: { playerId: "player-1", displayName: "Local developer", rank: 2, keptFishCount: 3, heaviestKeptFishKg: 4.2 },
  entries: [
    { rank: 1, playerId: "leader", displayName: "Lake Captain", keptFishCount: 5, heaviestKeptFishKg: 6.1, catchCount: 5, heaviestCatchKg: 6.1 },
    { rank: 2, playerId: "player-1", displayName: "Local developer", keptFishCount: 3, heaviestKeptFishKg: 4.2, catchCount: 3, heaviestCatchKg: 4.2 },
  ],
};

function renderWithQueryClient(element: React.ReactNode) {
  return render(<QueryClientProvider client={createAppQueryClient()}>{element}</QueryClientProvider>);
}

function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function createServices(overrides: Partial<ReactAppServices["api"]> = {}): ReactAppServices {
  const api = Object.assign({
    hasSession: false,
    getMe: vi.fn<(...args: [AbortSignal?]) => Promise<MeResponse>>(),
    authenticateWithTelegram: vi.fn<(...args: [string]) => Promise<AuthResponse>>(),
    authenticateForDevelopment: vi.fn<() => Promise<AuthResponse>>().mockResolvedValue({ accessToken: "token", expiresAt: "2026-01-02T00:00:00.000Z", player }),
    getGameState: vi.fn<(...args: [AbortSignal?]) => Promise<GameStateResponse>>().mockResolvedValue(state),
    getActiveEncounter: vi.fn<(...args: [AbortSignal?]) => Promise<ActiveFishingEncounterResponse>>().mockResolvedValue({ encounter: null, expired: false }),
    getJournal: vi.fn<(...args: [AbortSignal?]) => Promise<FishJournalResponse>>(),
    getLeaderboard: vi.fn<(...args: [AbortSignal?]) => Promise<LeaderboardResponse>>(),
  }, overrides);
  return {
    api,
    isDevelopment: true,
    telegram: { isAvailable: false, initData: "", initialize: vi.fn(), syncViewportInsets: vi.fn(), dispose: vi.fn() },
    runtime: {
      setSafeArea: vi.fn(), startFight: vi.fn(), returnToLobby: vi.fn(async () => {}), onComplete: vi.fn(() => () => {}), onAmbient: vi.fn(() => () => {}), destroy: vi.fn(), emitCompleteForTest: vi.fn(),
    },
  } as ReactAppServices;
}

beforeEach(() => {
  vi.mocked(loadFishImage).mockReset().mockResolvedValue("https://upload.wikimedia.org/fish.jpg");
  vi.mocked(loadImageWithRetries).mockReset().mockResolvedValue("https://upload.wikimedia.org/fish.jpg");
});

describe("React Phase 3 read-only components", () => {
  it("renders the React chrome with accessible states and callbacks", async () => {
    const onNavigate = vi.fn();
    const onShop = vi.fn();
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <GameTopbar coins={123} disabled onShop={onShop} />
        <GameTabbar activeScreen="friends" navEnabled={false} pendingNavigation="journal" onNavigate={onNavigate} />
        <StatusToast message="Invite copied" state="ready" />
        <LoadingPanel message="Opening the catch board…" />
        <RetryPanel eyebrow="Could not load that screen" message="Try later." retryLabel="Try again" onRetry={onRetry} />
      </>,
    );

    expect(screen.getByRole("button", { name: "Open the tackle shop" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Invite copied");
    expect(screen.getByTestId("screen-loading")).toHaveTextContent("Opening the catch board…");
    const journalTab = screen.getByRole("button", { name: "Journal" });
    expect(journalTab).toBeDisabled();
    expect(journalTab).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Friends" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders populated and empty Friends states through accessible callbacks", async () => {
    const onShare = vi.fn();
    const onGoFishing = vi.fn();
    const user = userEvent.setup();
    render(<FriendsScreen leaderboard={board} onShare={onShare} onGoFishing={onGoFishing} />);

    expect(screen.getByRole("heading", { name: "Catch board" })).toBeInTheDocument();
    expect(screen.getByText("Ranked by kept fish. Sold fish do not count.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invite crew" }));
    expect(onShare).toHaveBeenCalledTimes(1);

    render(<FriendsScreen leaderboard={{ ...board, entries: [] }} onShare={onShare} onGoFishing={onGoFishing} />);
    await user.click(screen.getByRole("button", { name: "Go fishing" }));
    expect(onGoFishing).toHaveBeenCalledTimes(1);
  });

  it("renders Journal discovery, field notes, filtering, and empty states", async () => {
    const onGoFishing = vi.fn();
    const user = userEvent.setup();
    render(<JournalScreen journal={journal} state={state} onGoFishing={onGoFishing} />);

    expect(screen.getByRole("heading", { name: "1 of 2 species discovered" })).toBeInTheDocument();
    expect(await screen.findByText("Yellow Perch")).toBeInTheDocument();
    await user.click(screen.getByText("Field notes"));
    expect(screen.getByText(species.description)).toBeInTheDocument();
    expect(screen.getByText(species.habitat)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Wikipedia" })[0]).toHaveAttribute("target", "_blank");

    await user.selectOptions(screen.getByLabelText("Show"), "undiscovered");
    expect(screen.getByText("Undiscovered species")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Show"), "discovered");
    expect(screen.getByText("Yellow Perch")).toBeInTheDocument();

    cleanup();
    render(<JournalScreen journal={{ entries: journal.entries.map((entry) => ({ ...entry, discovered: false })) }} state={state} onGoFishing={onGoFishing} />);
    await user.selectOptions(screen.getByLabelText("Show"), "discovered");
    await user.click(screen.getByRole("button", { name: "Go fishing" }));
    expect(onGoFishing).toHaveBeenCalledTimes(1);
  });

  it("covers image loading, retry-in-flight, unavailable fallback, and specimen details", async () => {
    let resolveImage: (value: string | null) => void = () => {};
    vi.mocked(loadImageWithRetries).mockImplementation(() => new Promise((resolve) => { resolveImage = resolve; }));
    render(<FishImage species={species} />);
    await waitFor(() => expect(screen.getByTestId("fish-image")).toHaveAttribute("data-image-state", "loading"));
    expect(vi.mocked(loadImageWithRetries)).toHaveBeenCalledTimes(1);
    resolveImage("https://upload.wikimedia.org/fish-retry.jpg");
    await waitFor(() => expect(screen.getByTestId("fish-image")).toHaveAttribute("data-image-state", "loaded"));

    vi.mocked(loadFishImage).mockResolvedValue(null);
    render(<FishImage species={{ ...species, id: "missing-fish" }} />);
    await waitFor(() => expect(screen.getAllByText("Photo unavailable").at(-1)).toBeInTheDocument());

    render(<SpecimenDetails specimen={{ id: "specimen-1", speciesId: species.id, species, weightKg: 0.3, lengthCm: 28, quality: "good", saleValueCoins: 184, caughtAt: "2026-01-01T12:00:00.000Z", locationId: "beginner-lake", locationName: "Beginner Lake" }} />);
    expect(screen.getByTestId("specimen-details")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Typical is 0\.3 kilograms/i })).toBeInTheDocument();
  });

  it("shows query loading, error, and user-driven retry states", async () => {
    const pending = createDeferred<LeaderboardResponse>();
    const api = { getLeaderboard: vi.fn(() => pending.promise) };
    renderWithQueryClient(<FriendsRoute api={api} navigationRequestId={1} onLoaded={vi.fn()} onFailed={vi.fn()} onShare={vi.fn()} onGoFishing={vi.fn()} />);
    expect(screen.getByTestId("screen-loading")).toBeInTheDocument();
    pending.resolve(board);
    await waitFor(() => expect(screen.getByTestId("friends-screen")).toBeInTheDocument());

    const retryApi = { getLeaderboard: vi.fn().mockRejectedValueOnce(new Error("Catch board offline.")).mockResolvedValue(board) };
    renderWithQueryClient(<FriendsRoute api={retryApi} navigationRequestId={2} onLoaded={vi.fn()} onFailed={vi.fn()} onShare={vi.fn()} onGoFishing={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Catch board offline.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getAllByTestId("friends-screen").at(-1)).toBeInTheDocument());
    expect(retryApi.getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it("shows Journal query loading, error, and user-driven retry states", async () => {
    const pending = createDeferred<FishJournalResponse>();
    const api = { getJournal: vi.fn(() => pending.promise) };
    renderWithQueryClient(<JournalRoute api={api} state={state} navigationRequestId={1} onLoaded={vi.fn()} onFailed={vi.fn()} onGoFishing={vi.fn()} />);
    expect(screen.getByTestId("screen-loading")).toBeInTheDocument();
    pending.resolve(journal);
    await waitFor(() => expect(screen.getByTestId("journal-screen")).toBeInTheDocument());

    cleanup();
    const retryApi = { getJournal: vi.fn().mockRejectedValueOnce(new Error("Journal offline.")).mockResolvedValue(journal) };
    renderWithQueryClient(<JournalRoute api={retryApi} state={state} navigationRequestId={2} onLoaded={vi.fn()} onFailed={vi.fn()} onGoFishing={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Journal offline.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("journal-screen")).toBeInTheDocument());
    expect(retryApi.getJournal).toHaveBeenCalledTimes(2);
  });

  it("aborts stale navigation, ignores out-of-order success, and avoids active-tab duplicates", async () => {
    const friends = createDeferred<LeaderboardResponse>();
    const journalDeferred = createDeferred<FishJournalResponse>();
    let friendsSignal: AbortSignal | undefined;
    const services = createServices({
      getLeaderboard: vi.fn((signal?: AbortSignal) => { friendsSignal = signal; return friends.promise; }),
      getJournal: vi.fn(() => journalDeferred.promise),
    });
    const user = userEvent.setup();
    render(<AppProviders queryClient={createAppQueryClient()}><App services={services} /></AppProviders>);
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByTestId("screen-loading")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Journal" }));
    await waitFor(() => expect(friendsSignal?.aborted).toBe(true));
    journalDeferred.resolve(journal);
    await waitFor(() => expect(screen.getByTestId("journal-screen")).toBeInTheDocument());
    friends.resolve(board);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("friends-screen")).not.toBeInTheDocument();
    expect(services.api.getJournal).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Journal" }));
    expect(services.api.getJournal).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("navigation", { name: "Game screens" })).getByRole("button", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  });
});
