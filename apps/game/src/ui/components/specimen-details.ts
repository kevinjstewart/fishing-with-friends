import type { FishSpecimen } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { getSpeciesSizeComparison } from "../specimen-size";
import { capitalize, formatDate } from "../presenters";
import { uiFoundationStyles } from "../component-styles";

export class SpecimenDetailsElement extends LitElement {
  static properties = {
    specimen: { attribute: false },
    variant: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
      }

      .specimen-details {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        margin: 6px 0;
      }

      .specimen-details > strong {
        grid-column: 1 / -1;
        color: #a9f5e8;
        font-family: var(--font-display);
        font-size: 0.88rem;
      }

      .stat-chip {
        display: grid;
        gap: 2px;
        padding: 9px 6px;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-radius: 5px;
        background: rgba(214, 184, 106, 0.045);
        font-family: var(--font-display);
        text-align: center;
      }

      .stat-chip b {
        color: #fff;
        font-size: 0.95rem;
        line-height: 1.1;
      }

      .stat-chip small {
        color: var(--gold);
        font-size: 0.58rem;
        font-weight: 650;
        letter-spacing: 0.12em;
      }

      .specimen-caught-meta {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 4px 10px;
        padding: 2px 1px 0;
        color: var(--ink-dim);
        font-size: 0.7rem;
      }

      .specimen-caught-meta span {
        overflow-wrap: anywhere;
      }

      .species-size {
        grid-column: 1 / -1;
        display: grid;
        gap: 7px;
        padding: 9px 10px 8px;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-radius: 6px;
        background: rgba(214, 184, 106, 0.035);
      }

      .species-size-heading,
      .species-size-scale {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .species-size-heading {
        color: var(--ink-faint);
        font-size: 0.62rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .species-size-value {
        color: var(--gold);
        font-size: 0.72rem;
        letter-spacing: 0.04em;
      }

      .species-size-track {
        position: relative;
        height: 8px;
        overflow: visible;
        border-radius: 999px;
        background: rgba(151, 201, 227, 0.14);
      }

      .species-size-fill {
        position: absolute;
        inset: 0 auto 0 0;
        min-width: 3px;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--cyan), var(--aqua));
        box-shadow: 0 0 12px rgba(94, 234, 212, 0.32);
      }

      .species-size-fill::after {
        content: "";
        position: absolute;
        top: 50%;
        right: -5px;
        width: 10px;
        height: 10px;
        transform: translateY(-50%);
        border: 2px solid var(--aqua);
        border-radius: 50%;
        background: var(--bg-mid);
        box-shadow: 0 0 10px rgba(94, 234, 212, 0.55);
      }

      .species-size-typical {
        position: absolute;
        top: -3px;
        bottom: -3px;
        width: 2px;
        transform: translateX(-1px);
        border-radius: 2px;
        background: var(--gold);
        box-shadow: 0 0 8px rgba(255, 209, 102, 0.65);
      }

      .species-size-scale {
        color: var(--ink-faint);
        font-size: 0.65rem;
        line-height: 1.3;
      }

      .species-size-status {
        color: var(--gold);
        font-weight: 700;
      }

      .species-size-typical-label::before {
        content: "";
        display: inline-block;
        width: 2px;
        height: 10px;
        margin-right: 5px;
        transform: translateY(1px);
        border-radius: 2px;
        background: var(--gold);
      }

      :host([variant="catch"]) .specimen-details {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        margin: 0;
        padding: 11px 12px 12px;
        background: #0b0e0a;
      }

      :host([variant="catch"]) .specimen-details > strong {
        display: none;
      }

      :host([variant="catch"]) .stat-chip {
        padding: 10px 5px 9px;
        border: 0;
        border-radius: 5px;
        background: rgba(214, 184, 106, 0.045);
        box-shadow: inset 0 0 0 1px rgba(214, 184, 106, 0.14);
      }

      :host([variant="catch"]) .stat-chip b,
      :host([variant="catch"]) .stat-chip small {
        font-weight: 650;
      }

      :host([variant="catch"]) .specimen-caught-meta {
        padding: 2px 2px 0;
        font-size: 0.66rem;
      }

      @media (max-width: 350px) {
        .species-size-scale {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `,
  ];

  declare specimen?: FishSpecimen;
  declare variant: string;

  constructor() {
    super();
    this.variant = "card";
  }

  render() {
    const specimen = this.specimen;
    if (!specimen) return nothing;
    const comparison = getSpeciesSizeComparison(specimen);
    return html`
      <div class="specimen-details ${this.variant === "catch" ? "catch-specimen" : ""}">
        <strong>${capitalize(specimen.quality)}</strong>
        ${this.statChip(specimen.weightKg.toFixed(1), "KG")}
        ${this.statChip(`${specimen.lengthCm}`, "CM")}
        ${this.statChip(specimen.saleValueCoins.toLocaleString(), "COINS")}
        <div class="specimen-caught-meta"><span class="specimen-location">Caught at ${specimen.locationName}</span><span class="specimen-caught-date">Caught ${formatDate(specimen.caughtAt)}</span></div>
        <div class="species-size">
          <div class="species-size-heading"><span>Species size</span><strong class="species-size-value">${comparison.percentOfMaximum}% of max</strong></div>
          <div class="species-size-track" role="img" aria-label=${`${specimen.weightKg.toFixed(1)} kilograms, ${comparison.label.toLowerCase()} for ${specimen.species.commonName}. Typical is ${specimen.species.typicalWeightKg.toFixed(1)} kilograms and the species maximum is ${specimen.species.maximumWeightKg.toFixed(1)} kilograms.`}>
            <span class="species-size-fill" style=${`width:${comparison.fillPercent}%`}></span>
            <span class="species-size-typical" style=${`left:${comparison.typicalMarkerPercent}%`} aria-hidden="true" title=${`Typical size: ${specimen.species.typicalWeightKg.toFixed(1)} kg`}></span>
          </div>
          <div class="species-size-scale"><span class="species-size-status">${comparison.label}</span><span class="species-size-typical-label">Typical ${specimen.species.typicalWeightKg.toFixed(1)} kg · Max ${specimen.species.maximumWeightKg.toFixed(1)} kg</span></div>
        </div>
      </div>
    `;
  }

  private statChip(value: string, unit: string) {
    return html`<span class="stat-chip"><b>${value}</b><small>${unit}</small></span>`;
  }
}

customElements.define("specimen-details", SpecimenDetailsElement);
