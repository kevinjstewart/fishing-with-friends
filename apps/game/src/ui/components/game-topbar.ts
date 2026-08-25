import { LitElement, html, css } from "lit";
import { emitUiEvent } from "../types";
import { icon } from "../icons";
import { formatCoins } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

export class GameTopbarElement extends LitElement {
  static properties = {
    coins: { type: Number },
    disabled: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        min-height: var(--topbar-h);
        pointer-events: auto;
      }

      .app-topbar {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: var(--topbar-h);
        padding: 6px 16px;
      }

      .app-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: var(--ink);
        font-family: var(--font-display);
        font-size: 0.73rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        white-space: nowrap;
      }

      .app-brand > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border: 1px solid rgba(214, 184, 106, 0.72);
        border-radius: 50%;
        color: var(--gold);
        background: radial-gradient(circle at 38% 30%, #25352a, #101510 70%);
        box-shadow: inset 0 0 0 3px #0b0d0a, inset 0 0 0 4px rgba(214, 184, 106, 0.28), 0 8px 24px rgba(0, 0, 0, 0.38);
      }

      .brand-mark .icon {
        width: 19px;
        height: 19px;
        stroke: var(--gold);
        stroke-width: 1.7;
      }

      .wallet-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 38px;
        margin-left: auto;
        padding: 7px 13px 7px 11px;
        border: 1px solid rgba(214, 184, 106, 0.48);
        border-radius: 6px;
        color: #ead28d;
        background: linear-gradient(180deg, rgba(48, 40, 20, 0.92), rgba(25, 21, 12, 0.96));
        box-shadow: inset 0 1px rgba(255, 239, 186, 0.09), 0 8px 22px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transition: transform 0.2s var(--ease-spring), border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .wallet-chip:active {
        transform: scale(0.96);
      }

      .wallet-chip:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .wallet-chip .icon {
        width: 16px;
        height: 16px;
        stroke: var(--gold);
      }

      .wallet-chip strong {
        font-family: var(--font-body);
        font-size: 0.88rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        font-variant-numeric: tabular-nums;
      }

      .wallet-chip.did-update {
        animation: wallet-pop 0.55s var(--ease-spring);
        border-color: rgba(214, 184, 106, 0.85);
        box-shadow: 0 0 24px rgba(214, 184, 106, 0.22);
      }

      @keyframes wallet-pop {
        0% { transform: scale(1); }
        40% { transform: scale(1.09); }
        100% { transform: scale(1); }
      }

      @media (max-height: 640px) {
        .app-topbar {
          padding-inline: 12px;
        }

        .app-brand {
          font-size: 0.68rem;
        }

        .brand-mark {
          width: 29px;
          height: 29px;
        }

        .wallet-chip {
          min-height: 32px;
          padding-block: 4px;
        }
      }
    `,
  ];

  declare coins: number;
  declare disabled: boolean;
  private previousCoins?: number;

  constructor() {
    super();
    this.coins = 0;
    this.disabled = false;
  }

  protected updated(): void {
    if (this.previousCoins === undefined || this.previousCoins === this.coins) {
      this.previousCoins = this.coins;
      return;
    }
    this.previousCoins = this.coins;
    const wallet = this.renderRoot.querySelector<HTMLButtonElement>(".wallet-chip");
    wallet?.classList.remove("did-update");
    void wallet?.offsetWidth;
    wallet?.classList.add("did-update");
  }

  render() {
    return html`
      <header class="app-topbar">
        <div class="app-brand" aria-label="Fishing with Friends">
          <span class="brand-mark">${icon("rod")}</span>
          <span>ANGLER'S CLUB</span>
        </div>
        <button
          class="wallet-chip"
          type="button"
          aria-label="Open the tackle shop"
          ?disabled=${this.disabled}
          @click=${() => emitUiEvent(this, "ui:navigate", { screen: "shop" })}
        >
          ${icon("coin")}<strong>${formatCoins(this.coins)}</strong>
        </button>
      </header>
    `;
  }
}

customElements.define("game-topbar", GameTopbarElement);
