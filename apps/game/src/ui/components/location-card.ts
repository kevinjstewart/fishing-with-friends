import type { GameStateResponse, LocationAvailability } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { icon } from "../icons";
import { emitUiEvent, type ShopCategory } from "../types";
import { capitalize, formatCoins, speciesNamesForIds } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

export class LocationCardElement extends LitElement {
  static properties = {
    state: { attribute: false },
    location: { attribute: false },
    selected: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .location-card {
        position: relative;
        display: grid;
        gap: 12px;
        min-height: 156px;
        align-content: start;
        padding: 16px;
        overflow: hidden;
        isolation: isolate;
        border: 1px solid rgba(214, 184, 106, 0.22);
        border-radius: 10px;
        background:
          linear-gradient(135deg, rgba(214, 184, 106, 0.055) 0 1px, transparent 1px 64%, rgba(214, 184, 106, 0.04) 64% 65%, transparent 65%),
          linear-gradient(145deg, rgba(23, 42, 32, 0.98), rgba(8, 13, 10, 0.98));
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 18px 36px rgba(0, 0, 0, 0.38);
        scroll-snap-align: center;
        transition: transform 0.25s var(--ease-spring), border-color 0.25s ease, box-shadow 0.25s ease;
      }

      .location-card[data-location="cedar-marsh"],
      .location-card[data-location="granite-reservoir"] {
        background: linear-gradient(145deg, rgba(48, 43, 27, 0.98), rgba(13, 12, 8, 0.98));
      }

      .location-card[data-location="lake-greywater"],
      .location-card[data-location="northwind-channel"],
      .location-card[data-location="stormglass-basin"] {
        background: linear-gradient(145deg, rgba(29, 31, 36, 0.98), rgba(9, 9, 11, 0.98));
      }

      .location-card::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 1;
        width: 2px;
      }

      .location-card::after {
        content: "";
        position: absolute;
        right: 17px;
        bottom: 17px;
        z-index: -1;
        width: 38px;
        height: 38px;
        opacity: 0.4;
        border: 1px solid var(--gold);
        border-radius: 50%;
        box-shadow: inset 0 0 0 5px rgba(214, 184, 106, 0.06);
        pointer-events: none;
      }

      .location-card > * {
        position: relative;
        z-index: 2;
      }

