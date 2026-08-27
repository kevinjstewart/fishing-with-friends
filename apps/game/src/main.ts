import type { FishingEncounterResponse, GameStateResponse } from "@fishing/shared/contracts";
import "./styles.css";
import { AuthenticatedClient } from "./api/authenticated-client";
import { ApiClient, ApiClientError } from "./api/client";
import { createMutationLock } from "./api/mutation-lock";
import { createFishingRuntime, type FishingCompleteEvent } from "./game/phaser-runtime";
import { AppShell, type EquipmentSelectionRequest, type ScreenId } from "./ui/app-shell";
import { createTelegramLifecycle } from "./telegram/lifecycle";
import {
  activateTelegramViewportMock,
  resolveTelegramMockId,
  telegramViewportPresets,
} from "./telegram/mock";

const uiRoot = document.querySelector<HTMLElement>("#ui-root");
const gameRoot = document.querySelector<HTMLElement>("#game-root");
if (!uiRoot || !gameRoot) {
  throw new Error("The game shell is missing its root elements.");
}

const shell = new AppShell(uiRoot);
const runtime = createFishingRuntime(gameRoot);
const safeAreaProbe = document.querySelector<HTMLElement>("#safe-area-probe");
if (!safeAreaProbe) {
  throw new Error("The safe-area probe is missing from the game shell.");
}

const telegram = createTelegramLifecycle({
  target: document.documentElement,
  safeAreaProbe,
  onSafeAreaChanged: (insets) => runtime.setSafeArea(insets),
});
const api = new AuthenticatedClient({
  api: new ApiClient(import.meta.env.VITE_API_BASE_URL ?? ""),
  isDevelopment: import.meta.env.DEV,
  getTelegramInitData: () => telegram.initData,
  onSessionRecoveryStart: () => shell.setStatus("Your session expired. Reconnecting…"),
});

// Development-only seam for deterministic browser characterization. It is
// activated only by the Phase 0 fixture URL and is removed from production by
// Vite's import.meta.env.DEV replacement/tree-shaking.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("phase0") === "results") {
  (window as Window & {
    __FISHING_PHASE0__?: {
      emitFishingComplete: (event: { encounterId: string; performance: number }) => void;
    };
  }).__FISHING_PHASE0__ = {
    emitFishingComplete: (event) => runtime.emitCompleteForTest(event),
  };
}

let currentGameState: GameStateResponse | undefined;
let fishingActive = false;
let fishingSceneSettled = true;
let navigationSequence = 0;
let navigationController: AbortController | undefined;
telegram.initialize();

const telegramMock = resolveTelegramMockId(new URLSearchParams(window.location.search).get("telegramMock"));
if (telegramMock) activateTelegramViewportMock(telegramViewportPresets[telegramMock]);
telegram.syncViewportInsets();

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function refreshGameState(signal?: AbortSignal): Promise<GameStateResponse> {
  return api.getGameState(signal);
}

async function reconcileCollectionAndWallet(): Promise<{
  collection?: Awaited<ReturnType<typeof api.getCollection>>;
  walletRefreshed: boolean;
}> {
  const [stateResult, collectionResult] = await Promise.allSettled([
    api.getGameState(),
    api.getCollection(),
  ]);

  if (stateResult.status === "fulfilled") {
    currentGameState = stateResult.value;
    shell.updateWallet(stateResult.value.coins);
  }
  if (collectionResult.status === "fulfilled") {
    if (shell.getActiveScreen() === "collection") shell.showCollection(collectionResult.value);
    return { collection: collectionResult.value, walletRefreshed: stateResult.status === "fulfilled" };
  }
  return { walletRefreshed: stateResult.status === "fulfilled" };
}

function renderLakes(): void {
  if (!currentGameState) return;
  shell.setNavEnabled(true);
  shell.setGameState(currentGameState);
  shell.renderLakes();
  void runtime.returnToLobby();
}

