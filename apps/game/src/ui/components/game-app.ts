import type { CollectionResponse, FishJournalResponse, GameStateResponse, LeaderboardResponse } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import type { ScreenId, RetryPanelRequest, ShopCategory, ToastState, CatchResultView, DecisionResultView } from "../types";
import { uiFoundationStyles } from "../component-styles";
import "./game-topbar";
import "./game-tabbar";
import "./status-toast";
import "./game-hero";
import "./gear-dock";
import "./gear-selector";
import "./location-card";
import "./location-carousel";
import "./cast-bar";
import "./lakes-screen";
import "./shop-item";
import "./shop-screen";
import "./collection-screen";
import "./journal-screen";
import "./friends-screen";
import "./catch-decision";
import "./catch-result";

export interface StatusSnapshot {
  message: string;
  state: ToastState;
}

export class GameAppElement extends LitElement {
  static properties = {
    screen: { type: String },
    gameState: { attribute: false },
    collection: { attribute: false },
    journal: { attribute: false },
    leaderboard: { attribute: false },
    shopCategory: { type: String },
    collectionSort: { type: String },
    journalFilter: { type: String },
    sellAllConfirming: { type: Boolean },
    navEnabled: { type: Boolean },
    pendingNavigation: { type: String },
    actionPending: { type: Boolean },
    coins: { type: Number },
    status: { attribute: false },
    loadingMessage: { type: String },
    retryPanel: { attribute: false },
    catchResult: { attribute: false },
    decisionResult: { attribute: false },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 1;
        display: block;
        pointer-events: none;
      }

      .app-frame {
        position: fixed;
        inset: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        padding: var(--app-safe-top) var(--app-safe-right) 0 var(--app-safe-left);
        pointer-events: none;
        transition: opacity 0.28s ease, visibility 0.28s ease;
      }

      .app-frame[data-toast-visible="true"] {
        --toast-reserve-h: 64px;
      }

      .app-frame::before {
        content: "";
        position: absolute;
        top: calc(-1 * var(--app-safe-top));
        right: calc(-1 * var(--app-safe-right));
        left: calc(-1 * var(--app-safe-left));
        height: calc(var(--app-safe-top) + var(--topbar-h));
        background: linear-gradient(180deg, rgba(7, 8, 6, 0.99), rgba(7, 8, 6, 0.8) 76%, transparent);
        pointer-events: none;
      }

      game-topbar,
      game-tabbar,
      status-toast {
        pointer-events: auto;
      }

      .app-content {
        position: relative;
        z-index: 1;
        display: grid;
        align-content: start;
        gap: 14px;
        min-height: 0;
        padding: calc(4px + var(--toast-reserve-h)) 12px calc(var(--tabbar-total-height) + var(--cta-gap) + var(--cast-bar-h) + var(--content-cast-gap)) 12px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scroll-padding-top: calc(4px + var(--toast-reserve-h));
        scroll-padding-bottom: calc(var(--tabbar-total-height) + var(--cta-gap) + var(--cast-bar-h) + var(--content-cast-gap));
        scrollbar-gutter: stable;
        pointer-events: auto;
        -webkit-overflow-scrolling: touch;
      }

      .app-content[data-view="catch"] {
        padding-bottom: calc(var(--tabbar-total-height) + 148px);
        scroll-padding-bottom: calc(var(--tabbar-total-height) + 148px);
      }

      .fishing-status {
        display: grid;
        gap: 9px;
        align-content: start;
        min-height: 120px;
        padding: 17px;
        border: 1px solid rgba(214, 184, 106, 0.24);
        border-radius: 10px;
        background: linear-gradient(145deg, rgba(24, 31, 24, 0.97), rgba(11, 13, 10, 0.97));
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 18px 38px rgba(0, 0, 0, 0.34);
        animation: screen-pop 0.28s ease-out both;
      }

      .fishing-status.is-loading {
        justify-items: start;
      }

      .fishing-status.is-loading::after {
        content: "";
        width: 26px;
        aspect-ratio: 1;
        margin-top: 10px;
        border: 3px solid rgba(214, 184, 106, 0.22);
        border-top-color: var(--gold);
        border-radius: 50%;
        animation: spin 0.85s linear infinite;
      }

      .retry-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .retry-actions:not(:has(.secondary-action)) {
        grid-template-columns: 1fr;
      }

