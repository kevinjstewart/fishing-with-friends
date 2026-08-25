import type { CatchDecisionResponse, CompleteFishingResponse, GameStateResponse } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { icon } from "../icons";
import { emitUiEvent } from "../types";
import { capitalize, formatCoins, RISK_PRESENTATION, riskLabel } from "../presenters";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";
import "../fish-images";
import "./specimen-details";
import "./catch-decision";

export class CatchResultElement extends LitElement {
  static properties = {
    result: { attribute: false },
    gameState: { attribute: false },
    actionPending: { type: Boolean },
    decisionResult: { attribute: false },
  };

  static styles = [
    uiFoundationStyles,
    screenSurfaceStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .fishing-status {
        display: grid;
        gap: 10px;
        width: min(100%, 620px);
        margin-inline: auto;
        padding: 0;
        overflow: visible;
        border: 0;
        background: transparent;
        box-shadow: none;
      }

      .catch-reveal {
        position: relative;
        display: grid;
        gap: 0;
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.42);
        border-radius: 10px;
        background: #0b0e0a;
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 24px 48px rgba(0, 0, 0, 0.48);
        animation: screen-pop 0.28s ease-out both;
      }

      .catch-reveal::before {
        content: "";
        position: absolute;
        top: 18px;
        right: 18px;
        z-index: 3;
        width: 42px;
        height: 42px;
        opacity: 0.22;
        border: 1px solid var(--gold);
        border-radius: 50%;
        box-shadow: inset 0 0 0 6px rgba(214, 184, 106, 0.08);
        pointer-events: none;
      }

