export interface TelegramIntegration {
  readonly isAvailable: boolean;
  readonly initData: string;
  initialize(): void;
  syncViewportInsets(): void;
}

export function createTelegramIntegration(): TelegramIntegration {
  const webApp = window.Telegram?.WebApp;

  const applyStableInsets = (payload?: { isStateStable?: boolean }): void => {
    if (payload?.isStateStable === false) return;

    const root = document.documentElement.style;
    const safeInsets = webApp?.safeAreaInset;
    const contentInsets = webApp?.contentSafeAreaInset;

    const viewportHeight = window.innerHeight;
    const stableHeight = webApp?.viewportStableHeight ?? viewportHeight;
    const fallbackBottom = Math.max(0, viewportHeight - stableHeight);

    root.setProperty(
      "--tg-content-safe-area-inset-top",
      `${Math.max(safeInsets?.top ?? 0, contentInsets?.top ?? 0, 0)}px`,
    );
    root.setProperty(
      "--tg-content-safe-area-inset-right",
      `${Math.max(safeInsets?.right ?? 0, contentInsets?.right ?? 0, 0)}px`,
    );
    root.setProperty(
      "--tg-content-safe-area-inset-bottom",
      `${Math.max(safeInsets?.bottom ?? 0, contentInsets?.bottom ?? 0, fallbackBottom)}px`,
    );
    root.setProperty(
      "--tg-content-safe-area-inset-left",
      `${Math.max(safeInsets?.left ?? 0, contentInsets?.left ?? 0, 0)}px`,
    );
  };

  return {
    isAvailable: Boolean(webApp?.initData),
    initData: webApp?.initData ?? "",
    initialize() {
      webApp?.ready();
      webApp?.expand();
      webApp?.setHeaderColor?.("#041220");
      webApp?.setBackgroundColor?.("#041220");
      webApp?.disableVerticalSwipes?.();
      webApp?.onEvent?.("viewportChanged", applyStableInsets);
      webApp?.onEvent?.("safeAreaChanged", applyStableInsets);
      this.syncViewportInsets();
    },
    syncViewportInsets: applyStableInsets,
  };
}
