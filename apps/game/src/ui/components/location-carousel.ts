import type { GameStateResponse } from "@fishing/shared/contracts";
import { LitElement, html, css } from "lit";
import { uiFoundationStyles } from "../component-styles";

export class LocationCarouselElement extends LitElement {
  static properties = {
    state: { attribute: false },
    selectedLocationId: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .locations-list {
        display: grid;
        grid-auto-columns: min(78vw, 300px);
        grid-auto-flow: column;
        grid-template-columns: none;
        gap: 11px;
        margin-inline: -12px;
        padding: 3px 12px 8px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
      }

      .locations-list::-webkit-scrollbar {
        display: none;
      }

      @media (min-width: 720px) {
        .locations-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-auto-flow: row;
          margin-inline: 0;
          padding-inline: 0;
          overflow: visible;
        }
      }

      @media (orientation: landscape) and (max-height: 560px) {
        .locations-list {
          margin-top: calc(var(--tabbar-total-height) + var(--cast-bar-h) + var(--cta-gap) + var(--content-cast-gap));
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare selectedLocationId?: string;

  render() {
    if (!this.state) return html``;
    return html`
      <div class="locations-list" role="radiogroup" aria-label="Fishing locations">
        ${this.state.locations.map(
          (location) => html`<location-card .state=${this.state} .location=${location} .selected=${location.id === this.selectedLocationId}></location-card>`,
        )}
      </div>
    `;
  }
}

customElements.define("location-carousel", LocationCarouselElement);
