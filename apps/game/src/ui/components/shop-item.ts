import type { BaitDefinition, BoatDefinition, GameStateResponse, LureDefinition, RodDefinition } from "@fishing/shared/contracts";
import { LitElement, html, css, nothing } from "lit";
import { icon, type IconName } from "../icons";
import { emitUiEvent } from "../types";
import { formatCoins, speciesNamesForIds, locationNamesForBoat } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

type ShopItem = BoatDefinition | RodDefinition | LureDefinition | BaitDefinition;
type ShopKind = "boats" | "rods" | "lures" | "bait";

const ICONS: Record<ShopKind, IconName> = { boats: "anchor", rods: "rod", lures: "lure", bait: "bait" };

export class ShopItemElement extends LitElement {
  static properties = {
    state: { attribute: false },
    item: { attribute: false },
    category: { type: String },
    quantity: { type: Number },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .shop-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: start;
        gap: 11px;
        padding: 13px;
        border: 1px solid rgba(214, 184, 106, 0.19);
        border-radius: 9px;
        background: linear-gradient(145deg, rgba(19, 22, 17, 0.96), rgba(9, 10, 8, 0.98));
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
        transition: transform 0.25s var(--ease-spring), border-color 0.25s ease, box-shadow 0.25s ease;
      }

      .shop-item.is-owned {
        border-color: rgba(151, 201, 227, 0.24);
        filter: saturate(0.78);
      }

      .shop-item.is-equipped {
        border-color: rgba(214, 184, 106, 0.5);
        box-shadow: 0 0 0 1px rgba(214, 184, 106, 0.15), 0 16px 34px rgba(0, 0, 0, 0.32);
      }

      .shop-icon {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border: 1px solid currentColor;
        border-radius: 50%;
      }

      .shop-icon .icon {
        width: 21px;
        height: 21px;
      }

