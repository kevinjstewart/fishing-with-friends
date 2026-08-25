import { LitElement, html, css } from "lit";
import { icon, type IconName } from "../icons";
import { uiFoundationStyles } from "../component-styles";

export class GameHeroElement extends LitElement {
  static properties = {
    eyebrow: { type: String },
    title: { type: String },
    value: { type: String },
    valueLabel: { type: String },
    valueIcon: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
      }

      .screen-hero {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 0;
        padding: 12px 14px;
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.24);
        border-radius: 10px;
        background:
          linear-gradient(90deg, rgba(214, 184, 106, 0.07) 0 1px, transparent 1px calc(100% - 1px), rgba(214, 184, 106, 0.07) calc(100% - 1px)),
          linear-gradient(145deg, rgba(24, 31, 24, 0.97), rgba(11, 13, 10, 0.97));
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 18px 38px rgba(0, 0, 0, 0.34);
      }

      .screen-hero::before {
        content: "";
        position: absolute;
        right: 16px;
        bottom: 12px;
        width: 32px;
        height: 32px;
        border: 1px solid rgba(214, 184, 106, 0.18);
        border-radius: 50%;
        pointer-events: none;
      }

      .screen-hero::after {
        content: "";
        position: absolute;
        right: 31px;
        bottom: 27px;
        width: 38px;
        height: 1px;
        background: rgba(214, 184, 106, 0.18);
        pointer-events: none;
      }

      .screen-hero-text {
        min-width: 0;
      }

      .screen-hero h1 {
        overflow: hidden;
        font-size: clamp(1.18rem, 5vw, 1.58rem);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .hero-value {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
        padding: 7px 12px;
        border: 1px solid rgba(214, 184, 106, 0.48);
        border-radius: 6px;
        color: #ead28d;
        background: linear-gradient(180deg, rgba(48, 40, 20, 0.92), rgba(25, 21, 12, 0.96));
        box-shadow: inset 0 1px rgba(255, 239, 186, 0.09), 0 8px 22px rgba(0, 0, 0, 0.3);
        font-family: var(--font-body);
        font-size: 0.8rem;
        font-weight: 650;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .hero-value .icon {
        width: 14px;
        height: 14px;
        stroke: var(--gold);
      }

      @media (max-width: 350px) {
        .screen-hero {
          gap: 7px;
          padding-inline: 11px;
        }

        .hero-value {
          padding-inline: 8px;
          font-size: 0.72rem;
        }
      }
    `,
  ];

  declare eyebrow: string;
  declare title: string;
  declare value: string;
  declare valueLabel: string;
  declare valueIcon: IconName;

  constructor() {
    super();
    this.eyebrow = "";
    this.title = "";
    this.value = "";
    this.valueLabel = "";
    this.valueIcon = "coin";
  }

  render() {
    return html`
      <header class="screen-hero">
        <div class="screen-hero-text">
          <span class="eyebrow">${this.eyebrow}</span>
          <h1>${this.title}</h1>
        </div>
        <span class="hero-value" aria-label=${this.valueLabel || this.value}>${icon(this.valueIcon)}<span>${this.value}</span></span>
      </header>
    `;
  }
}

customElements.define("game-hero", GameHeroElement);
