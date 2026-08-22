export {};

declare global {
  interface TelegramWebApp {
    initData: string;
    ready: () => void;
    expand: () => void;
    setHeaderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    disableVerticalSwipes?: () => void;
    contentSafeAreaInset?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    onEvent?: (
      eventType: "viewportChanged",
      handler: (payload?: { isStateStable?: boolean }) => void,
    ) => void;
    offEvent?: (
      eventType: "viewportChanged",
      handler: (payload?: { isStateStable?: boolean }) => void,
    ) => void;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
