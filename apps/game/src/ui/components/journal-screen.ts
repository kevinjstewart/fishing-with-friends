import type { FishJournalResponse, GameStateResponse, JournalEntry } from "@fishing/shared/contracts";
import { LitElement, html, css } from "lit";
import { icon } from "../icons";
import { emitUiEvent, type JournalFilterMode } from "../types";
import { capitalize, formatDate, journalDiscoveryHint } from "../presenters";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";
import "../fish-images";

export class JournalScreenElement extends LitElement {
  static properties = {
    journal: { attribute: false },
    state: { attribute: false },
    filterMode: { type: String },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    screenSurfaceStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .journal-controls {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 10px 12px;
        border: 1px solid rgba(214, 184, 106, 0.19);
        border-radius: 6px;
        background: rgba(8, 10, 7, 0.96);
        font-size: 0.78rem;
      }

      .journal-controls label {
        flex: 0 0 auto;
      }

      .journal-controls .sort-select {
        min-width: 150px;
        min-height: 38px;
      }

      .journal-controls > .muted {
        margin-left: auto;
        white-space: nowrap;
      }

      .journal-grid {
        display: grid;
        gap: 10px;
      }

      .journal-card {
        display: grid;
        gap: 9px;
        align-content: start;
        padding: 14px;
        border: 1px solid rgba(214, 184, 106, 0.19);
        border-radius: 9px;
        background: linear-gradient(145deg, rgba(19, 22, 17, 0.96), rgba(9, 10, 8, 0.98));
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
      }

      .journal-card.is-undiscovered {
        gap: 7px;
        opacity: 0.78;
        border-style: dashed;
      }

      .journal-card-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }

