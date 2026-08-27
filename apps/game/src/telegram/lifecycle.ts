import { publishSafeArea, readSafeArea, type SafeAreaInsets } from "../safe-area";

type ViewportEventPayload = { isStateStable?: boolean };
type ViewportEvent = "viewportChanged" | "safeAreaChanged" | "contentSafeAreaChanged" | "fullscreenChanged";

export interface TelegramLifecycleOptions {
  target: HTMLElement;
  safeAreaProbe: HTMLElement;
  onSafeAreaChanged?: (insets: SafeAreaInsets) => void;
  windowRef?: Window;
  webApp?: TelegramWebApp;
}

export interface TelegramLifecycle {
  readonly isAvailable: boolean;
  readonly initData: string;
  initialize(): void;
  syncViewportInsets(): void;
  dispose(): void;
}

const TELEGRAM_EVENTS: readonly ViewportEvent[] = [
  "viewportChanged",
  "safeAreaChanged",
  "contentSafeAreaChanged",
  "fullscreenChanged",
];

/**
 * Framework-neutral owner for Telegram's initialization, viewport events,
 * browser resize events, and CSS/Phaser safe-area synchronization.
 */
export function createTelegramLifecycle(options: TelegramLifecycleOptions): TelegramLifecycle {
  const windowRef = options.windowRef ?? window;
  const webApp = options.webApp ?? windowRef.Telegram?.WebApp;
  let initialized = false;
  let disposed = false;
  let orientationTimer: number | undefined;

  const applyStableInsets = (payload?: ViewportEventPayload): void => {
    if (payload?.isStateStable === false || disposed) return;
    syncViewportInsets();
  };
  const handleBrowserResize = (): void => applyStableInsets();

  const handleOrientationChange = (): void => {
    if (orientationTimer !== undefined) windowRef.clearTimeout(orientationTimer);
    orientationTimer = windowRef.setTimeout(() => {
      orientationTimer = undefined;
      applyStableInsets();
    }, 120);
  };

  function syncViewportInsets(): void {
    if (disposed) return;
    const telegramMock = windowRef.__FISHING_TELEGRAM_MOCK__;
    if (telegramMock) {
      publishSafeArea(options.target, {
        device: telegramMock.safeArea,
        content: telegramMock.contentSafeArea,
      });
    } else {
      publishSafeArea(options.target, {
        device: webApp?.safeAreaInset,
        content: webApp?.contentSafeAreaInset,
      });
    }
    options.onSafeAreaChanged?.(readSafeArea(options.safeAreaProbe));
  }

  function initialize(): void {
    if (initialized || disposed) return;
    initialized = true;
    webApp?.ready();
    webApp?.expand();
    webApp?.setHeaderColor?.("#041220");
    webApp?.setBackgroundColor?.("#041220");
    webApp?.disableVerticalSwipes?.();
    for (const event of TELEGRAM_EVENTS) webApp?.onEvent?.(event, applyStableInsets);
    windowRef.addEventListener("orientationchange", handleOrientationChange);
    windowRef.visualViewport?.addEventListener("resize", handleBrowserResize);
    windowRef.addEventListener("resize", handleBrowserResize);
    syncViewportInsets();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (orientationTimer !== undefined) windowRef.clearTimeout(orientationTimer);
    orientationTimer = undefined;
    for (const event of TELEGRAM_EVENTS) webApp?.offEvent?.(event, applyStableInsets);
    windowRef.removeEventListener("orientationchange", handleOrientationChange);
    windowRef.visualViewport?.removeEventListener("resize", handleBrowserResize);
    windowRef.removeEventListener("resize", handleBrowserResize);
  }

  return {
    isAvailable: Boolean(webApp?.initData),
    initData: webApp?.initData ?? "",
    initialize,
    syncViewportInsets,
    dispose,
  };
}