      .catch-masthead {
        position: relative;
        z-index: 4;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid rgba(214, 184, 106, 0.2);
        background: linear-gradient(110deg, #172219, #0a0d09);
      }

      .catch-title {
        min-width: 0;
      }

      .catch-title h1 {
        overflow: hidden;
        font-size: clamp(1.35rem, 6vw, 2rem);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .catch-title .eyebrow {
        margin: 0 0 3px;
      }

      .landed-seal {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
        padding: 7px 9px;
        border: 1px solid rgba(214, 184, 106, 0.58);
        border-radius: 2px;
        color: #ead28d;
        background: rgba(31, 26, 13, 0.9);
        font-size: 0.62rem;
        font-weight: 650;
        letter-spacing: 0.09em;
      }

      .landed-seal .icon {
        width: 14px;
        height: 14px;
        stroke-width: 2.2;
      }

      .catch-visual {
        position: relative;
        z-index: 2;
        min-height: 220px;
        overflow: hidden;
        background: linear-gradient(155deg, #1c3327, #090d0a);
      }

      .catch-visual fish-image {
        display: block;
      }

      .catch-quality {
        position: absolute;
        bottom: 13px;
        left: 13px;
        z-index: 3;
        padding: 6px 10px;
        border: 1px solid currentColor;
        border-radius: 2px;
        color: #eafff7;
        background: rgba(7, 9, 7, 0.9);
        font-size: 0.65rem;
        font-weight: 650;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .catch-sale-value {
        position: absolute;
        top: 13px;
        right: 13px;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 118px;
        padding: 8px 10px 9px;
        border: 1px solid rgba(255, 239, 166, 0.9);
        border-radius: 7px;
        color: #171207;
        background: linear-gradient(135deg, #f4dfa0, #c69f4c);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.42), 0 10px 20px rgba(0, 0, 0, 0.32);
      }

      .catch-sale-value .icon {
        width: 21px;
        height: 21px;
        stroke-width: 2.1;
      }

      .catch-sale-copy {
        display: grid;
        gap: 2px;
        line-height: 1;
      }

      .catch-sale-label {
        font-size: 0.52rem;
        font-weight: 900;
        letter-spacing: 0.13em;
      }

      .catch-sale-copy strong {
        font-family: var(--font-display);
        font-size: 1.08rem;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }

      .catch-sale-copy strong small {
        font-family: var(--font-body);
        font-size: 0.52rem;
        letter-spacing: 0.09em;
      }

      .quality-good { color: var(--aqua); }
      .quality-large { color: #91c9ff; }
      .quality-trophy,
      .quality-exceptional { color: var(--gold); }

      .catch-flavor {
        position: relative;
        z-index: 4;
        padding: 0 14px 14px;
        color: var(--ink-dim);
        background: #0b0e0a;
        font-size: 0.72rem;
        line-height: 1.4;
        text-align: center;
      }

      .result-risk {
        display: block;
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-left-width: 2px;
        border-radius: 6px;
        background: rgba(214, 184, 106, 0.04);
      }

      .result-risk.risk-low { border-left-color: #57e0a4; }
      .result-risk.risk-moderate { border-left-color: #ffd166; }
      .result-risk.risk-high { border-left-color: #ff8f7d; }
      .result-risk.did-break { border-color: rgba(255, 116, 92, 0.62); background: rgba(93, 35, 27, 0.58); }

      .result-risk summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 44px;
        padding: 8px 11px;
        cursor: pointer;
        list-style: none;
      }

      .result-risk summary::-webkit-details-marker { display: none; }
      .result-risk summary::after { content: "+"; color: currentColor; font-size: 1rem; font-weight: 900; }
      .result-risk[open] summary::after { content: "–"; }

      .tackle-report-label {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: var(--ink);
        font-size: 0.72rem;
        font-weight: 900;
      }

      .tackle-report-label .icon {
        width: 16px;
        height: 16px;
      }

      .result-risk summary > strong {
        margin-left: auto;
        font-family: var(--font-body);
        font-size: 0.62rem;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .result-risk.risk-low summary > strong { color: #8cefc0; }
      .result-risk.risk-moderate summary > strong { color: #ffd685; }
      .result-risk.risk-high summary > strong { color: #ffa79a; }

      .tackle-report-body {
        display: grid;
        gap: 5px;
        padding: 0 11px 11px 34px;
        border-top: 1px solid rgba(161, 218, 212, 0.1);
      }

      .tackle-report-body p {
        margin: 0;
        color: var(--ink-dim);
        font-size: 0.74rem;
        line-height: 1.45;
      }

      .tackle-report-body p:first-child {
        padding-top: 9px;
      }

      .result-risk-consequence {
        color: var(--ink);
        font-size: 0.74rem;
        line-height: 1.45;
      }

      .rod-replacement {
        color: var(--gold) !important;
        font-weight: 900;
      }

      .lost-reveal,
      .decision-result {
        position: relative;
        display: grid;
        justify-items: center;
        gap: 7px;
        padding: 30px 20px 24px;
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.32);
        border-radius: 10px;
        color: var(--ink);
        background: radial-gradient(circle at 50% 4%, rgba(214, 184, 106, 0.1), transparent 31%), linear-gradient(150deg, #172219, #090b08);
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.42);
        text-align: center;
      }

      .lost-mark,
      .decision-mark {
        display: grid;
        place-items: center;
        width: 88px;
        height: 88px;
        margin-bottom: 8px;
        border: 1px solid rgba(214, 184, 106, 0.58);
        border-radius: 50%;
        color: var(--gold);
        background: rgba(214, 184, 106, 0.08);
      }

      .lost-mark .icon {
        width: 50px;
        height: 50px;
        opacity: 0.7;
        stroke-width: 1.3;
      }

      .lost-reveal .eyebrow {
        margin: 0;
        color: var(--coral);
      }

      .lost-reveal h1,
      .decision-result h1 {
        font-size: clamp(1.7rem, 9vw, 2.6rem);
      }

      .lost-species {
        color: var(--gold);
        font-size: 0.88rem;
      }

      .result-message {
        max-width: 38ch;
        color: var(--ink-dim);
        font-size: 0.8rem;
        line-height: 1.5;
        text-align: center;
      }

      .retry-cast,
      .decision-continue {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        margin-top: 4px;
      }

      .retry-cast .icon,
      .decision-continue .icon {
        width: 19px;
        height: 19px;
      }

      .decision-result {
        gap: 10px;
        padding: 30px 18px 20px;
      }

      .decision-mark {
        width: 78px;
        height: 78px;
        margin-bottom: 5px;
      }

      .decision-mark .icon {
        width: 38px;
        height: 38px;
      }

      .decision-result .eyebrow {
        margin: 0;
      }

      .decision-receipt,
      .decision-wallet {
        width: 100%;
        max-width: 390px;
        border-radius: 6px;
        background: rgba(214, 184, 106, 0.045);
      }

      .decision-receipt {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(214, 184, 106, 0.16);
        text-align: left;
      }

      .decision-receipt span {
        overflow: hidden;
        color: var(--ink-dim);
        font-size: 0.76rem;
        font-weight: 800;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .decision-receipt strong {
        flex: 0 0 auto;
        color: var(--gold);
        font-size: 0.82rem;
      }

      .decision-wallet {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        color: var(--ink-dim);
        text-align: left;
      }

      .decision-wallet .icon {
        width: 16px;
        height: 16px;
        color: var(--gold);
      }

      .decision-wallet strong {
        color: #fff0b3;
        font-size: 0.9rem;
      }

      @keyframes screen-pop {
        from { opacity: 0; transform: translateY(7px); }
        to { opacity: 1; transform: none; }
      }

      @media (max-height: 700px) {
        .catch-visual {
          min-height: 176px;
        }

        .catch-flavor {
          display: none;
        }
      }

      @media (forced-colors: active) {
        .catch-reveal,
        .lost-reveal,
        .decision-result,
        .result-risk {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare result?: CompleteFishingResponse;
  declare gameState?: GameStateResponse;
  declare actionPending: boolean;
  declare decisionResult?: CatchDecisionResponse;

  constructor() {
    super();
    this.actionPending = false;
  }

  private tackleReport(result: CompleteFishingResponse) {
    const rod = this.gameState?.catalog.rods.find((candidate) => candidate.id === result.rodId);
    const replacementName = result.replacementRodId ? this.gameState?.catalog.rods.find((candidate) => candidate.id === result.replacementRodId)?.name : undefined;
    return html`<details class="result-risk risk-${result.rodRiskBand} ${result.rodBroke ? "did-break" : ""}" ?open=${result.rodBroke}><summary><span class="tackle-report-label">${icon("rod")}<span>${result.rodBroke ? "Rod snapped" : "Tackle report"}</span></span><strong>${result.rodBroke ? "Action needed" : riskLabel(result.rodRiskBand)}</strong></summary><div class="tackle-report-body"><p>${rod?.name ?? "Your rod"} faced a ${result.rodBreakChancePercent.toFixed(2)}% break chance.</p><span class="result-risk-consequence">${result.rodBroke ? "This rod is no longer usable." : RISK_PRESENTATION[result.rodRiskBand].consequence}</span>${result.rodBroke ? html`<p class="rod-replacement">${replacementName ? `${replacementName} is equipped now.` : "Claim a free Starter Fiberglass rod in Shop → Rods before casting again."}</p>` : nothing}</div></details>`;
  }

  render() {
    const decisionResult = this.decisionResult;
    if (decisionResult) {
      return html`<section class="fishing-status decision-result" data-testid="decision-result"><span class="decision-mark">${icon(decisionResult.decision === "sell" ? "coin" : "trophy")}</span><span class="eyebrow">${decisionResult.decision === "sell" ? "Sold" : "Trophy secured"}</span><h1>${decisionResult.decision === "sell" ? "Nice payday!" : "Into the livewell!"}</h1><div class="decision-receipt"><span>${decisionResult.catch.species.commonName}</span><strong>${decisionResult.decision === "sell" ? `+${formatCoins(decisionResult.catch.saleValueCoins)} coins` : "Collection +1"}</strong></div><div class="decision-wallet">${icon("coin")}<span>Wallet</span><strong>${formatCoins(decisionResult.coins)}</strong></div><button class="primary-action decision-continue" type="button" @click=${() => emitUiEvent(this, "ui:return-to-lakes", undefined)}>${icon("waves")}<span>Fish again</span></button></section>`;
    }
    const result = this.result;
    if (!result) return html``;
    const species = result.species ?? result.catch?.species;
    if (!result.catch) {
      return html`<section class="fishing-status catch-result" data-testid="catch-result"><article class="lost-reveal"><span class="lost-mark">${icon("fish")}</span><span class="eyebrow">The line went slack</span><h1>It got away</h1><strong class="lost-species">${species?.commonName ?? "Unknown fish"}</strong><p class="result-message">${result.message}</p><button class="primary-action retry-cast" type="button" ?disabled=${this.actionPending} @click=${() => emitUiEvent(this, "ui:return-to-lakes", undefined)}>${icon("waves")}<span>Cast again</span></button></article>${this.tackleReport(result)}</section>`;
    }
    return html`<section class="fishing-status catch-result" data-testid="catch-result"><article class="catch-reveal"><header class="catch-masthead"><div class="catch-title"><span class="eyebrow">${result.catch.locationName}</span><h1>${result.catch.species.commonName}</h1></div><span class="landed-seal">${icon("spark")}<span>LANDED</span></span></header><div class="catch-visual"><fish-image variant="catch" .species=${result.catch.species}></fish-image><span class="catch-quality quality-${result.catch.quality}">${capitalize(result.catch.quality)}</span><div class="catch-sale-value" data-testid="catch-sale-value" role="group" aria-label=${`Sell value: ${formatCoins(result.catch.saleValueCoins)} coins`}>${icon("coin")}<span class="catch-sale-copy"><span class="catch-sale-label">SELL VALUE</span><strong>+${formatCoins(result.catch.saleValueCoins)} <small>COINS</small></strong></span></div></div><specimen-details variant="catch" .specimen=${result.catch}></specimen-details><p class="catch-flavor">${result.message}</p></article>${this.tackleReport(result)}<catch-decision .specimen=${result.catch} ?actionPending=${this.actionPending}></catch-decision></section>`;
  }
}

customElements.define("catch-result", CatchResultElement);
