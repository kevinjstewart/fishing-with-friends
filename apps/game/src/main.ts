import type { GameStateResponse } from "@fishing/shared";
import "./styles.css";
import { ApiClient, ApiClientError } from "./api/client";
import { createGame } from "./game/create-game";
import { AppShell, type EquipmentSelectionRequest, type ScreenId } from "./ui/app-shell";
import { createTelegramIntegration } from "./telegram/integration";

const uiRoot = document.querySelector<HTMLElement>("#ui-root");
const gameRoot = document.querySelector<HTMLElement>("#game-root");
if (!uiRoot || !gameRoot) {
  throw new Error("The game shell is missing its root elements.");
}

const shell = new AppShell(uiRoot);
const telegram = createTelegramIntegration();
telegram.initialize();
const game = createGame(gameRoot);
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? "");
let currentGameState: GameStateResponse | undefined;
let fishingActive = false;

const safeAreaProbe = document.querySelector<HTMLElement>("#safe-area-probe");

function syncSafeArea(): void {
  if (!safeAreaProbe) return;
  game.registry.set("safeArea", {
    top: Number.parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0,
    right: Number.parseFloat(getComputedStyle(safeAreaProbe).paddingRight) || 0,
    bottom: Number.parseFloat(getComputedStyle(safeAreaProbe).paddingBottom) || 0,
    left: Number.parseFloat(getComputedStyle(safeAreaProbe).paddingLeft) || 0,
  });
  game.events.emit("safearea:changed");
}

syncSafeArea();
window.addEventListener("orientationchange", () => window.setTimeout(syncSafeArea, 120));
window.visualViewport?.addEventListener("resize", syncSafeArea);
window.addEventListener("resize", syncSafeArea);
telegram.syncViewportInsets();

async function refreshGameState(): Promise<void> {
  currentGameState = await api.getGameState();
}

function renderLakes(): void {
  if (!currentGameState) return;
  shell.setNavEnabled(true);
  shell.setActiveScreen("lakes");
  shell.setGameState(currentGameState);
  game.events.emit("fishing:lobby");
}

async function returnToLakes(): Promise<void> {
  fishingActive = false;
  document.body.classList.remove("is-fighting");
  try {
    await refreshGameState();
    renderLakes();
    shell.setStatus("Ready to cast", "ready");
  } catch (error) {
    shell.setStatus(error instanceof Error ? error.message : "Unable to reload your fishing state.", "error");
  }
}

async function openScreen(screen: ScreenId): Promise<void> {
  if (fishingActive) return;
  try {
    if (screen === "shop") {
      await refreshGameState();
      shell.setActiveScreen("shop");
      shell.renderShop();
      shell.setStatus("Browsing the tackle shop", "ready");
      return;
    }
    if (screen === "collection") {
      const collection = await api.getCollection();
      shell.setActiveScreen("collection");
      shell.showCollection(collection);
      shell.setStatus(`${collection.fish.length} kept fish`, "ready");
      return;
    }
    if (screen === "journal") {
      const journal = await api.getJournal();
      shell.setActiveScreen("journal");
      shell.renderJournal(journal);
      shell.setStatus("Fish journal updated", "ready");
      return;
    }
    await returnToLakes();
  } catch (error) {
    shell.setStatus(error instanceof Error ? error.message : "Unable to open that screen.", "error");
  }
}

shell.setNavigationHandler((screen) => void openScreen(screen));

let startPending = false;

shell.setStartFishingHandler((locationId) => {
  if (startPending || fishingActive) return;
  startPending = true;
  void (async () => {
    try {
      if (!currentGameState) return;
      shell.setStatus("Preparing your line…");
      const encounter = await api.startFishing({ locationId, ...currentGameState.activeEquipment });
      fishingActive = true;
      shell.setNavEnabled(false);
      game.events.emit("fight:start", encounter);
      document.body.classList.add("is-fighting");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to start fishing.", "error");
    } finally {
      startPending = false;
    }
  })();
});

async function resolveCompletion(event: { encounterId: string; performance: number }): Promise<void> {
  fishingActive = false;
  shell.setNavEnabled(true);
  document.body.classList.remove("is-fighting");
  shell.setStatus("Checking the catch…");
  try {
    const result = await api.completeFishing(event.encounterId, event.performance);
    const handleDecision = (decision: "keep" | "sell") => {
      void (async () => {
        if (!result.catch) return;
        shell.setStatus(decision === "sell" ? "Selling the fish…" : "Recording the fish…");
        try {
          await api.decideCatch(result.catch.id, decision);
          shell.setStatus(decision === "sell" ? "Fish sold" : "Fish kept", "ready");
          await returnToLakes();
        } catch (error) {
          shell.setStatus(error instanceof Error ? error.message : "Unable to record the catch.", "error");
        }
      })();
    };
    shell.showFishingResult(result, handleDecision, () => void returnToLakes());
    shell.setStatus(result.outcome === "caught" ? "Catch landed" : "The fish got away", result.outcome === "caught" ? "ready" : "error");
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
      await returnToLakes();
      shell.setStatus("That fishing attempt was already resolved.", "ready");
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
    shell.setStatus(message, "error");
  }
}