      .location-card.risk-low::before { background: linear-gradient(180deg, #57e0a4, #2f8f68); }
      .location-card.risk-moderate::before { background: linear-gradient(180deg, #ffd166, #c98e2e); }
      .location-card.risk-high::before { background: linear-gradient(180deg, #ff8f7d, #b9342e); }

      .location-card[role] {
        cursor: pointer;
      }

      .location-card.is-selected {
        border-color: rgba(225, 199, 128, 0.78);
        box-shadow: inset 0 0 0 1px rgba(214, 184, 106, 0.18), 0 0 0 1px rgba(214, 184, 106, 0.18), 0 22px 42px rgba(0, 0, 0, 0.46);
        transform: translateY(-1px);
      }

      .location-card.is-selected h2 {
        color: #f3eadb;
      }

      .location-card.is-locked {
        opacity: 0.84;
        filter: saturate(0.72);
      }

      .location-top,
      .location-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .location-top h2 {
        min-width: 0;
        color: #f3eadb;
        font-family: var(--font-display);
        font-size: 1.18rem;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .risk-dots {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        gap: 4px;
        padding: 0;
        color: var(--ink-faint);
      }

      .risk-dots i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: rgba(151, 201, 227, 0.16);
      }

      .risk-dots i.on {
        background: currentColor;
        box-shadow: 0 0 8px currentColor;
      }

      .risk-dots.risk-low { color: #7ef0bd; }
      .risk-dots.risk-moderate { color: #ffd685; }
      .risk-dots.risk-high { color: #ffa79a; }

      .risk-dot-label {
        margin-left: 3px;
        color: currentColor;
        font-size: 0.53rem;
        font-weight: 550;
        letter-spacing: 0.05em;
        white-space: nowrap;
      }

      .location-risk-reason {
        color: #e5cb82;
        font-size: 0.68rem;
        line-height: 1.35;
      }

      .location-fish {
        display: grid;
        gap: 5px;
        margin-top: auto;
      }

      .fish-chips {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px 11px;
      }

      .fish-cue {
        display: grid;
        place-items: center;
        width: 25px;
        height: 25px;
        border: 1px solid rgba(214, 184, 106, 0.46);
        border-radius: 50%;
        color: var(--gold);
        background: rgba(8, 12, 8, 0.78);
      }

      .fish-cue .icon {
        width: 16px;
        height: 16px;
      }

      .fish-chip {
        position: relative;
        padding: 0;
        color: #d8d0c2;
        background: transparent;
        font-size: 0.64rem;
        font-weight: 550;
        line-height: 1.35;
      }

      .fish-chip + .fish-chip::before {
        content: "·";
        position: absolute;
        left: -7px;
        color: rgba(214, 184, 106, 0.55);
      }

      .fish-list-details {
        display: grid;
        gap: 6px;
      }

      .fish-list-details summary {
        width: fit-content;
        color: var(--gold);
        font-size: 0.64rem;
        font-weight: 650;
        cursor: pointer;
        list-style: none;
      }

      .fish-list-details summary::-webkit-details-marker {
        display: none;
      }

      .fish-list-details summary::after {
        content: " +";
        color: var(--ink-dim);
      }

      .fish-chips-expanded {
        padding-top: 1px;
      }

      .value-tag,
      .lock-tag {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 1px 0 1px 7px;
        border-left: 1px solid rgba(214, 184, 106, 0.55);
        color: #e5cb82;
        background: transparent;
        font-size: 0.76rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }

      .value-tag .icon,
      .lock-tag .icon {
        width: 13px;
        height: 13px;
        stroke: var(--gold);
      }

      .lock-tag {
        gap: 8px;
        margin-left: auto;
      }

      .lock-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      .lock-copy strong {
        color: #e5cb82;
        font-size: 0.72rem;
      }

      .lock-copy small {
        color: var(--ink-dim);
        font-size: 0.66rem;
        line-height: 1.35;
      }

      .location-radio {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 27px;
        height: 27px;
        border: 1px solid rgba(214, 184, 106, 0.34);
        border-radius: 50%;
        color: transparent;
        background: rgba(7, 9, 7, 0.72);
        transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
      }

      .location-radio .icon {
        width: 13px;
        height: 13px;
        stroke-width: 2.8;
      }

      .location-card.is-selected .location-radio {
        border-color: transparent;
        color: #10130d;
        background: var(--gold);
        box-shadow: 0 0 22px rgba(214, 184, 106, 0.24);
      }

      @media (max-width: 350px) {
        .location-card {
          padding-inline: 13px;
        }

        .location-top h2 {
          font-size: 1.03rem;
        }
      }

      @media (forced-colors: active) {
        .location-card {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }

        .location-card.is-selected {
          border-color: Highlight;
          box-shadow: 0 0 0 1px Highlight;
        }

        .location-card::before {
          background: Highlight;
          box-shadow: none;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare location?: LocationAvailability;
  declare selected: boolean;

  constructor() {
    super();
    this.selected = false;
  }

  private choose(): void {
    const location = this.location;
    if (!location) return;
    if (location.unlocked) {
      emitUiEvent(this, "ui:location-selected", { locationId: location.id });
      return;
    }
    emitUiEvent(this, "ui:shop-open", { category: "boats" satisfies ShopCategory });
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    this.choose();
  }

  render() {
    const state = this.state;
    const location = this.location;
    if (!state || !location) return html``;
    const names = speciesNamesForIds(state, location.fishIds);
    const visibleNames = names.slice(0, 3);
    const additionalNames = names.slice(3);
    const role = location.unlocked ? "radio" : "button";
    const boat = state.catalog.boats.find((candidate) => candidate.id === location.requiredBoatId);
    const label = location.unlocked
      ? undefined
      : `${location.name}, locked. Requires ${boat?.name ?? "a better boat"}. Open the Boats shop to unlock it.`;
    const riskLevel = location.riskBand === "low" ? 1 : location.riskBand === "moderate" ? 2 : 3;
    return html`
      <article
        class="location-card risk-${location.riskBand} ${this.selected ? "is-selected" : ""} ${location.unlocked ? "" : "is-locked"}"
        data-location=${location.id}
        title=${`${location.description} ${location.riskReason}`}
        role=${role}
        tabindex="0"
        aria-checked=${location.unlocked ? String(this.selected) : nothing}
        aria-label=${label ?? nothing}
        @click=${this.choose}
        @keydown=${this.handleKey}
      >
        <div class="location-top">
          <h2>${location.name}</h2>
          <span class="risk-dots risk-${location.riskBand}" role="img" aria-label=${`${capitalize(location.riskBand)} risk`}>
            ${[0, 1, 2].map((index) => html`<i class=${index < riskLevel ? "on" : ""}></i>`)}
            <span class="risk-dot-label">${capitalize(location.riskBand)} risk</span>
          </span>
        </div>
        <p class="location-risk-reason">${location.riskReason}</p>
        <div class="location-fish">
          <div class="fish-chips">
            <span class="fish-cue" aria-hidden="true">${icon("fish")}</span>
            ${visibleNames.map((name) => html`<span class="fish-chip">${name}</span>`)}
          </div>
          ${additionalNames.length > 0
            ? html`<details class="fish-list-details" @click=${(event: Event) => event.stopPropagation()}>
                <summary>View all ${names.length} species</summary>
                <div class="fish-chips fish-chips-expanded">
                  ${additionalNames.map((name) => html`<span class="fish-chip">${name}</span>`)}
                </div>
              </details>`
            : nothing}
        </div>
        <div class="location-foot">
          <span class="value-tag">${icon("coin")}<span>${formatCoins(location.expectedValueMinCoins)}–${formatCoins(location.expectedValueMaxCoins)}</span></span>
          ${location.unlocked
            ? html`<span class="location-radio" aria-hidden="true">${icon("check")}</span>`
            : html`<span class="lock-tag">${icon("lock")}<span class="lock-copy"><strong>Requires ${boat?.name ?? "a better boat"}</strong><small>${boat ? `${formatCoins(boat.priceCoins)} coins` : "Upgrade boat"}</small></span></span>`}
        </div>
      </article>
    `;
  }
}

customElements.define("location-card", LocationCardElement);
