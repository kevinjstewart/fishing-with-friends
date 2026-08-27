import type { GameStateResponse } from "@fishing/shared/contracts";
import { LitElement, html, css } from "lit";
import { icon } from "../icons";
import { uiFoundationStyles } from "../component-styles";

export class GearDockElement extends LitElement {
  static properties = {
    state: { attribute: false },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .gear-dock {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        padding: 5px;
        border: 1px solid rgba(214, 184, 106, 0.18);
        border-radius: 10px;
        background: rgba(9, 11, 8, 0.9);
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34);
      }

      .gear-slot,
      .boat-tile {
        min-width: 0;
      }

      .gear-selector-wrap + .gear-selector-wrap {
        border-left: 1px solid rgba(214, 184, 106, 0.12);
      }

      .boat-tile {
        display: grid;
        justify-items: center;
        align-content: start;
        gap: 5px;
        min-height: 82px;
        padding: 9px 4px 7px;
        text-align: center;
      }

      .gear-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 1px solid #b6c5ff;
        border-radius: 50%;
        color: #b6c5ff;
        background: linear-gradient(145deg, rgba(142, 166, 255, 0.2), rgba(142, 166, 255, 0.06));
      }

      .gear-icon .icon {
        width: 19px;
        height: 19px;
      }

      .gear-text {
        display: grid;
        gap: 3px;
        justify-items: center;
        width: 100%;
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
      }

      @media (orientation: landscape) and (max-height: 560px) {
        .boat-tile {
          min-height: 64px;
          gap: 4px;
          padding: 6px 4px 5px;
        }

        .gear-icon {
          width: 32px;
          height: 32px;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare actionPending: boolean;

  constructor() {
    super();
    this.actionPending = false;
  }

  render() {
    const state = this.state;
    if (!state) return html``;
    const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
    return html`
      <section class="gear-dock" aria-label="Current tackle">
        <div class="gear-tile boat-tile" role="img" aria-label=${boat ? `Boat: ${boat.name}, tier ${boat.tier}` : "No boat"}>
          <span class="gear-icon">${icon("anchor")}</span>
          <span class="gear-text"><span class="gear-name">${boat?.name ?? "No boat"}</span><span class="gear-meta">${boat ? `Tier ${boat.tier}` : "—"}</span></span>
        </div>
        <div class="gear-selector-wrap"><gear-selector .state=${state} equipmentType="rod" tone="rod" iconName="rod" ?actionPending=${this.actionPending}></gear-selector></div>
        <div class="gear-selector-wrap"><gear-selector .state=${state} equipmentType="lure" tone="lure" iconName="lure" ?actionPending=${this.actionPending}></gear-selector></div>
        <div class="gear-selector-wrap"><gear-selector .state=${state} equipmentType="bait" tone="bait" iconName="bait" ?actionPending=${this.actionPending}></gear-selector></div>
      </section>
    `;
  }
}

customElements.define("gear-dock", GearDockElement);