async function waitForFishingSceneToSettle(): Promise<void> {
  if (!document.body.classList.contains("is-fighting") || fishingSceneSettled) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const timeout = { id: 0 };
    let unsubscribe = (): void => {};
    const finish = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout.id);
      unsubscribe();
      resolve();
    };
    unsubscribe = runtime.onAmbient(finish);
    timeout.id = window.setTimeout(finish, 2500);
  });
}

function revealAppShell(): void {
  document.body.classList.remove("is-fighting");
}

async function returnToLakes(): Promise<boolean> {
  fishingActive = false;
  document.body.classList.remove("is-fighting");
  shell.setActionPending(false);
  return openScreen("lakes");
}

runtime.onAmbient(() => {
  fishingSceneSettled = true;
});

const screenLabels: Record<ScreenId, string> = {
  lakes: "your lakes",
  shop: "the tackle shop",
  collection: "your collection",
  journal: "your fish journal",
  friends: "the catch board",
};

function beginNavigation(screen: ScreenId): { id: number; controller: AbortController } {
  navigationController?.abort();
  const controller = new AbortController();
  const id = ++navigationSequence;
  navigationController = controller;
  shell.setActiveScreen(screen);
  shell.setNavigationPending(screen);
  shell.showLoadingScreen(`Opening ${screenLabels[screen]}…`);
  return { id, controller };
}

function isCurrentNavigation(id: number): boolean {
  return id === navigationSequence;
}

async function openScreen(screen: ScreenId): Promise<boolean> {
  if (fishingActive) return false;
  const navigation = beginNavigation(screen);
  try {
    if (screen === "shop") {
      const gameState = await refreshGameState(navigation.controller.signal);
      if (!isCurrentNavigation(navigation.id)) return false;
      currentGameState = gameState;
      shell.setGameState(gameState);
      shell.renderShop();
      return true;
    }
    if (screen === "collection") {
      const collection = await api.getCollection(navigation.controller.signal);
      if (!isCurrentNavigation(navigation.id)) return false;
      shell.showCollection(collection);
      return true;
    }
    if (screen === "journal") {
      const journal = await api.getJournal(navigation.controller.signal);
      if (!isCurrentNavigation(navigation.id)) return false;
      shell.renderJournal(journal);
      return true;
    }
    if (screen === "friends") {
      const leaderboard = await api.getLeaderboard(navigation.controller.signal);
      if (!isCurrentNavigation(navigation.id)) return false;
      shell.showLeaderboard(leaderboard);
      return true;
    }
    const gameState = await refreshGameState(navigation.controller.signal);
    if (!isCurrentNavigation(navigation.id)) return false;
    currentGameState = gameState;
    renderLakes();
    return true;
  } catch (error) {
    if (!isCurrentNavigation(navigation.id) || isAbortError(error)) return false;
    const message = error instanceof Error ? error.message : `Unable to open ${screenLabels[screen]}.`;
    shell.showRetryPanel(
      "Could not load that screen",
      message,
      "Try again",
      () => void openScreen(screen),
      screen === "lakes" ? undefined : () => void returnToLakes(),
    );
    return false;
  } finally {
    if (isCurrentNavigation(navigation.id)) {
      navigationController = undefined;
      shell.setNavigationPending();
    }
  }
}

shell.setNavigationHandler((screen) => void openScreen(screen));

shell.setShareHandler(() => {
  const webApp = window.Telegram?.WebApp;
  const url = `${window.location.origin}${window.location.pathname}`;
  const text = "Cast a line with me in Fishing with Friends!";
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    return;
  }
  const fallback = (): void => {
    if (webApp?.openLink) webApp.openLink(url);
    else shell.setStatus("Copy failed. Share the app link.", "error");
  };
  if (!navigator.clipboard?.writeText) {
    fallback();
    return;
  }
  void navigator.clipboard.writeText(`${text} ${url}`).then(() => shell.setStatus("Invite copied", "ready"), fallback);
});

const startLock = createMutationLock();

