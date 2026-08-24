export {};

declare global {
  interface TelegramWebApp {
    initData: string;
    ready: () => void;
    expand: () => void;
    setHeaderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    disableVerticalSwipes?: () => void;
    openTelegramLink?: (url: string) => void;
    openLink?: (url: string) => void;
    showAlert?: (message: string) => void;
    safeAreaInset?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    contentSafeAreaInset?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    viewportStableHeight?: number;
    onEvent?: (
      eventType: "viewportChanged" | "safeAreaChanged" | "contentSafeAreaChanged" | "fullscreenChanged",
      handler: (payload?: { isStateStable?: boolean }) => void,
    ) => void;
    offEvent?: (
      eventType: "viewportChanged" | "safeAreaChanged" | "contentSafeAreaChanged" | "fullscreenChanged",
      handler: (payload?: { isStateStable?: boolean }) => void,
    ) => void;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
