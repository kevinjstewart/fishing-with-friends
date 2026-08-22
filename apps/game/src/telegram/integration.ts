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
    root.setProperty("--tg-content-safe-area-inset-top", `${webApp?.contentSafeAreaInset?.top ?? 0}px`);
    root.setProperty("--tg-content-safe-area-inset-right", `${webApp?.contentSafeAreaInset?.right ?? 0}px`);
    root.setProperty("--tg-content-safe-area-inset-bottom", `${webApp?.contentSafeAreaInset?.bottom ?? 0}px`);
    root.setProperty("--tg-content-safe-area-inset-left", `${webApp?.contentSafeAreaInset?.left ?? 0}px`);
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
      this.syncViewportInsets();
    },
    syncViewportInsets: applyStableInsets,
  };
}
