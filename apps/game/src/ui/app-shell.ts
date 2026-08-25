import type {
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  GameStateResponse,
  LeaderboardResponse,
} from "@fishing/shared";
import "./components/game-app";
import type { GameAppElement } from "./components/game-app";
import type {
  CollectionSortMode,
  DecisionResultView,
  EquipmentSelectionRequest,
  JournalFilterMode,
  ScreenId,
  ShopCategory,
  ToastState,
} from "./types";
import type { CatchResultView, RetryPanelRequest } from "./types";

export type { EquipmentSelectionRequest, ScreenId } from "./types";

type Handler<T extends unknown[] = []> = (...args: T) => void;

/**
 * Imperative coordination adapter for the Worker/game orchestration layer.
 * Rendering belongs to game-app and its focused Lit children; this class only
 * owns the public bridge used by main.ts and translates typed UI events.
 */
export class AppShell {
  private readonly app: GameAppElement;
  private gameState?: GameStateResponse;
  private activeScreen: ScreenId = "lakes";
  private shopCategory: ShopCategory = "bait";
  private collectionSort: CollectionSortMode = "newest";
  private journalFilter: JournalFilterMode = "all";
  private sellAllConfirming = false;
  private status?: { message: string; state: ToastState };
  private statusTimer?: number;
  private navigationHandler?: Handler<[ScreenId]>;
  private startFishingHandler?: Handler<[string]>;
  private purchaseHandler?: Handler<[string, number?]>;
  private sellCatchHandler?: Handler<[string]>;
  private sellAllHandler?: Handler;
  private selectEquipmentHandler?: Handler<[EquipmentSelectionRequest]>;
  private recoveryHandler?: Handler;
  private shareHandler?: Handler;
  private catchDecisionHandler?: Handler<["keep" | "sell"]>;
  private catchBackHandler?: Handler;

  constructor(root: HTMLElement) {
    this.app = document.createElement("game-app") as GameAppElement;
    root.replaceChildren(this.app);
    this.bindUiEvents();
  }

  private bindUiEvents(): void {
    this.app.addEventListener("ui:navigate", (event) => {
      const detail = (event as CustomEvent<{ screen: ScreenId }>).detail;
      this.navigationHandler?.(detail.screen);
    });
    this.app.addEventListener("ui:shop-open", (event) => {
      const detail = (event as CustomEvent<{ category: ShopCategory }>).detail;
      this.openShop(detail.category);
    });
    this.app.addEventListener("ui:start-fishing", (event) => {
      const detail = (event as CustomEvent<{ locationId: string }>).detail;
      this.startFishingHandler?.(detail.locationId);
    });
    this.app.addEventListener("ui:purchase", (event) => {
      const detail = (event as CustomEvent<{ itemId: string; quantity?: number }>).detail;
      this.purchaseHandler?.(detail.itemId, detail.quantity);
    });
    this.app.addEventListener("ui:sell-catch", (event) => {
      const detail = (event as CustomEvent<{ catchId: string }>).detail;
      this.sellCatchHandler?.(detail.catchId);
    });
    this.app.addEventListener("ui:sell-all", () => this.sellAllHandler?.());
    this.app.addEventListener("ui:select-equipment", (event) => {
      const detail = (event as CustomEvent<EquipmentSelectionRequest>).detail;
      this.selectEquipmentHandler?.(detail);
    });
    this.app.addEventListener("ui:recovery", () => this.recoveryHandler?.());
    this.app.addEventListener("ui:share", () => this.shareHandler?.());
    this.app.addEventListener("ui:shop-category", (event) => {
      const detail = (event as CustomEvent<{ category: ShopCategory }>).detail;
      this.shopCategory = detail.category;
      this.app.shopCategory = detail.category;
    });
    this.app.addEventListener("ui:collection-sort", (event) => {
      const detail = (event as CustomEvent<{ mode: CollectionSortMode }>).detail;
      this.collectionSort = detail.mode;
      this.app.collectionSort = detail.mode;
    });
    this.app.addEventListener("ui:collection-confirm", () => {
      this.sellAllConfirming = true;
      this.app.sellAllConfirming = true;
    });
    this.app.addEventListener("ui:collection-cancel", () => {
      this.sellAllConfirming = false;
      this.app.sellAllConfirming = false;
    });
    this.app.addEventListener("ui:journal-filter", (event) => {
      const detail = (event as CustomEvent<{ mode: JournalFilterMode }>).detail;
      this.journalFilter = detail.mode;
      this.app.journalFilter = detail.mode;
    });
    this.app.addEventListener("ui:go-fishing", () => this.navigationHandler?.("lakes"));
    this.app.addEventListener("ui:catch-decision", (event) => {
      const detail = (event as CustomEvent<{ decision: "keep" | "sell" }>).detail;
      this.catchDecisionHandler?.(detail.decision);
    });
    this.app.addEventListener("ui:return-to-lakes", () => this.catchBackHandler?.());
  }

  setStatus(message: string, state: ToastState = "loading"): void {
    if (this.statusTimer) window.clearTimeout(this.statusTimer);
    this.status = { message, state };
    this.app.status = this.status;
    this.statusTimer = window.setTimeout(() => {
      if (this.app.status === this.status) this.clearStatus();
    }, state === "loading" ? 15_000 : 3_200);
  }

