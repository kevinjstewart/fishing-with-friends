import "./styles.css";
import { ApiClient, ApiClientError } from "./api/client";
import { createGame } from "./game/create-game";
import { AppShell } from "./ui/app-shell";
import { createTelegramIntegration } from "./telegram/integration";

const uiRoot = document.querySelector<HTMLElement>("#ui-root");
const gameRoot = document.querySelector<HTMLElement>("#game-root");
if (!uiRoot || !gameRoot) {
  throw new Error("The game shell is missing its root elements.");
}

const shell = new AppShell(uiRoot);
const telegram = createTelegramIntegration();
telegram.initialize();
createGame(gameRoot);

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? "");

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

    shell.setPlayer(player);
    shell.setStatus(telegram.isAvailable ? "Connected to Telegram" : "Local development mode", "ready");
  } catch (error) {
    shell.setStatus(error instanceof Error ? error.message : "Unable to connect.", "error");
  }
}

void bootstrap();
