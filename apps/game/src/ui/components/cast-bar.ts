import type { GameStateResponse, LocationAvailability, RiskBand } from "@fishing/shared/contracts";
import { rodRiskBandForWeight } from "@fishing/shared/risk";
import { LitElement, html, css } from "lit";
import { icon, type IconName } from "../icons";
import { emitUiEvent } from "../types";
import { capitalize, eligibleFishForSetup, RISK_PRESENTATION, riskLabel } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

export class CastBarElement extends LitElement {
  static properties = {
    state: { attribute: false },
    location: { attribute: false },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        position: fixed;
        left: calc(var(--app-safe-left) + 12px);
        right: calc(var(--app-safe-right) + 12px);
        bottom: calc(var(--tabbar-total-height) + var(--cta-gap));
        z-index: 10;
        display: block;
        min-height: var(--cast-bar-h);
        pointer-events: auto;
      }

      .cast-bar {
        display: grid;
        gap: 8px 10px;
        min-height: var(--cast-bar-h);
        padding: 10px;
        border: 1px solid rgba(214, 184, 106, 0.42);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(15, 18, 13, 0.98), rgba(7, 8, 6, 0.99));
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.035), 0 24px 54px rgba(0, 0, 0, 0.64);
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
      }

      .cast-details {
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        gap: 10px;
        min-width: 0;
      }

      .cast-details-copy {
        display: grid;
        align-content: center;
        gap: 2px;
        min-width: 0;
      }

      .cast-details-title {
        color: var(--gold);
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .cast-details-copy strong {
        overflow: hidden;
        color: var(--ink);
        font-family: var(--font-body);
        font-size: 0.78rem;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cast-details-after {
        overflow: hidden;
        color: var(--ink-dim);
        font-size: 0.66rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cast-risk {
        display: grid;
        flex: 0 0 47%;
        align-content: center;
        gap: 1px;
        min-width: 0;
        padding: 7px 9px;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-radius: 6px;
        background: rgba(13, 18, 13, 0.66);
      }

      .cast-risk-label {
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .cast-risk strong {
        color: var(--ink);
        font-size: 0.66rem;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .cast-risk.risk-low .cast-risk-label { color: #8cefc0; }
      .cast-risk.risk-moderate .cast-risk-label { color: #ffd685; }
      .cast-risk.risk-high .cast-risk-label { color: #ffa79a; }

      .cast-readiness {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 7px;
      }

      .readiness-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 6px;
        border: 1px solid;
        border-radius: 2px;
        font-size: 0.68rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
      }

      .readiness-chip .icon {
        width: 13px;
        height: 13px;
        stroke-width: 2;
      }

      .readiness-chip.is-ok { color: #9fe6c9; border-color: rgba(87, 224, 164, 0.28); background: rgba(61, 214, 140, 0.04); }
      .readiness-chip.is-warn { color: #ffd685; border-color: rgba(255, 209, 102, 0.32); background: rgba(205, 149, 53, 0.05); }
      .readiness-chip.is-bad { color: #ffa79a; border-color: rgba(255, 143, 125, 0.38); background: rgba(185, 66, 62, 0.06); animation: gear-alert 1.7s ease-in-out infinite; }

      @keyframes gear-alert {
        50% { box-shadow: 0 0 16px rgba(255, 143, 125, 0.55); }
      }

      .cast-cta {
        grid-column: 1 / -1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-height: 46px;
        padding: 10px 14px;
        font-size: 0.77rem;
      }

      .cast-cta .icon {
        width: 19px;
        height: 19px;
        stroke-width: 2;
      }

      .cast-cta.is-restock {
        color: #fff4e5;
        background: linear-gradient(180deg, #8f2a40, #651829);
      }

      @media (orientation: landscape) and (max-height: 560px) {
        :host {
          min-height: 54px;
        }

        .cast-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 54px;
          min-height: 54px;
          padding: 4px 8px;
          border-radius: 10px;
        }

        .cast-details {
          flex: 0 0 auto;
          align-items: center;
          max-width: 142px;
        }

        .cast-details-title,
        .cast-details-after,
        .cast-risk {
          display: none;
        }

        .cast-details-copy strong {
          max-width: 142px;
          font-size: 0.6rem;
          white-space: normal;
        }

        .cast-readiness {
          min-width: 0;
          flex: 1 1 auto;
          flex-wrap: nowrap;
          justify-content: flex-start;
          gap: 5px;
          overflow: hidden;
        }

        .readiness-chip {
          min-width: 0;
          gap: 3px;
          padding: 3px 7px;
          font-size: 0.6rem;
          white-space: nowrap;
        }

        .readiness-chip .icon {
          width: 11px;
          height: 11px;
        }

        .cast-cta {
          flex: 0 0 auto;
          width: auto;
          min-height: 40px;
          padding: 8px 12px;
          font-size: 0.75rem;
          white-space: nowrap;
        }
      }

      @media (forced-colors: active) {
        .cast-bar {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare state?: GameStateResponse;
  declare location?: LocationAvailability;
  declare actionPending: boolean;

  constructor() {
    super();
    this.actionPending = false;
  }

  private readinessChip(iconName: IconName, text: string, tone: "ok" | "warn" | "bad", label: string) {
    return html`<span class="readiness-chip is-${tone}" role="img" aria-label=${label} title=${label}>${icon(iconName)}<span>${text}</span></span>`;
  }

  private openShop(category: "bait" | "rods" | "lures"): void {
    if (!this.actionPending) emitUiEvent(this, "ui:shop-open", { category });
  }

  render() {
    const state = this.state;
    const location = this.location;
    if (!state || !location) return html``;
    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const equippedRod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const rod = equippedRod && state.inventory.rods.find((item) => item.id === equippedRod.id)?.quantity ? equippedRod : undefined;
    const lureDefinition = lure ? state.catalog.lures.find((item) => item.id === lure.id) : undefined;
    const baitDefinition = bait ? state.catalog.baits.find((item) => item.id === bait.id) : undefined;
    const eligibleFish = eligibleFishForSetup(state, location, bait?.id);
    const heaviest = Math.max(0, ...eligibleFish.map((species) => species.maximumWeightKg));
    const baitQuantity = bait?.quantity ?? 0;
    const lureUsesLeft = lure?.durability ?? 0;
    const lureUsable = Boolean(lure && lure.quantity > 0 && (lureUsesLeft >= 1 || lure.quantity > 1));
    const castRiskBand: RiskBand = rod ? rodRiskBandForWeight(heaviest, rod.maxFishWeightKg) : "high";
    const lureName = lureDefinition?.name ?? "your lure";
    const baitName = baitDefinition?.name ?? "your bait";
    const lureWillUseSpare = Boolean(lure && lureUsesLeft < 1 && lure.quantity > 1);
    const lureAfter = lureDefinition
      ? lureWillUseSpare
        ? `${lureName} becomes ${Math.max(0, lureDefinition.maximumDurability - 1)}/${lureDefinition.maximumDurability}`
        : `${lureName} ${Math.max(0, lureUsesLeft - 1)}/${lureDefinition.maximumDurability}`
      : "lure unavailable";
    const canCast = Boolean(location.unlocked && rod && lureUsable && baitQuantity > 0 && eligibleFish.length > 0);
    const castDetails = `${baitName} ×1 · ${lureName} ×1`;
    const afterCasting = lureWillUseSpare
      ? `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter} (spare used)`
      : `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter}`;
    const button = !baitQuantity
      ? { label: "Restock bait", iconName: "bait" as IconName, restock: true, action: () => this.openShop("bait") }
      : !rod
        ? { label: "Claim a rod", iconName: "rod" as IconName, restock: true, action: () => this.openShop("rods") }
        : !lureUsable
          ? { label: "Replace lure", iconName: "lure" as IconName, restock: true, action: () => this.openShop("lures") }
          : { label: `Cast at ${location.name}`, iconName: "waves" as IconName, restock: false, action: () => emitUiEvent(this, "ui:start-fishing", { locationId: location.id }) };
    return html`
      <div class="cast-bar" aria-label="Fishing cast controls">
        <div class="cast-details">
          <div class="cast-details-copy">
            <span class="cast-details-title">Next cast</span>
            <strong>${castDetails}</strong>
            <span class="cast-details-after">${afterCasting}</span>
            <span class="sr-only">1 bait + 1 lure use</span>
          </div>
          <div class="cast-risk risk-${castRiskBand}" aria-label=${`${riskLabel(castRiskBand)}. ${location.riskReason} ${RISK_PRESENTATION[castRiskBand].consequence}`}>
            <span class="cast-risk-label">${capitalize(castRiskBand)}</span>
            <strong>${rod ? `${heaviest.toFixed(1)} / ${rod.maxFishWeightKg.toFixed(1)} kg` : "No rod"}</strong>
          </div>
        </div>
        <div class="cast-readiness">
          ${this.readinessChip("rod", `${heaviest.toFixed(1)}kg`, castRiskBand === "low" ? "ok" : castRiskBand === "moderate" ? "warn" : "bad", rod ? `${riskLabel(castRiskBand)}. Fish attracted by ${baitName} reach ${heaviest.toFixed(1)} kilograms; your rod is rated for ${rod.maxFishWeightKg.toFixed(1)} kilograms. ${RISK_PRESENTATION[castRiskBand].consequence}` : "No rod is equipped.")}
          ${this.readinessChip("lure", lureWillUseSpare ? "1 spare" : `${Math.max(0, lureUsesLeft)}`, lureUsable ? "ok" : "bad", lureUsable ? (lureWillUseSpare ? `${lureName} will consume one spare lure` : `${lureUsesLeft} uses left on ${lureName}`) : "Your lure has no usable copy left")}
          ${this.readinessChip("bait", `×${baitQuantity}`, baitQuantity > 0 ? "ok" : "bad", baitQuantity > 0 ? `${baitQuantity} bait portions left` : "You are out of bait")}
        </div>
        <button
          class="primary-action cast-cta ${button.restock ? "is-restock" : ""}"
          type="button"
          ?disabled=${this.actionPending || (!button.restock && !canCast)}
          aria-disabled=${String(this.actionPending || (!button.restock && !canCast))}
          @click=${button.action}
        >${icon(button.iconName)}<span>${button.label}</span></button>
      </div>
    `;
  }
}

customElements.define("cast-bar", CastBarElement);
