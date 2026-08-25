import type { BaitDefinition, BoatDefinition, GameStateResponse, LureDefinition, RodDefinition } from "@fishing/shared";
import { LitElement, html, css } from "lit";
import { icon, type IconName } from "../icons";
import { emitUiEvent, type ShopCategory } from "../types";
import { formatCoins } from "../presenters";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";

export class ShopScreenElement extends LitElement {
  static properties = {
    state: { attribute: false },
    category: { type: String },
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

      .shop-tabs {
        position: sticky;
        top: 0;
        z-index: 12;
        display: flex;
        gap: 6px;
        padding: 4px;
        border: 1px solid rgba(214, 184, 106, 0.2);
        border-radius: 8px;
        background: rgba(8, 9, 7, 0.96);
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.3);
        -webkit-backdrop-filter: blur(18px) saturate(150%);
        backdrop-filter: blur(18px) saturate(150%);
      }

      .shop-tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 0;
        gap: 6px;
        min-height: 40px;
        padding: 8px 6px;
        border: 0;
        border-radius: 5px;
        color: var(--ink-faint);
        background: none;
        font-size: 0.74rem;
        font-weight: 550;
        cursor: pointer;
      }

      .shop-tab .icon {
        width: 16px;
        height: 16px;
      }

      .shop-tab.is-active {
        color: #f2e8d7;
        background: linear-gradient(180deg, #8f2a40, #651829);
        box-shadow: inset 0 0 0 1px rgba(214, 184, 106, 0.3);
      }

      .shop-list {
        display: grid;
        gap: 9px;
      }

      @media (max-width: 350px) {
        .shop-tab {
          gap: 3px;
          padding-inline: 3px;
          font-size: 0.66rem;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare category: ShopCategory;
  declare actionPending: boolean;
  private quantities = new Map<string, number>();

  constructor() {
    super();
    this.category = "bait";
    this.actionPending = false;
  }

  private selectCategory(category: ShopCategory): void {
    if (category === this.category) return;
    emitUiEvent(this, "ui:shop-category", { category });
  }

  private handleQuantity(event: CustomEvent<{ baitId: string; quantity: number }>): void {
    event.stopPropagation();
    this.quantities.set(event.detail.baitId, event.detail.quantity);
    this.requestUpdate();
  }

  render() {
    const state = this.state;
    if (!state) return html``;
    const categories: Array<{ id: ShopCategory; label: string; icon: IconName }> = [
      { id: "bait", label: "Bait", icon: "bait" },
      { id: "lures", label: "Lures", icon: "lure" },
      { id: "rods", label: "Rods", icon: "rod" },
      { id: "boats", label: "Boats", icon: "anchor" },
    ];
    const items: Array<BaitDefinition | LureDefinition | RodDefinition | BoatDefinition> = this.category === "bait"
      ? state.catalog.baits
      : this.category === "lures"
        ? state.catalog.lures
        : this.category === "rods"
          ? state.catalog.rods
          : state.catalog.boats;
    return html`
      <section class="screen shop-screen" data-testid="shop-screen">
        <game-hero eyebrow="Club outfitter" title="The Tackle Room" value=${formatCoins(state.coins)} valueLabel=${`Coins available: ${formatCoins(state.coins)}`}></game-hero>
        <div class="shop-tabs" role="tablist" aria-label="Shop categories">
          ${categories.map((category) => html`<button class="shop-tab ${this.category === category.id ? "is-active" : ""}" type="button" role="tab" aria-selected=${String(this.category === category.id)} @click=${() => this.selectCategory(category.id)}>${icon(category.icon)}<span>${category.label}</span></button>`)}
        </div>
        <div class="shop-list" role="tabpanel">
          ${items.map((item) => html`<shop-item .state=${state} .item=${item} category=${this.category} quantity=${this.quantities.get(item.id) ?? 1} ?actionPending=${this.actionPending} @ui:bait-quantity=${this.handleQuantity}></shop-item>`)}
        </div>
      </section>
    `;
  }
}

customElements.define("shop-screen", ShopScreenElement);
