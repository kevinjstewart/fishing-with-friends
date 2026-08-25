import type { BaitDefinition, GameStateResponse, LureDefinition, RodDefinition } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { icon, type IconName } from "../icons";
import { emitUiEvent } from "../types";
import { uiFoundationStyles } from "../component-styles";

type SelectorType = "rod" | "lure" | "bait";
type SelectorDefinition = RodDefinition | LureDefinition | BaitDefinition;

function definitionsFor(state: GameStateResponse, type: SelectorType): SelectorDefinition[] {
  if (type === "rod") return state.catalog.rods;
  if (type === "lure") return state.catalog.lures;
  return state.catalog.baits;
}

function inventoryFor(state: GameStateResponse, type: SelectorType) {
  if (type === "rod") return state.inventory.rods;
  if (type === "lure") return state.inventory.lures;
  return state.inventory.baits;
}

export class GearSelectorElement extends LitElement {
  static properties = {
    state: { attribute: false },
    equipmentType: { type: String },
    tone: { type: String },
    iconName: { type: String },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .gear-slot {
        position: relative;
        min-width: 0;
      }

      .gear-tile {
        display: grid;
        justify-items: center;
        align-content: start;
        gap: 5px;
        width: 100%;
        min-height: 82px;
        padding: 9px 4px 7px;
        border: 0;
        border-radius: 6px;
        color: inherit;
        background: transparent;
        text-align: center;
      }

      button.gear-tile {
        cursor: pointer;
      }

      button.gear-tile:active {
        transform: scale(0.96);
      }

      .gear-icon {
        position: relative;
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 1px solid currentColor;
        border-radius: 50%;
      }

      .gear-icon .icon {
        width: 19px;
        height: 19px;
      }

      .tone-rod .gear-icon { color: #7df0dd; background: linear-gradient(145deg, rgba(94, 234, 212, 0.2), rgba(56, 205, 236, 0.07)); }
      .tone-lure .gear-icon { color: #ffa79a; background: linear-gradient(145deg, rgba(255, 143, 125, 0.2), rgba(255, 143, 125, 0.06)); }
      .tone-bait .gear-icon { color: #ffd685; background: linear-gradient(145deg, rgba(255, 209, 102, 0.2), rgba(255, 209, 102, 0.06)); }

      .gear-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        display: grid;
        place-items: center;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border: 1px solid rgba(214, 184, 106, 0.5);
        border-radius: 2px;
        color: #ead28d;
        background: #17130b;
        font-size: 0.58rem;
        font-weight: 800;
      }

      .gear-text {
        display: grid;
        gap: 3px;
        justify-items: center;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }

      .gear-name {
        display: block;
        max-width: 100%;
        min-height: 2.2em;
        overflow-wrap: anywhere;
        color: #e8e0d2;
        font-size: 0.59rem;
        font-weight: 550;
        line-height: 1.14;
        text-wrap: balance;
      }

      .gear-meta {
        color: var(--ink-faint);
        font-size: 0.57rem;
        font-weight: 550;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }

      .gear-bar {
        width: 34px;
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(151, 201, 227, 0.16);
      }

      .gear-bar-fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #67f0d4, #31c7e8);
        box-shadow: 0 0 6px rgba(94, 234, 212, 0.55);
      }

      .gear-tile.is-alert .gear-icon {
        color: #ffa79a;
        background: rgba(185, 66, 62, 0.2);
        animation: gear-alert 1.7s ease-in-out infinite;
      }

      .gear-tile.is-alert .gear-meta,
      .gear-tile.is-alert .gear-name {
        color: #ffc2ba;
      }

      @keyframes gear-alert {
        50% { box-shadow: 0 0 16px rgba(255, 143, 125, 0.55); }
      }

      .equipment-options {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 40;
        display: grid;
        gap: 6px;
        width: max-content;
        min-width: 230px;
        max-width: min(280px, calc(100vw - 24px));
        max-height: 240px;
        padding: 10px;
        overflow-y: auto;
        border: 1px solid rgba(214, 184, 106, 0.34);
        border-radius: 6px;
        background: rgba(8, 10, 7, 0.96);
        box-shadow: 0 22px 54px rgba(0, 0, 0, 0.55);
        animation: pop-in 0.18s var(--ease-spring);
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
      }

      .equipment-options[hidden] {
        display: none;
      }

      @keyframes pop-in {
        from { opacity: 0; transform: translateY(-6px) scale(0.97); }
        to { opacity: 1; transform: none; }
      }

      .equipment-option {
        display: grid;
        gap: 2px;
        min-width: 0;
        min-height: 42px;
        padding: 9px 11px;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-radius: 6px;
        color: var(--ink);
        background: rgba(17, 25, 17, 0.74);
        font-size: 0.78rem;
        line-height: 1.25;
        text-align: left;
        overflow-wrap: anywhere;
        cursor: pointer;
      }

      .equipment-option-name {
        color: var(--ink);
        font-weight: 700;
      }

      .equipment-option-detail {
        color: var(--ink-dim);
        font-size: 0.68rem;
      }

      .equipment-option.is-active {
        border-color: rgba(214, 184, 106, 0.48);
        color: #e4cc8c;
        background: rgba(214, 184, 106, 0.09);
        font-weight: 700;
      }

      @media (orientation: landscape) and (max-height: 560px) {
        .gear-tile {
          min-height: 64px;
          gap: 4px;
          padding: 6px 4px 5px;
        }

        .gear-icon {
          width: 32px;
          height: 32px;
        }

        .gear-icon .icon {
          width: 17px;
          height: 17px;
        }

        .gear-name {
          font-size: 0.62rem;
        }
      }

      @media (forced-colors: active) {
        .equipment-options,
        .equipment-option {
          forced-color-adjust: none;
          border-color: ButtonText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }

        .equipment-option.is-active {
          border-color: Highlight;
          background: Canvas;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare equipmentType: SelectorType;
  declare tone: string;
  declare iconName: IconName;
  declare actionPending: boolean;
  private open = false;

  constructor() {
    super();
    this.equipmentType = "rod";
    this.tone = "rod";
    this.iconName = "rod";
    this.actionPending = false;
  }

  private onDocumentPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.close();
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this.onDocumentPointerDown);
    document.addEventListener("keydown", this.onDocumentKeyDown);
  }

  disconnectedCallback(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown);
    document.removeEventListener("keydown", this.onDocumentKeyDown);
    super.disconnectedCallback();
  }

  private onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.open) return;
    event.preventDefault();
    this.close(true);
  };

  private close(restoreFocus = false): void {
    if (!this.open) return;
    this.open = false;
    this.requestUpdate();
    if (restoreFocus) void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(".gear-tile")?.focus());
  }

  private toggle(): void {
    if (this.actionPending) return;
    this.open = !this.open;
    this.requestUpdate();
    if (this.open) {
      void this.updateComplete.then(() => {
        const options = this.renderRoot.querySelector<HTMLElement>(".equipment-options");
        const tile = this.renderRoot.querySelector<HTMLElement>(".gear-tile");
        if (!options || !tile) return;
        const margin = 8;
        const viewportWidth = document.documentElement.clientWidth;
        const bounds = options.getBoundingClientRect();
        if (bounds.right <= viewportWidth - margin && bounds.left >= margin) return;
        const targetLeft = Math.min(Math.max(margin, bounds.left - Math.max(0, bounds.right - (viewportWidth - margin))), viewportWidth - margin - bounds.width);
        const slotLeft = this.getBoundingClientRect().left;
        options.style.left = `${Math.round(targetLeft - slotLeft)}px`;
      });
    }
  }

  private select(id: string): void {
    this.close();
    emitUiEvent(this, "ui:select-equipment", { [`${this.equipmentType}Id`]: id });
  }

  private detailFor(definition: SelectorDefinition, quantity: number, durability: number | null): string {
    if (this.equipmentType === "bait") return `${quantity} portions`;
    if (this.equipmentType === "lure") return `${durability ?? 0}/${(definition as LureDefinition).maximumDurability} uses`;
    return `up to ${(definition as RodDefinition).maxFishWeightKg} kg`;
  }

  render() {
    const state = this.state;
    if (!state) return html``;
    const definitions = definitionsFor(state, this.equipmentType);
    const inventory = inventoryFor(state, this.equipmentType);
    const activeId = state.activeEquipment[`${this.equipmentType}Id`];
    const current = definitions.find((definition) => definition.id === activeId);
    const currentOwnership = inventory.find((item) => item.id === activeId);
    const ownedDefinitions = definitions.filter((definition) => inventory.some((item) => item.id === definition.id && item.quantity > 0));
    const interactive = ownedDefinitions.length > 1;
    const name = current?.name ?? "None";
    const alert = !currentOwnership || currentOwnership.quantity < 1 || (this.equipmentType === "lure" && (currentOwnership.durability ?? 0) < 1);
    const label = current
      ? `${this.equipmentType === "rod" ? "Rod" : this.equipmentType === "lure" ? "Lure" : "Bait"}: ${name}`
      : `No ${this.equipmentType} equipped`;
    const bar = this.equipmentType === "lure" && current && currentOwnership
      ? Math.max(0, (currentOwnership.durability ?? 0) / (current as LureDefinition).maximumDurability)
      : undefined;
    const meta = this.equipmentType === "rod" && current
      ? `≤${(current as RodDefinition).maxFishWeightKg}kg`
      : this.equipmentType === "bait"
        ? `×${currentOwnership?.quantity ?? 0}`
        : "—";
    const badge = currentOwnership && currentOwnership.quantity > 1 ? `+${currentOwnership.quantity - 1}` : undefined;
    return html`
      <div class="gear-slot">
        ${interactive
          ? html`<button
              class="gear-tile tone-${this.tone} ${alert ? "is-alert" : ""}"
              type="button"
              aria-label=${`${label}. Tap to switch`}
              aria-controls="equipment-options-${this.equipmentType}"
              aria-expanded=${String(this.open)}
              ?disabled=${this.actionPending}
              aria-disabled=${String(this.actionPending)}
              @click=${this.toggle}
            >${this.tileContent(name, meta, bar, badge)}</button>`
          : html`<div class="gear-tile tone-${this.tone} ${alert ? "is-alert" : ""}" role="img" aria-label=${label}>${this.tileContent(name, meta, bar, badge)}</div>`}
        ${interactive
          ? html`<div class="equipment-options" id="equipment-options-${this.equipmentType}" role="menu" ?hidden=${!this.open}>
              ${ownedDefinitions.map((definition) => {
                const ownership = inventory.find((item) => item.id === definition.id);
                const active = definition.id === activeId;
                return html`<button
                  class="equipment-option ${active ? "is-active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(active)}
                  ?disabled=${this.actionPending}
                  aria-disabled=${String(this.actionPending)}
                  @click=${() => this.select(definition.id)}
                ><span class="equipment-option-name">${definition.name}</span><span class="equipment-option-detail">${this.detailFor(definition, ownership?.quantity ?? 0, ownership?.durability ?? null)}</span></button>`;
              })}
            </div>`
          : nothing}
      </div>
    `;
  }

  private tileContent(name: string, meta: string, bar: number | undefined, badge: string | undefined) {
    return html`<span class="gear-icon">${icon(this.iconName)}${badge ? html`<span class="gear-badge">${badge}</span>` : nothing}</span><span class="gear-text"><span class="gear-name">${name}</span>${bar !== undefined ? html`<span class="gear-bar"><span class="gear-bar-fill" style=${`width:${Math.round(Math.min(1, Math.max(0, bar)) * 100)}%`}></span></span>` : html`<span class="gear-meta">${meta}</span>`}</span>`;
  }
}

customElements.define("gear-selector", GearSelectorElement);
