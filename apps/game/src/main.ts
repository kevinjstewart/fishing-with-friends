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

shell.setStartFishingHandler((locationId) => {
  void (async () => {
    if (!currentGameState || fishingActive) return;
    shell.setStatus("Preparing your line…");
    try {
      const encounter = await api.startFishing({ locationId, ...currentGameState.activeEquipment });
      fishingActive = true;
      shell.setNavEnabled(false);
      shell.showEncounter(encounter);
      game.events.emit("fishing:start", encounter);
      shell.setStatus("Encounter ready · control the net", "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to start fishing.", "error");
    }
  })();
});

game.events.on("fishing:complete", (event: { encounterId: string; performance: number }) => {
  void (async () => {
    shell.setStatus("Checking the catch…");
    try {
      const result = await api.completeFishing(event.encounterId, event.performance);
      const handleDecision = (decision: "keep" | "sell") => {
        void (async () => {
          if (!result.catch) return;
          shell.setStatus(decision === "sell" ? "Selling the fish…" : "Recording the fish…");
          try {
            const decisionResult = await api.decideCatch(result.catch.id, decision);
            shell.showDecisionResult(decisionResult, () => void returnToLakes());
            shell.setStatus(decision === "sell" ? "Fish sold" : "Fish kept", "ready");
          } catch (error) {
            shell.setStatus(error instanceof Error ? error.message : "Unable to record the catch.", "error");
          }
        })();
      };
      shell.showFishingResult(result, handleDecision, () => void returnToLakes());
      shell.setStatus(result.outcome === "caught" ? "Catch landed" : "The fish got away", result.outcome === "caught" ? "ready" : "error");
    } catch (error) {
      fishingActive = false;
      shell.setNavEnabled(true);
      shell.setStatus(error instanceof Error ? error.message : "Unable to resolve the encounter.", "error");
    }
  })();
});

shell.setPurchaseHandler((itemId) => {
  void (async () => {
    shell.setStatus("Buying…");
    try {
      const result = await api.purchase({ itemId });
      currentGameState = currentGameState
        ? { ...currentGameState, coins: result.coins, inventory: result.inventory, activeEquipment: result.activeEquipment }
        : await api.getGameState();
      shell.renderShop();
      shell.updateWallet(result.coins);
      shell.setStatus(`Purchased ${itemId.replace(/-/g, " ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof ApiClientError ? error.message : "Unable to complete that purchase.", "error");
    }
  })();
});

shell.setSellCatchHandler((catchId) => {
  void (async () => {
    shell.setStatus("Selling the fish…");
    try {
      const result = await api.sellCatch(catchId);
      if (currentGameState) currentGameState.coins = result.coins;
      shell.updateWallet(result.coins);
      const remaining = (await api.getCollection()).fish;
      shell.showCollection({ fish: remaining });
      shell.setStatus(`Sold ${result.catch.species.commonName} for ${result.catch.saleValueCoins.toLocaleString()} coins`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to sell that fish.", "error");
    }
  })();
});

shell.setSelectEquipmentHandler((request: EquipmentSelectionRequest) => {
  void (async () => {
    shell.setStatus("Swapping gear…");
    try {
      const result = await api.selectEquipment(request);
      if (currentGameState) {
        currentGameState = { ...currentGameState, activeEquipment: result.activeEquipment, inventory: result.inventory };
        renderLakes();
      }
      shell.setStatus("Loadout updated", "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Unable to swap that piece of equipment.", "error");
    }
  })();
});

shell.setRecoveryHandler(() => {
  void (async () => {
    shell.setStatus("Digging in the shallows…");
    try {
      const result = await api.digForWorms();
      await refreshGameState();
      renderLakes();
      const parts: string[] = [];
      if (result.wormsGranted > 0) parts.push(`+${result.wormsGranted} worms`);
      if (result.lureRestored) parts.push("spinner untangled");
      shell.setStatus(`Emergency tackle: ${parts.join(", ")}`, "ready");
    } catch (error) {
      shell.setStatus(error instanceof Error ? error.message : "Nothing left to dig up right now.", "error");
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
    shell.setPlayer(player);
    renderLakes();
    shell.setStatus(telegram.isAvailable ? "Connected to Telegram" : "Local development mode", "ready");
  } catch (error) {
    shell.setStatus(error instanceof Error ? error.message : "Unable to connect.", "error");
  }
}

void bootstrap();