      .tone-boats .shop-icon { color: #b6c5ff; background: linear-gradient(145deg, rgba(142, 166, 255, 0.2), rgba(142, 166, 255, 0.06)); }
      .tone-rods .shop-icon { color: #7df0dd; background: linear-gradient(145deg, rgba(94, 234, 212, 0.2), rgba(56, 205, 236, 0.07)); }
      .tone-lures .shop-icon { color: #ffa79a; background: linear-gradient(145deg, rgba(255, 143, 125, 0.2), rgba(255, 143, 125, 0.06)); }
      .tone-bait .shop-icon { color: #ffd685; background: linear-gradient(145deg, rgba(255, 209, 102, 0.2), rgba(255, 209, 102, 0.06)); }

      .shop-body {
        display: grid;
        gap: 7px;
        min-width: 0;
      }

      .shop-heading {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        min-width: 0;
      }

      .shop-heading h2 {
        min-width: 0;
        font-size: 0.92rem;
        line-height: 1.2;
      }

      .shop-state {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
        padding: 2px 0 2px 7px;
        border-left: 1px solid currentColor;
        color: var(--ink-dim);
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .shop-state .icon {
        width: 11px;
        height: 11px;
        stroke-width: 2.5;
      }

      .shop-state.is-equipped { color: #e4cc8c; }
      .shop-state.is-owned { color: var(--ink-dim); }

      .shop-description {
        display: -webkit-box;
        margin: 0;
        overflow: hidden;
        color: var(--ink-dim);
        font-size: 0.72rem;
        line-height: 1.42;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }

      .shop-details {
        display: grid;
        gap: 8px;
        min-width: 0;
      }

      .shop-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
      }

      .shop-stat-cell {
        display: grid;
        gap: 1px;
        min-width: 0;
        padding: 6px 7px;
        border: 1px solid rgba(214, 184, 106, 0.12);
        border-radius: 4px;
        background: rgba(214, 184, 106, 0.055);
      }

      .shop-stat-cell strong {
        overflow-wrap: anywhere;
        color: #dcc47f;
        font-family: var(--font-display);
        font-size: 0.68rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
      }

      .shop-stat-cell span {
        overflow-wrap: anywhere;
        color: var(--ink-dim);
        font-size: 0.57rem;
        line-height: 1.2;
      }

      .shop-species {
        display: grid;
        gap: 5px;
        min-width: 0;
      }

      .shop-detail-label {
        color: var(--gold);
        font-size: 0.59rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .fish-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 7px 11px;
      }

      .fish-chip {
        position: relative;
        padding: 0;
        color: #d8d0c2;
        font-size: 0.63rem;
        font-weight: 550;
        line-height: 1.35;
      }

      .fish-chip + .fish-chip::before {
        content: "·";
        position: absolute;
        left: -7px;
        color: rgba(214, 184, 106, 0.55);
      }

      .shop-side {
        display: grid;
        gap: 4px;
        min-width: 78px;
        align-content: start;
        justify-items: end;
      }

      .buy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-width: 86px;
        min-height: 38px;
        padding: 8px 10px;
        border: 1px solid rgba(214, 184, 106, 0.54);
        border-radius: 6px;
        color: #15120a;
        background: linear-gradient(180deg, #e1c97f, #ad8d3e);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.3), 0 7px 16px rgba(0, 0, 0, 0.28);
        font-size: 0.8rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
      }

      .buy-label,
      .buy-price {
        white-space: nowrap;
      }

      .buy-price {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .buy-price small {
        font-size: 0.66rem;
      }

      .buy-price .icon {
        width: 13px;
        height: 13px;
        stroke-width: 2.2;
      }

      .buy-btn:disabled {
        border-color: var(--line);
        color: var(--ink-faint);
        background: rgba(151, 201, 227, 0.08);
        box-shadow: none;
        cursor: not-allowed;
      }

      .short-note {
        color: #ffa79a;
        font-size: 0.62rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .qty-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 5px;
      }

      .qty-chip {
        min-height: 27px;
        padding: 3px 9px;
        border: 1px solid rgba(214, 184, 106, 0.18);
        border-radius: 3px;
        color: var(--ink-dim);
        background: rgba(214, 184, 106, 0.035);
        font-size: 0.68rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
      }

      .qty-chip.is-active {
        border-color: var(--gold);
        color: #171209;
        background: var(--gold);
      }

      @media (min-width: 720px) {
        .shop-stats {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 380px) {
        .shop-item {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .shop-side {
          grid-column: 2;
          justify-items: stretch;
        }

        .buy-btn {
          width: 100%;
        }
      }

      @media (forced-colors: active) {
        .shop-item,
        .shop-stat-cell,
        .buy-btn,
        .qty-chip {
          forced-color-adjust: none;
          border-color: ButtonText;
          color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare item?: ShopItem;
  declare category: ShopKind;
  declare quantity: number;
  declare actionPending: boolean;

  constructor() {
    super();
    this.category = "bait";
    this.quantity = 1;
    this.actionPending = false;
  }

  private statGrid(entries: Array<[string, string]>) {
    return html`<div class="shop-stats">${entries.map(([label, value]) => html`<div class="shop-stat-cell"><strong>${value}</strong><span class="muted">${label}</span></div>`)}</div>`;
  }

  private speciesList(label: string, names: string[]) {
    return html`<div class="shop-species"><span class="shop-detail-label">${label}</span><div class="fish-chips">${names.map((name) => html`<span class="fish-chip">${name}</span>`)}</div></div>`;
  }

  private owned(): { owned: boolean; equipped: boolean; quantity: number } {
    const state = this.state;
    const item = this.item;
    if (!state || !item) return { owned: false, equipped: false, quantity: 0 };
    const key = this.category === "boats" ? "boats" : this.category === "bait" ? "baits" : this.category;
    const inventory = state.inventory[key];
    const ownership = inventory.find((entry) => entry.id === item.id);
    const equipmentKey = this.category === "boats" ? "boatId" : this.category === "rods" ? "rodId" : this.category === "lures" ? "lureId" : "baitId";
    return { owned: Boolean(ownership && ownership.quantity > 0), equipped: Boolean(ownership && ownership.quantity > 0 && state.activeEquipment[equipmentKey] === item.id), quantity: ownership?.quantity ?? 0 };
  }

  private buy(): void {
    const item = this.item;
    if (!item || this.actionPending) return;
    emitUiEvent(this, "ui:purchase", { itemId: item.id, quantity: this.category === "bait" ? this.quantity : undefined });
  }

  private renderBuyControls(price: number, name: string, kind: string) {
    const state = this.state;
    if (!state || !this.item) return nothing;
    const totalCost = this.category === "bait" ? price * this.quantity : price;
    const actionLabel = totalCost === 0 ? `Claim ${kind}` : `Buy ${kind}`;
    const disabled = this.actionPending || state.coins < totalCost;
    return html`<button class="buy-btn" type="button" ?disabled=${disabled} aria-disabled=${String(disabled)} aria-label=${totalCost === 0 ? `${actionLabel} ${name}` : `${actionLabel} ${name} for ${formatCoins(totalCost)} coins`} @click=${this.buy}>
      <span class="buy-label">${actionLabel}</span><span class="buy-price">${this.category === "bait" && this.quantity > 1 ? html`<small>×${this.quantity}</small>` : nothing}${totalCost === 0 ? html`<small>Free</small>` : html`${icon("coin")}${formatCoins(totalCost)}`}</span>
    </button>${state.coins < totalCost ? html`<span class="short-note">Need ${formatCoins(totalCost - state.coins)} more</span>` : nothing}`;
  }

  render() {
    const state = this.state;
    const item = this.item;
    if (!state || !item) return html``;
    const ownership = this.owned();
    const status = ownership.equipped ? "equipped" : ownership.owned ? "owned" : undefined;
    const name = item.name;
    let details;
    if (this.category === "boats") {
      const boat = item as BoatDefinition;
      const unlocks = locationNamesForBoat(state, boat.unlocksLocationIds);
      details = html`${this.statGrid([["Tier", `${boat.tier}`], ["Price", boat.priceCoins === 0 ? "Free" : `${formatCoins(boat.priceCoins)} coins`], ["Spots", `${unlocks.length}`]])}${this.speciesList("Unlocks these waters", unlocks)}`;
    } else if (this.category === "rods") {
      const rod = item as RodDefinition;
      details = this.statGrid([["Max fish", `${rod.maxFishWeightKg.toFixed(1)} kg`], ["Strength", `${rod.strength}/3`], ["Control", `×${rod.control.toFixed(2)}`], ["Break resist.", `${Math.round(rod.breakResistance * 100)}%`], ["Catch zone", `+${Math.round(rod.catchZoneBonus * 100)}%`]]);
    } else if (this.category === "lures") {
      const lure = item as LureDefinition;
      details = html`${this.statGrid([["Uses", `${lure.maximumDurability}`], ["Catch zone", `+${Math.round(lure.catchZoneBonus * 100)}%`], ["Difficulty", `+${Math.round(lure.difficultyModifier * 100)}%`], ["Owned", `${ownership.quantity}`]])}${this.speciesList("Best for", speciesNamesForIds(state, lure.preferredFishIds))}`;
    } else {
      const bait = item as BaitDefinition;
      details = html`${this.statGrid([["Attraction", `×${bait.attraction.toFixed(2)}`], ["Price", `${formatCoins(bait.priceCoins)} / portion`], ["Owned", `${ownership.quantity}`]])}${this.speciesList("Attracts", speciesNamesForIds(state, bait.fishIds))}`;
    }
    return html`
      <article class="shop-item tone-${this.category} ${status ? `is-${status}` : ""}">
        <span class="shop-icon">${icon(ICONS[this.category])}</span>
        <div class="shop-body">
          <div class="shop-heading"><h2>${name}</h2>${status ? html`<span class="shop-state is-${status}">${icon("check")}${status === "equipped" ? "Equipped" : "Owned"}</span>` : nothing}</div>
          <p class="shop-description">${item.description}</p>
          <div class="shop-details">${details}</div>
          ${this.category === "bait"
            ? html`<div class="qty-chips" role="group" aria-label=${`Amount of ${name} to buy`}>
                ${[1, 5, 10, 25].map((choice) => html`<button class="qty-chip ${choice === this.quantity ? "is-active" : ""}" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} aria-pressed=${String(choice === this.quantity)} @click=${() => emitUiEvent(this, "ui:bait-quantity", { baitId: item.id, quantity: choice })}>×${choice}</button>`)}
              </div>`
            : nothing}
        </div>
        <div class="shop-side">${!ownership.owned || this.category === "lures" || this.category === "bait" ? this.renderBuyControls(item.priceCoins, name, this.category === "boats" ? "boat" : this.category === "rods" ? "rod" : this.category === "lures" ? "lure" : "bait") : nothing}</div>
      </article>
    `;
  }
}

customElements.define("shop-item", ShopItemElement);
