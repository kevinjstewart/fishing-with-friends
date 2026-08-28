export type ScreenId = "lakes" | "friends" | "shop" | "collection" | "journal";

export type ShopCategory = "boats" | "rods" | "lures" | "bait";
export type CollectionSortMode = "newest" | "heaviest" | "value" | "species";
export type JournalFilterMode = "all" | "discovered" | "undiscovered";
export type ToastState = "loading" | "ready" | "error";

export type AppPhase = "booting" | "ready" | "recoverable-error";

export interface AppError {
  operation: "bootstrap" | "navigation";
  message: string;
  target?: ScreenId;
}

export interface AppState {
  phase: AppPhase;
  screen: ScreenId;
  lastSuccessfulScreen: ScreenId;
  navigation: {
    status: "idle" | "loading";
    target?: ScreenId;
    requestId: number;
  };
  error?: AppError;
}

export type AppEvent =
  | { type: "BOOT_SUCCEEDED"; screen?: ScreenId }
  | { type: "BOOT_FAILED"; message: string }
  | { type: "BOOT_RETRY" }
  | { type: "NAVIGATION_STARTED"; screen: ScreenId; requestId: number }
  | { type: "NAVIGATION_SUCCEEDED"; screen: ScreenId; requestId: number }
  | { type: "NAVIGATION_FAILED"; screen: ScreenId; requestId: number; message: string };