      @keyframes screen-pop {
        from { opacity: 0; transform: translateY(7px); }
        to { opacity: 1; transform: none; }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (max-height: 640px) {
        .app-frame[data-toast-visible="true"] {
          --toast-reserve-h: 56px;
        }

        .app-content {
          padding-top: calc(4px + var(--toast-reserve-h));
        }
      }

      @media (orientation: landscape) and (max-height: 560px) {
        .app-frame {
          --topbar-h: 50px;
          --tabbar-h: 52px;
          --cast-bar-h: 54px;
          --cta-gap: 2px;
          --content-cast-gap: 6px;
        }

        .app-frame[data-toast-visible="true"] {
          --toast-reserve-h: 48px;
        }

        .app-content {
          padding-right: 10px;
          padding-left: 10px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .fishing-status,
        .fishing-status.is-loading::after {
          animation: none !important;
        }
      }

      @media (forced-colors: active) {
        .fishing-status {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare screen: ScreenId;
  declare gameState?: GameStateResponse;
  declare collection?: CollectionResponse;
  declare journal?: FishJournalResponse;
  declare leaderboard?: LeaderboardResponse;
  declare shopCategory: ShopCategory;
  declare collectionSort: string;
  declare journalFilter: string;
  declare sellAllConfirming: boolean;
  declare navEnabled: boolean;
  declare pendingNavigation?: ScreenId;
  declare actionPending: boolean;
  declare coins: number;
  declare status?: StatusSnapshot;
  declare loadingMessage?: string;
  declare retryPanel?: RetryPanelRequest;
  declare catchResult?: CatchResultView;
  declare decisionResult?: DecisionResultView;

  constructor() {
    super();
    this.screen = "lakes";
    this.shopCategory = "bait";
    this.collectionSort = "newest";
    this.journalFilter = "all";
    this.sellAllConfirming = false;
    this.navEnabled = true;
    this.actionPending = false;
    this.coins = 0;
  }

  dismissStatus(): void {
    this.status = undefined;
    this.requestUpdate();
  }

  render() {
    const hasToast = Boolean(this.status?.message);
    const view = this.catchResult || this.decisionResult ? "catch" : "screen";
    return html`
      <div class="app-frame" data-testid="app-frame" data-toast-visible=${String(hasToast)} data-view=${view}>
        <game-topbar .coins=${this.coins} ?disabled=${!this.navEnabled}></game-topbar>
        <main class="app-content" data-testid="app-content" aria-busy=${String(this.actionPending)} data-pending=${String(this.actionPending)} data-view=${view}>
          ${this.renderContent()}
        </main>
        <game-tabbar .activeScreen=${this.screen} ?navEnabled=${this.navEnabled} .pendingNavigation=${this.pendingNavigation}></game-tabbar>
        <status-toast .message=${this.status?.message} .state=${this.status?.state ?? "loading"} ?hidden=${!hasToast}></status-toast>
      </div>
    `;
  }

  private renderContent() {
    if (this.loadingMessage) {
      return html`<section class="fishing-status is-loading" aria-live="polite"><span class="eyebrow">One moment</span><p class="muted">${this.loadingMessage}</p></section>`;
    }
    if (this.retryPanel) {
      const panel = this.retryPanel;
      return html`<section class="fishing-status" data-testid="retry-panel" aria-live="assertive"><span class="eyebrow">${panel.eyebrow}</span><p class="muted">${panel.message}</p><div class="retry-actions"><button class="primary-action" type="button" ?disabled=${this.actionPending} @click=${panel.onRetry}>${panel.retryLabel}</button>${panel.onBack ? html`<button class="secondary-action" type="button" ?disabled=${this.actionPending} @click=${panel.onBack}>Back to lakes</button>` : nothing}</div></section>`;
    }
    if (this.catchResult) {
      return html`<catch-result .result=${this.catchResult.result} .gameState=${this.gameState} ?actionPending=${this.actionPending}></catch-result>`;
    }
    if (this.decisionResult) {
      return html`<catch-result .decisionResult=${this.decisionResult.result}></catch-result>`;
    }
    if (this.screen === "lakes") return html`<lakes-screen .state=${this.gameState} ?actionPending=${this.actionPending}></lakes-screen>`;
    if (this.screen === "shop") return html`<shop-screen .state=${this.gameState} category=${this.shopCategory} ?actionPending=${this.actionPending}></shop-screen>`;
    if (this.screen === "collection") return html`<collection-screen .collection=${this.collection} sortMode=${this.collectionSort} ?sellAllConfirming=${this.sellAllConfirming} ?actionPending=${this.actionPending}></collection-screen>`;
    if (this.screen === "journal") return html`<journal-screen .journal=${this.journal} .state=${this.gameState} filterMode=${this.journalFilter} ?actionPending=${this.actionPending}></journal-screen>`;
    return html`<friends-screen .leaderboard=${this.leaderboard} ?actionPending=${this.actionPending}></friends-screen>`;
  }
}

customElements.define("game-app", GameAppElement);
