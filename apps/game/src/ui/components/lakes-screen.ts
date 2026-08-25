import type { GameStateResponse } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";
import { formatCoins } from "../presenters";

export class LakesScreenElement extends LitElement {
  static properties = {
    state: { attribute: false },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    screenSurfaceStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .screen {
        display: grid;
        gap: 9px;
      }

      .recovery-banner {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        border: 1px solid rgba(255, 143, 125, 0.32);
        border-left: 3px solid rgba(255, 143, 125, 0.7);
        border-radius: var(--radius-md);
        background: rgba(84, 39, 36, 0.28);
      }

      .recovery-banner p {
        margin-top: 4px;
        color: var(--ink-dim);
        font-size: 0.8rem;
        line-height: 1.5;
      }

      .recovery-banner strong {
        color: #ffa79a;
      }

      .recovery-banner button {
        width: 100%;
      }

      @media (min-width: 720px) {
        .recovery-banner {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }

        .recovery-banner button {
          width: auto;
          white-space: nowrap;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare actionPending: boolean;
  private selectedLocationId?: string;

  constructor() {
    super();
    this.actionPending = false;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("state") || !this.state) return;
    if (!this.selectedLocationId || !this.state.locations.some((location) => location.id === this.selectedLocationId)) {
      this.selectedLocationId = (this.state.locations.find((location) => location.unlocked) ?? this.state.locations[0])?.id;
    }
  }

  private handleLocationSelected(event: CustomEvent<{ locationId: string }>): void {
    event.stopPropagation();
    this.selectedLocationId = event.detail.locationId;
    this.requestUpdate();
  }

  render() {
    const state = this.state;
    if (!state) return html``;
    const selected = state.locations.find((location) => location.id === this.selectedLocationId) ?? state.locations.find((location) => location.unlocked) ?? state.locations[0];
    if (!selected) return html``;
    const totalUsableBait = state.inventory.baits.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
    const hasUsableLure = state.inventory.lures.some((item) => item.quantity > 0 && (item.durability ?? 0) >= 1);
    const wormPrice = state.catalog.baits.find((bait) => bait.id === "worm")?.priceCoins ?? 8;
    const stuck = state.coins < wormPrice && (totalUsableBait === 0 || !hasUsableLure);
    return html`
      <div class="screen" data-testid="lakes-screen">
        <game-hero eyebrow="Choose your water" title=${selected.name} value=${`${formatCoins(selected.expectedValueMinCoins)}–${formatCoins(selected.expectedValueMaxCoins)}`} valueLabel=${`Typical catch value: ${formatCoins(selected.expectedValueMinCoins)}–${formatCoins(selected.expectedValueMaxCoins)} coins`}></game-hero>
        <gear-dock .state=${state} ?actionPending=${this.actionPending}></gear-dock>
        <location-carousel .state=${state} selectedLocationId=${this.selectedLocationId ?? selected.id} @ui:location-selected=${this.handleLocationSelected}></location-carousel>
        ${stuck
          ? html`<aside class="recovery-banner">
              <div><strong>Out of tackle?</strong><p>You can dig the shallows for worms and untangle your old spinner to keep fishing.</p></div>
              <button class="secondary-action" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} @click=${() => this.dispatchEvent(new CustomEvent("ui:recovery", { bubbles: true, composed: true }))}>Dig for worms</button>
            </aside>`
          : nothing}
      </div>
      <cast-bar .state=${state} .location=${selected} ?actionPending=${this.actionPending}></cast-bar>
    `;
  }
}

customElements.define("lakes-screen", LakesScreenElement);
