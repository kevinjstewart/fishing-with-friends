export interface TelegramIntegration {
  readonly isAvailable: boolean;
  readonly initData: string;
  initialize(): void;
}

export function createTelegramIntegration(): TelegramIntegration {
  const webApp = window.Telegram?.WebApp;
  return {
    isAvailable: Boolean(webApp?.initData),
    initData: webApp?.initData ?? "",
    initialize() {
      webApp?.ready();
      webApp?.expand();
    },
  };
}