game.events.on("fishing:complete", (event: { encounterId: string; performance: number }) => {
  void resolveCompletion(event);
});

let purchasePending = false;

shell.setPurchaseHandler((itemId, quantity) => {
  if (purchasePending) return;
  purchasePending = true;
  void (async () => {
    try {
      shell.setStatus("Buying…");
      const result = await api.purchase({ itemId, quantity });
      currentGameState = currentGameState
        ? { ...currentGameState, coins: result.coins, inventory: result.inventory, activeEquipment: result.activeEquipment }
        : await api.getGameState();
      shell.renderShop();
      shell.updateWallet(result.coins);
      shell.setStatus(`Purchased ${itemId.replace(/-/g, " ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof ApiClientError ? error.message : "Unable to complete that purchase.", "error");
    } finally {
      purchasePending = false;
    }
  })();
});

let sellPending = false;

shell.setSellAllHandler(() => {
  if (sellPending) return;
  sellPending = true;
  void (async () => {
    try {
      if (!currentGameState) return;
      shell.setStatus("Selling all fish…");
      if (currentGameState) {
        const collection = await api.getCollection();
        for (const specimen of collection.fish) {
          await api.sellCatch(specimen.id);
        }
      }
      const refreshed = await api.getCollection();
      shell.showCollection(refreshed);
      const totalSold = refreshed.fish.length === 0 ? 0 : 1;
      shell.setStatus(totalSold > 0 ? "All fish sold" : "No fish to sell", "ready");
      await refreshGameState();
      shell.updateWallet(currentGameState?.coins ?? 0);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        try {
          shell.showCollection(await api.getCollection());
        } catch {
          // Keep the cached list.
        }
        shell.setStatus("Some fish were already sold.", "ready");
        return;
      }
      shell.setStatus(error instanceof Error ? error.message : "Unable to sell all fish.", "error");
    } finally {
      sellPending = false;
    }
  })();
});

shell.setSellCatchHandler((catchId) => {
  if (sellPending) return;
  sellPending = true;
  void (async () => {
    try {
      shell.setStatus("Selling the fish…");
      const result = await api.sellCatch(catchId);
      if (currentGameState) currentGameState.coins = result.coins;
      shell.updateWallet(result.coins);
      const remaining = (await api.getCollection()).fish;
      shell.showCollection({ fish: remaining });
      shell.setStatus(`Sold ${result.catch.species.commonName} for ${result.catch.saleValueCoins.toLocaleString()} coins`, "ready");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        try {
          shell.showCollection(await api.getCollection());
        } catch {
          // Keep the cached list; the wallet is already reconciled.
        }
        shell.setStatus("That fish was already sold.", "ready");
        return;
      }
      shell.setStatus(error instanceof Error ? error.message : "Unable to sell that fish.", "error");
    } finally {
      sellPending = false;
    }
  })();
});

let selectPending = false;

shell.setSelectEquipmentHandler((request: EquipmentSelectionRequest) => {
  if (selectPending) return;
  selectPending = true;
  void (async () => {
    try {
      shell.setStatus("Swapping gear…");
      const result = await api.selectEquipment(request);
      if (currentGameState) {
        currentGameState = { ...currentGameState, activeEquipment: result.activeEquipment, inventory: result.inventory };
        renderLakes();
      }
      shell.setStatus("Loadout updated", "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to swap that piece of equipment.", "error");
    } finally {
      selectPending = false;
    }
  })();
});

let recoveryPending = false;

shell.setRecoveryHandler(() => {
  if (recoveryPending) return;
  recoveryPending = true;
  void (async () => {
    try {
      shell.setStatus("Digging in the shallows…");
      const result = await api.digForWorms();
      await refreshGameState();
      renderLakes();
      const parts: string[] = [];
      if (result.wormsGranted > 0) parts.push(`+${result.wormsGranted} worms`);
      if (result.lureRestored) parts.push("spinner untangled");
      shell.setStatus(`Emergency tackle: ${parts.join(", ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Nothing left to dig up right now.", "error");
    } finally {
      recoveryPending = false;
    }
  })();
});

async function bootstrap(): Promise<void> {
  shell.setStatus("Connecting…");

  try {
    let player;
    if (api.hasSession) {
      try {
        player = (await api.getMe()).player;
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 401) {
          throw error;
        }
        api.clearSession();
      }
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
    renderLakes();
    shell.setStatus(telegram.isAvailable ? "Connected to Telegram" : "Local development mode", "ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect.";
    shell.showRetryPanel("Unable to connect", message, "Try again", () => void bootstrap());
    shell.setStatus(message, "error");
  }
}

void bootstrap();