  clearStatus(): void {
    if (this.statusTimer) window.clearTimeout(this.statusTimer);
    this.statusTimer = undefined;
    this.status = undefined;
    this.app.status = undefined;
  }

  updateWallet(coins: number): void {
    this.gameState = this.gameState ? { ...this.gameState, coins } : this.gameState;
    this.app.coins = coins;
    if (this.gameState) this.app.gameState = this.gameState;
  }

  getActiveScreen(): ScreenId {
    return this.activeScreen;
  }

  setNavEnabled(enabled: boolean): void {
    this.app.navEnabled = enabled;
  }

  setNavigationPending(screen?: ScreenId): void {
    this.app.pendingNavigation = screen;
  }

  setActionPending(pending: boolean): void {
    this.app.actionPending = pending;
  }

  setActiveScreen(screen: ScreenId): void {
    this.activeScreen = screen;
    this.app.screen = screen;
  }

  setGameState(state: GameStateResponse): void {
    this.gameState = state;
    this.app.gameState = state;
    this.app.coins = state.coins;
  }

  setStartFishingHandler(handler: (locationId: string) => void): void {
    this.startFishingHandler = handler;
  }

  setNavigationHandler(handler: (screen: ScreenId) => void): void {
    this.navigationHandler = handler;
  }

  setPurchaseHandler(handler: (itemId: string, quantity?: number) => void): void {
    this.purchaseHandler = handler;
  }

  setSellCatchHandler(handler: (catchId: string) => void): void {
    this.sellCatchHandler = handler;
  }

  setSellAllHandler(handler: () => void): void {
    this.sellAllHandler = handler;
  }

  resetSellAllConfirmation(): void {
    this.sellAllConfirming = false;
    this.app.sellAllConfirming = false;
  }

  setSelectEquipmentHandler(handler: (request: EquipmentSelectionRequest) => void): void {
    this.selectEquipmentHandler = handler;
  }

  setRecoveryHandler(handler: () => void): void {
    this.recoveryHandler = handler;
  }

  setShareHandler(handler: () => void): void {
    this.shareHandler = handler;
  }

  openShop(category: ShopCategory = "bait"): void {
    this.shopCategory = category;
    this.app.shopCategory = category;
    this.navigationHandler?.("shop");
  }

  renderShop(): void {
    this.clearTransientView();
    this.activeScreen = "shop";
    this.app.screen = "shop";
    this.app.shopCategory = this.shopCategory;
    this.app.gameState = this.gameState;
  }

  renderLakes(): void {
    this.clearTransientView();
    this.activeScreen = "lakes";
    this.app.screen = "lakes";
    this.app.gameState = this.gameState;
  }

  showCollection(collection?: CollectionResponse): void {
    if (collection) {
      this.app.collection = collection;
      this.sellAllConfirming = false;
      this.app.sellAllConfirming = false;
    }
    this.clearTransientView();
    this.activeScreen = "collection";
    this.app.screen = "collection";
  }

  renderJournal(journal?: FishJournalResponse): void {
    if (journal) this.app.journal = journal;
    this.clearTransientView();
    this.activeScreen = "journal";
    this.app.screen = "journal";
  }

  showLeaderboard(leaderboard?: LeaderboardResponse): void {
    if (leaderboard) this.app.leaderboard = leaderboard;
    this.clearTransientView();
    this.activeScreen = "friends";
    this.app.screen = "friends";
  }

  showLoadingScreen(message: string): void {
    this.clearStatus();
    this.app.retryPanel = undefined;
    this.app.catchResult = undefined;
    this.app.decisionResult = undefined;
    this.app.loadingMessage = message;
  }

  showRetryPanel(eyebrow: string, message: string, retryLabel: string, onRetry: () => void, onBack?: () => void): void {
    this.clearStatus();
    this.app.loadingMessage = undefined;
    this.app.catchResult = undefined;
    this.app.decisionResult = undefined;
    const retryPanel: RetryPanelRequest = { eyebrow, message, retryLabel, onRetry, onBack };
    this.app.retryPanel = retryPanel;
  }

  showFishingResult(result: CompleteFishingResponse, onDecision: (decision: "keep" | "sell") => void, onBack: () => void): void {
    this.clearStatus();
    this.catchDecisionHandler = onDecision;
    this.catchBackHandler = onBack;
    const view: CatchResultView = { result, onDecision, onBack };
    this.app.loadingMessage = undefined;
    this.app.retryPanel = undefined;
    this.app.decisionResult = undefined;
    this.app.catchResult = view;
  }

  showDecisionResult(result: CatchDecisionResponse, onBack: () => void): void {
    this.clearStatus();
    this.catchBackHandler = onBack;
    const view: DecisionResultView = { result, onBack };
    this.app.loadingMessage = undefined;
    this.app.retryPanel = undefined;
    this.app.catchResult = undefined;
    this.app.decisionResult = view;
  }

  private clearTransientView(): void {
    this.app.loadingMessage = undefined;
    this.app.retryPanel = undefined;
    this.app.catchResult = undefined;
    this.app.decisionResult = undefined;
  }
}
