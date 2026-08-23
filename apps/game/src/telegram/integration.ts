export interface TelegramIntegration {
  readonly isAvailable: boolean;
  readonly initData: string;
  initialize(onInsetsChanged?: () => void): void;
  syncViewportInsets(): void;
}

export function createTelegramIntegration(onInsetsChanged?: () => void): TelegramIntegration {
  const webApp = window.Telegram?.WebApp;

  const applyStableInsets = (payload?: { isStateStable?: boolean }): void => {
    if (payload?.isStateStable === false) return;
    onInsetsChanged?.();
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
      webApp?.onEvent?.("contentSafeAreaChanged", applyStableInsets);
      this.syncViewportInsets();
    },
    syncViewportInsets: applyStableInsets,
  };
}
