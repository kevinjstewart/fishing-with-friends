import type {
  CatchDecision,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  GameStateResponse,
  LeaderboardResponse,
} from "@fishing/shared";

export type ScreenId = "lakes" | "friends" | "shop" | "collection" | "journal";
export type ShopCategory = "boats" | "rods" | "lures" | "bait";
export type CollectionSortMode = "newest" | "heaviest" | "value" | "species";
export type JournalFilterMode = "all" | "discovered" | "undiscovered";
export type ToastState = "loading" | "ready" | "error";

export interface EquipmentSelectionRequest {
  rodId?: string;
  lureId?: string;
  baitId?: string;
}

export interface RetryPanelRequest {
  eyebrow: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  onBack?: () => void;
}

export interface CatchResultView {
  result: CompleteFishingResponse;
  onDecision: (decision: CatchDecision) => void;
  onBack: () => void;
}

export interface DecisionResultView {
  result: CatchDecisionResponse;
  onBack: () => void;
}

export interface UiEventMap {
  "ui:navigate": { screen: ScreenId };
  "ui:shop-open": { category: ShopCategory };
  "ui:start-fishing": { locationId: string };
  "ui:purchase": { itemId: string; quantity?: number };
  "ui:sell-catch": { catchId: string };
  "ui:sell-all": undefined;
  "ui:select-equipment": EquipmentSelectionRequest;
  "ui:recovery": undefined;
  "ui:share": undefined;
  "ui:location-selected": { locationId: string };
  "ui:shop-category": { category: ShopCategory };
  "ui:bait-quantity": { baitId: string; quantity: number };
  "ui:collection-sort": { mode: CollectionSortMode };
  "ui:collection-confirm": undefined;
  "ui:collection-cancel": undefined;
  "ui:journal-filter": { mode: JournalFilterMode };
  "ui:go-fishing": undefined;
  "ui:catch-decision": { decision: "keep" | "sell" };
  "ui:return-to-lakes": undefined;
}

export function emitUiEvent<Name extends keyof UiEventMap>(source: HTMLElement, name: Name, detail: UiEventMap[Name]): void {
  source.dispatchEvent(
    new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail,
    }),
  );
}

export type UiGameData = {
  gameState?: GameStateResponse;
  collection?: CollectionResponse;
  journal?: FishJournalResponse;
  leaderboard?: LeaderboardResponse;
};