      .journal-card h2 {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .rarity-badge {
        flex: 0 0 auto;
        padding: 2px 0 2px 7px;
        border-left: 2px solid currentColor;
        color: #cfe3ef;
        font-size: 0.58rem;
        font-weight: 550;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .rarity-uncommon { color: #8cefc0; }
      .rarity-rare { color: #a5cdff; }
      .rarity-legendary { color: #ffe9ad; }

      .journal-unknown-mark {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border: 1px solid rgba(214, 184, 106, 0.28);
        border-radius: 50%;
        color: var(--gold);
        background: rgba(214, 184, 106, 0.05);
        font-family: var(--font-display);
        font-size: 1.35rem;
        font-weight: 800;
      }

      .journal-discovery-state,
      .journal-source {
        color: var(--ink-faint);
        font-size: 0.68rem;
        letter-spacing: 0.04em;
      }

      .journal-discovery-state {
        color: var(--gold);
        font-weight: 700;
        text-transform: uppercase;
      }

      .journal-hint {
        color: var(--ink);
        font-size: 0.78rem;
        line-height: 1.45;
      }

      .journal-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        margin: 0;
        padding: 5px 4px;
        list-style: none;
        border: 1px solid rgba(214, 184, 106, 0.16);
        border-radius: 6px;
        background: rgba(214, 184, 106, 0.035);
      }

      .journal-stats li {
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 6px 2px;
        border-right: 1px solid rgba(214, 184, 106, 0.09);
        color: var(--ink-dim);
        font-size: 0.56rem;
        letter-spacing: 0.06em;
        text-align: center;
        text-transform: uppercase;
      }

      .journal-stats li:last-child {
        border-right: 0;
      }

      .journal-stats strong {
        color: #fff;
        font-size: 0.84rem;
        font-variant-numeric: tabular-nums;
      }

      .journal-field-notes {
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.17);
        border-radius: 6px;
        background: rgba(8, 10, 7, 0.96);
      }

      .journal-field-notes summary {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px 10px;
        color: var(--gold);
        font-size: 0.72rem;
        font-weight: 900;
        cursor: pointer;
        list-style: none;
      }

      .journal-field-notes summary::-webkit-details-marker { display: none; }
      .journal-field-notes summary::after { content: "+"; margin-left: auto; color: var(--gold); font-size: 1rem; }
      .journal-field-notes[open] summary::after { content: "–"; }

      .journal-field-notes-body {
        display: grid;
        gap: 9px;
        padding: 10px;
        border-top: 1px solid rgba(214, 184, 106, 0.14);
      }

      .journal-field-notes-body em {
        color: var(--ink-faint);
        font-size: 0.8rem;
      }

      .journal-bio {
        font-size: 0.78rem;
        line-height: 1.55;
      }

      .journal-facts,
      .journal-record-dates {
        display: grid;
        gap: 7px;
      }

      .journal-record-dates {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding-top: 2px;
      }

      .species-fact {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      .species-fact > span {
        color: var(--ink-faint);
        font-size: 0.61rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .species-fact > p {
        color: var(--ink);
        font-size: 0.74rem;
        line-height: 1.45;
      }

      .journal-source {
        margin: 0;
        line-height: 1.4;
      }

      .journal-source a {
        color: var(--gold);
      }

      @media (min-width: 720px) {
        .journal-grid {
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }
      }

      @media (forced-colors: active) {
        .journal-card,
        .journal-controls,
        .journal-field-notes {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare journal?: FishJournalResponse;
  declare state?: GameStateResponse;
  declare filterMode: JournalFilterMode;
  declare actionPending: boolean;

  constructor() {
    super();
    this.filterMode = "all";
    this.actionPending = false;
  }

  private speciesFact(label: string, value: string) {
    return html`<div class="species-fact"><span>${label}</span><p>${value}</p></div>`;
  }

  private discoveredCard(entry: JournalEntry) {
    const species = entry.species;
    return html`<article class="journal-card" data-species-id=${species.id}><div class="journal-card-top"><h2>${species.commonName}</h2><span class="rarity-badge rarity-${species.rarity}">${capitalize(species.rarity)}</span></div><fish-image .species=${species}></fish-image><ul class="journal-stats"><li><span>Caught</span><strong>${entry.timesCaught.toLocaleString()}</strong></li><li><span>Largest</span><strong>${entry.heaviestWeightKg !== null ? `${entry.heaviestWeightKg.toFixed(2)} kg` : "—"}</strong></li><li><span>Longest</span><strong>${entry.longestLengthCm !== null ? `${entry.longestLengthCm} cm` : "—"}</strong></li><li><span>Best sale</span><strong>${entry.bestSaleValueCoins !== null ? entry.bestSaleValueCoins.toLocaleString() : "—"}</strong></li></ul><details class="journal-field-notes"><summary>${icon("book")}<span>Field notes</span></summary><div class="journal-field-notes-body"><em>${species.scientificName}</em><p class="journal-bio">${species.description}</p><div class="journal-facts">${this.speciesFact("Habitat", species.habitat)}${this.speciesFact("Native range", species.nativeRange)}</div><div class="journal-record-dates">${this.speciesFact("Discovered", formatDate(entry.firstCaughtAt))}${this.speciesFact("Last caught", formatDate(entry.lastCaughtAt))}</div><p class="journal-source">Source: <a href=${species.source.url} target="_blank" rel="noopener noreferrer">${species.source.name}</a></p></div></details></article>`;
  }

  render() {
    const journal = this.journal;
    const state = this.state;
    if (!journal || !state) return html``;
    const discovered = journal.entries.filter((entry) => entry.discovered);
    const visibleEntries = journal.entries.filter((entry) => this.filterMode === "all" || (this.filterMode === "discovered" ? entry.discovered : !entry.discovered));
    return html`
      <section class="screen journal-screen" data-testid="journal-screen">
        <div class="dashboard-header"><div><span class="eyebrow">Fish journal</span><h1>${discovered.length} of ${journal.entries.length} species discovered</h1></div></div>
        <div class="journal-controls"><label class="muted" for="journal-filter">Show</label><select class="sort-select" id="journal-filter" .value=${this.filterMode} ?disabled=${this.actionPending} @change=${(event: Event) => emitUiEvent(this, "ui:journal-filter", { mode: (event.target as HTMLSelectElement).value as JournalFilterMode })}><option value="all">All species (${journal.entries.length})</option><option value="discovered">Discovered (${discovered.length})</option><option value="undiscovered">Undiscovered (${journal.entries.length - discovered.length})</option></select><span class="muted">${visibleEntries.length} shown</span></div>
        ${visibleEntries.length === 0
          ? html`<div class="empty-state"><p class="empty-message">${this.filterMode === "discovered" ? "No species discovered yet. Start with the beginner water and make your first cast." : "Every species is already recorded in your journal."}</p>${this.filterMode === "discovered" ? html`<button class="primary-action empty-state-action" type="button" @click=${() => emitUiEvent(this, "ui:go-fishing", undefined)}>${icon("waves")}<span>Go fishing</span></button>` : html`<span class="muted">Use the filter above to review every entry.</span>`}</div>`
          : html`<div class="journal-grid">${visibleEntries.map((entry) => entry.discovered ? this.discoveredCard(entry) : html`<article class="journal-card is-undiscovered" data-species-id=${entry.species.id}><div class="journal-card-top"><h2>Undiscovered species</h2><span class="rarity-badge rarity-${entry.species.rarity}">${capitalize(entry.species.rarity)}</span></div><span class="journal-unknown-mark">?</span><span class="journal-discovery-state">Field notes locked</span><p class="journal-hint">${journalDiscoveryHint(state, entry.species)}</p><p class="muted">Land one catch to reveal this species.</p></article>`)}</div>`}
      </section>
    `;
  }
}

customElements.define("journal-screen", JournalScreenElement);