function resumeEncounter(encounter: FishingEncounterResponse, statusMessage = "Resuming your fishing attempt…"): void {
  fishingActive = true;
  fishingSceneSettled = false;
  shell.setActionPending(false);
  shell.setNavEnabled(false);
  shell.setNavigationPending();
  shell.setStatus(statusMessage);
  document.body.classList.add("is-fighting");
  runtime.startFight(encounter);
}

function startFishing(locationId: string): void {
  if (fishingActive || !startLock.tryAcquire()) return;
  shell.setActionPending(true);
  void (async () => {
    try {
      if (!currentGameState) throw new Error("Your fishing state is still loading. Try again in a moment.");
      shell.setStatus("Preparing your line…");
      const encounter = await api.startFishing({ locationId, ...currentGameState!.activeEquipment });
      resumeEncounter(encounter, "Your line is ready. Fish on…");
    } catch (error) {
      let active: Awaited<ReturnType<typeof api.getActiveEncounter>> | undefined;
      try {
        active = await api.getActiveEncounter();
      } catch {
        // Keep the original cast error visible when recovery is unavailable too.
      }
      if (active?.encounter) {
        resumeEncounter(active.encounter);
        return;
      }

      shell.setActionPending(false);
      const message = error instanceof Error ? error.message : "Unable to start fishing.";
      shell.showRetryPanel(
        "Cast not sent",
        message,
        "Try casting again",
        () => startFishing(locationId),
        () => void returnToLakes(),
      );
    } finally {
      startLock.release();
      if (!fishingActive) shell.setActionPending(false);
    }
  })();
}

shell.setStartFishingHandler(startFishing);

async function resolveCompletion(event: { encounterId: string; performance: number }): Promise<void> {
  if (!completionLock.tryAcquire()) return;
  fishingActive = true;
  shell.setNavEnabled(false);
  shell.setActionPending(true);
  shell.setStatus("Checking the catch…");
  try {
    const result = await api.completeFishing(event.encounterId, event.performance);
    await waitForFishingSceneToSettle();
    revealAppShell();
    fishingActive = false;
    shell.setNavEnabled(true);
    shell.setActionPending(false);
    const decisionLock = createMutationLock();
    const catchId = result.catch?.id;
    const handleDecision = (decision: "keep" | "sell") => {
      if (!catchId || !decisionLock.tryAcquire()) return;
      shell.setActionPending(true);
      void (async () => {
        shell.setStatus(decision === "sell" ? "Selling the fish…" : "Recording the fish…");
        try {
          const decisionResult = await api.decideCatch(catchId, decision);
          if (currentGameState) currentGameState = { ...currentGameState, coins: decisionResult.coins };
          shell.updateWallet(decisionResult.coins);
          const loaded = await returnToLakes();
          if (loaded) shell.setStatus(decision === "sell" ? "Fish sold" : "Fish kept", "ready");
        } catch (error) {
          shell.setActionPending(false);
          if (error instanceof ApiClientError && (error.status === 404 || error.status === 409)) {
            const loaded = await returnToLakes();
            if (loaded) shell.setStatus("That catch was already recorded.", "ready");
            return;
          }
          const message = error instanceof Error ? error.message : "Unable to record the catch.";
          shell.showRetryPanel(
            "Catch choice not saved",
            `${message} Your catch is still waiting for a Keep or Sell choice.`,
            "Retry choice",
            () => handleDecision(decision),
            () => void returnToLakes(),
          );
        } finally {
          decisionLock.release();
          shell.setActionPending(false);
        }
      })();
    };
    shell.showFishingResult(result, handleDecision, () => void returnToLakes());
  } catch (error) {
    await waitForFishingSceneToSettle();
    revealAppShell();
    fishingActive = false;
    shell.setNavEnabled(true);
    shell.setActionPending(false);
    if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
      const loaded = await returnToLakes();
      if (loaded) shell.setStatus(/expired/i.test(error.message) ? error.message : "That fishing attempt was already resolved.", "ready");
      return;
    }
    const message = error instanceof Error ? error.message : "Unable to resolve the encounter.";
    shell.showRetryPanel(
      "Rough connection",
      `${message} Your catch is still waiting on the line — nothing is lost.`,
      "Retry catch resolution",
      () => void resolveCompletion(event),
      () => void returnToLakes(),
    );
  } finally {
    completionLock.release();
  }
}

