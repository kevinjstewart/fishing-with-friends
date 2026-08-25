import type { FishSpecimen } from "@fishing/shared";
import { LitElement, html, css } from "lit";
import { icon } from "../icons";
import { emitUiEvent } from "../types";
import { formatCoins } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

export class CatchDecisionElement extends LitElement {
  static properties = {
    specimen: { attribute: false },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        position: fixed;
        left: 50%;
        bottom: calc(var(--tabbar-total-height) + 10px);
        z-index: 20;
        display: block;
        width: min(calc(100% - var(--app-safe-left) - var(--app-safe-right) - 24px), 596px);
        transform: translateX(-50%);
        pointer-events: auto;
      }

      .catch-decision {
        display: grid;
        gap: 9px;
        width: 100%;
        padding: 12px;
        border: 1px solid rgba(214, 184, 106, 0.42);
        border-radius: 10px;
        background: rgba(9, 11, 8, 0.97);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.035), 0 22px 46px rgba(0, 0, 0, 0.58);
        -webkit-backdrop-filter: blur(18px) saturate(145%);
        backdrop-filter: blur(18px) saturate(145%);
      }

      .catch-decision-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 8px;
        padding-inline: 2px;
      }

      .catch-decision-heading .eyebrow {
        margin: 0;
      }

      .catch-decision-heading > strong {
        color: var(--ink-dim);
        font-size: 0.69rem;
      }

      .catch-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .catch-choice {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 9px;
        min-height: 56px;
        padding: 9px 11px;
        border: 1px solid;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
        transition: transform 0.16s var(--ease-spring), box-shadow 0.16s ease;
      }

      .catch-choice:active {
        transform: translateY(3px);
        box-shadow: none;
      }

      .catch-choice .icon {
        width: 23px;
        height: 23px;
        stroke-width: 2.1;
      }

      .keep-choice {
        border-color: rgba(214, 184, 106, 0.3);
        color: #efe6d8;
        background: linear-gradient(180deg, #244333, #172b21);
      }

      .sell-choice {
        border-color: rgba(214, 184, 106, 0.54);
        color: #181309;
        background: linear-gradient(180deg, #e2cb82, #ae8d3d);
      }

      .choice-copy {
        display: grid;
        line-height: 1.12;
      }

      .choice-copy strong,
      .choice-copy small {
        font-weight: 650;
      }

      .choice-copy strong {
        font-family: var(--font-display);
        font-size: 0.8rem;
        letter-spacing: 0.03em;
      }

      .choice-copy small {
        margin-top: 3px;
        font-size: 0.61rem;
      }

      @media (max-height: 700px) {
        .catch-decision {
          gap: 5px;
          padding: 7px;
        }

        .catch-decision-heading {
          display: none;
        }

        .catch-choice {
          min-height: 48px;
          padding-block: 6px;
        }
      }

      @media (forced-colors: active) {
        .catch-decision,
        .catch-choice {
          forced-color-adjust: none;
          border-color: ButtonText;
          color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare specimen?: FishSpecimen;
  declare actionPending: boolean;

  constructor() {
    super();
    this.actionPending = false;
  }

  render() {
    const specimen = this.specimen;
    if (!specimen) return html``;
    return html`<section class="catch-decision" aria-label="Catch decision controls"><div class="catch-decision-heading"><span class="eyebrow">Your call</span><strong>Keep the trophy or cash out?</strong></div><div class="catch-actions"><button class="catch-choice keep-choice" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} @click=${() => emitUiEvent(this, "ui:catch-decision", { decision: "keep" })}>${icon("trophy")}<span class="choice-copy"><strong>Keep</strong><small>Add to collection</small></span></button><button class="catch-choice sell-choice" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} @click=${() => emitUiEvent(this, "ui:catch-decision", { decision: "sell" })}>${icon("coin")}<span class="choice-copy"><strong>Sell</strong><small>+${formatCoins(specimen.saleValueCoins)} coins</small></span></button></div></section>`;
  }
}

customElements.define("catch-decision", CatchDecisionElement);
