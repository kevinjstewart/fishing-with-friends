import { AuthenticatedClient } from "../api/authenticated-client";
import { ApiClient } from "../api/client";
import { createLazyFishingRuntime } from "../game/lazy-phaser-runtime";
import type { FishingRuntime } from "../game/phaser-runtime";
import { createTelegramLifecycle, type TelegramLifecycle } from "../telegram/lifecycle";
import type { BootstrapApi } from "./use-bootstrap";

export interface ReactAppServices {
  api: BootstrapApi;
  telegram: TelegramLifecycle;
  runtime: FishingRuntime;
  isDevelopment: boolean;
}

export function createReactAppServices(): ReactAppServices {
  const gameRoot = document.querySelector<HTMLElement>("#game-root");
  const safeAreaProbe = document.querySelector<HTMLElement>("#safe-area-probe");
  if (!gameRoot || !safeAreaProbe) throw new Error("The game roots are missing.");

  const runtime = createLazyFishingRuntime(gameRoot);
  const telegram = createTelegramLifecycle({
    target: document.documentElement,
    safeAreaProbe,
    onSafeAreaChanged: (insets) => runtime.setSafeArea(insets),
  });
  const api = new AuthenticatedClient({
    api: new ApiClient(import.meta.env.VITE_API_BASE_URL ?? ""),
    isDevelopment: import.meta.env.DEV,
    getTelegramInitData: () => telegram.initData,
  });

  return { api, telegram, runtime, isDevelopment: import.meta.env.DEV };
}