const completionLock = createMutationLock();

runtime.onComplete((event: FishingCompleteEvent) => {
  void resolveCompletion(event);
});

const purchaseLock = createMutationLock();

shell.setPurchaseHandler((itemId, quantity) => {
  if (!purchaseLock.tryAcquire()) return;
  shell.setActionPending(true);
  void (async () => {
    try {
      shell.setStatus("Buying…");
      const result = await api.purchase({ itemId, quantity });
      currentGameState = currentGameState
        ? { ...currentGameState, coins: result.coins, inventory: result.inventory, activeEquipment: result.activeEquipment }
        : await api.getGameState();
      if (currentGameState) shell.setGameState(currentGameState);
      if (shell.getActiveScreen() === "shop") shell.renderShop();
      shell.setStatus(`Purchased ${itemId.replace(/-/g, " ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof ApiClientError ? error.message : "Unable to complete that purchase.", "error");
    } finally {
      purchaseLock.release();
      shell.setActionPending(false);
    }
  })();
});

const sellLock = createMutationLock();

shell.setSellAllHandler(() => {
  if (!sellLock.tryAcquire()) return;
  shell.setActionPending(true);
  shell.resetSellAllConfirmation();
  void (async () => {
    let before: Awaited<ReturnType<typeof api.getCollection>> | undefined;
    let reconciliation: Awaited<ReturnType<typeof reconcileCollectionAndWallet>> | undefined;
    let operationError: unknown;
    try {
      if (!currentGameState) throw new Error("Your collection is still loading. Try again in a moment.");
      shell.setStatus("Selling all fish…");
      before = await api.getCollection();
      for (const specimen of before.fish) {
        try {
          await api.sellCatch(specimen.id);
        } catch (error) {
          operationError = error;
          break;
        }
      }
      reconciliation = await reconcileCollectionAndWallet();
    } catch (error) {
      operationError = error;
      reconciliation = await reconcileCollectionAndWallet();
    }

    try {
      const refreshed = reconciliation?.collection;
      if (before && refreshed) {
        const remainingIds = new Set(refreshed.fish.map((specimen) => specimen.id));
        const sold = before.fish.filter((specimen) => !remainingIds.has(specimen.id));
        const soldValue = sold.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0);
        const complete = sold.length === before.fish.length;
        const walletNote = reconciliation.walletRefreshed ? " Wallet and collection are up to date." : " Collection is up to date; wallet refresh failed, so retry shortly.";
        if (complete) {
          shell.setStatus(sold.length > 0 ? `Sold ${sold.length} fish for ${soldValue.toLocaleString()} coins.${walletNote}` : "No fish to sell.", "ready");
        } else {
          const errorMessage = operationError instanceof Error ? ` ${operationError.message}` : "";
          shell.setStatus(`Sold ${sold.length} of ${before.fish.length} fish for ${soldValue.toLocaleString()} coins.${errorMessage}${walletNote}`, "ready");
        }
      } else if (operationError) {
        shell.setStatus(operationError instanceof Error ? operationError.message : "Unable to sell all fish. Collection and wallet could not be fully refreshed.", "error");
      } else {
        shell.setStatus("Unable to confirm the sale. Retry when your connection is stable.", "error");
      }
    } finally {
      sellLock.release();
      shell.setActionPending(false);
    }
  })();
});

shell.setSellCatchHandler((catchId) => {
  if (!sellLock.tryAcquire()) return;
  shell.setActionPending(true);
  void (async () => {
    let before: Awaited<ReturnType<typeof api.getCollection>> | undefined;
    try {
      shell.setStatus("Selling the fish…");
      before = await api.getCollection();
      const result = await api.sellCatch(catchId);
      const reconciliation = await reconcileCollectionAndWallet();
      const walletNote = reconciliation.walletRefreshed ? " Wallet and collection are up to date." : " Wallet updated; collection refresh failed, so retry shortly.";
      shell.setStatus(`Sold ${result.catch.species.commonName} for ${result.catch.saleValueCoins.toLocaleString()} coins.${walletNote}`, "ready");
    } catch (error) {
      const reconciliation = await reconcileCollectionAndWallet();
      const stillListed = reconciliation.collection?.fish.some((specimen) => specimen.id === catchId) ?? true;
      if (!stillListed) {
        const soldSpecimen = before?.fish.find((specimen) => specimen.id === catchId);
        const walletNote = reconciliation.walletRefreshed ? " Wallet and collection are up to date." : " Collection updated; wallet refresh failed, so retry shortly.";
        shell.setStatus(
          `Sale confirmed${soldSpecimen ? ` for ${soldSpecimen.saleValueCoins.toLocaleString()} coins` : ""}.${walletNote}`,
          "ready",
        );
        return;
      }
      shell.setStatus(error instanceof Error ? error.message : "Unable to sell that fish.", "error");
    } finally {
      sellLock.release();
      shell.setActionPending(false);
    }
  })();
});

const selectLock = createMutationLock();

shell.setSelectEquipmentHandler((request: EquipmentSelectionRequest) => {
  if (!selectLock.tryAcquire()) return;
  shell.setActionPending(true);
  void (async () => {
    try {
      shell.setStatus("Swapping gear…");
      const result = await api.selectEquipment(request);
      if (currentGameState) {
        currentGameState = { ...currentGameState, activeEquipment: result.activeEquipment, inventory: result.inventory };
        shell.setGameState(currentGameState);
      }
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to swap that piece of equipment.", "error");
    } finally {
      selectLock.release();
      shell.setActionPending(false);
    }
  })();
});

const recoveryLock = createMutationLock();

shell.setRecoveryHandler(() => {
  if (!recoveryLock.tryAcquire()) return;
  shell.setActionPending(true);
  void (async () => {
    try {
      shell.setStatus("Digging in the shallows…");
      const result = await api.digForWorms();
      currentGameState = await refreshGameState();
      if (shell.getActiveScreen() === "lakes") renderLakes();
      const parts: string[] = [];
      if (result.wormsGranted > 0) parts.push(`+${result.wormsGranted} worms`);
      if (result.lureRestored) parts.push("spinner untangled");
      shell.setStatus(`Emergency tackle: ${parts.join(", ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Nothing left to dig up right now.", "error");
    } finally {
      recoveryLock.release();
      shell.setActionPending(false);
    }
  })();
});

async function bootstrap(): Promise<void> {
  shell.setStatus("Connecting…");

  try {
    let player;
    if (api.hasSession) {
      player = (await api.getMe()).player;
    }

    if (!player && telegram.initData) {
      player = (await api.authenticateWithTelegram(telegram.initData)).player;
    } else if (!player && import.meta.env.DEV) {
      player = (await api.authenticateForDevelopment()).player;
    }

    if (!player) {
      throw new Error("Open this game from Telegram to sign in.");
    }

    currentGameState = await api.getGameState();
    const active = await api.getActiveEncounter();
    renderLakes();
    if (active.encounter) {
      resumeEncounter(active.encounter);
    } else if (active.expired) {
      shell.setStatus("Your interrupted fishing attempt expired. The used bait and lure were not returned.", "ready");
    } else if (!telegram.isAvailable) {
      shell.setStatus("Local development mode", "ready");
    } else {
      shell.clearStatus();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect.";
    shell.showRetryPanel("Unable to connect", message, "Try again", () => void bootstrap());
  }
}

void bootstrap();
