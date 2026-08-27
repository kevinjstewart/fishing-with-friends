import type { CollectionResponse, FishSpecimen } from "@fishing/shared/contracts";
import { LitElement, html, css, nothing } from "lit";
import { icon } from "../icons";
import { emitUiEvent, type CollectionSortMode } from "../types";
import { capitalize, collectionSorters, formatCoins } from "../presenters";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";
import "../fish-images";
import "./specimen-details";

export class CollectionScreenElement extends LitElement {
  static properties = {
    collection: { attribute: false },
    sortMode: { type: String },
    sellAllConfirming: { type: Boolean },
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

      .collection-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .collection-actions .secondary-action {
        width: auto;
        flex: 1;
        white-space: nowrap;
      }

      .collection-actions .is-confirming {
        border-color: rgba(255, 143, 125, 0.56);
        color: #ffd2cb;
        background: rgba(185, 66, 62, 0.22);
      }

      .collection-actions .collection-cancel {
        flex: 0 0 auto;
      }

      .sort-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 0.8rem;
      }

      .sort-row .sort-select {
        min-width: 160px;
      }

      .collection-grid {
        display: grid;
        gap: 10px;
      }

      .collection-card {
        display: grid;
        gap: 9px;
        align-content: start;
        padding: 14px;
        border: 1px solid rgba(214, 184, 106, 0.19);
        border-radius: 9px;
        background: linear-gradient(145deg, rgba(19, 22, 17, 0.96), rgba(9, 10, 8, 0.98));
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
      }

      .collection-card-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }

      .collection-card h2 {
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

      .collection-species-info {
        border-top: 1px solid rgba(214, 184, 106, 0.16);
        padding-top: 7px;
      }

      .collection-species-info summary {
        color: var(--ink-dim);
        cursor: pointer;
        font-size: 0.72rem;
        list-style-position: inside;
      }

      .collection-species-notes {
        display: grid;
        gap: 7px;
        padding-top: 8px;
      }

      .collection-description {
        color: var(--ink-dim);
        font-size: 0.74rem;
        line-height: 1.45;
      }

      .species-fact {
        display: grid;
        gap: 2px;
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
        color: var(--ink-faint);
        font-size: 0.68rem;
        line-height: 1.4;
      }

      .journal-source a {
        color: var(--gold);
      }

      .sell-action {
        width: 100%;
      }

      .sell-action .icon {
        stroke: var(--gold);
      }

      @media (min-width: 720px) {
        .collection-grid {
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }
      }
    `,
  ];

  declare collection?: CollectionResponse;
  declare sortMode: CollectionSortMode;
  declare sellAllConfirming: boolean;
  declare actionPending: boolean;

  constructor() {
    super();
    this.sortMode = "newest";
    this.sellAllConfirming = false;
    this.actionPending = false;
  }

  private goFishing(): void {
    if (!this.actionPending) emitUiEvent(this, "ui:go-fishing", undefined);
  }

  private renderSpecimenNotes(specimen: FishSpecimen) {
    return html`<details class="collection-species-info"><summary>${specimen.species.scientificName}</summary><div class="collection-species-notes">
      <p class="collection-description">${specimen.species.description}</p>
      ${this.speciesFact("Habitat", specimen.species.habitat)}
      ${this.speciesFact("Native range", specimen.species.nativeRange)}
      <p class="journal-source">Source: <a href=${specimen.species.source.url} target="_blank" rel="noopener noreferrer">${specimen.species.source.name}</a></p>
    </div></details>`;
  }

  private speciesFact(label: string, value: string) {
    return html`<div class="species-fact"><span>${label}</span><p>${value}</p></div>`;
  }

  render() {
    const collection = this.collection;
    if (!collection) return html``;
    const specimens = [...collection.fish].sort(collectionSorters[this.sortMode]);
    return html`
      <section class="screen collection-screen" data-testid="collection-screen">
        <div class="dashboard-header"><div><span class="eyebrow">Your collection</span><h1>Kept fish${specimens.length ? ` (${specimens.length})` : ""}</h1></div></div>
        ${specimens.length === 0
          ? html`<div class="empty-state"><p class="empty-message">No kept fish yet. Land a catch and choose “Keep fish” to start your collection.</p><button class="primary-action empty-state-action" type="button" ?disabled=${this.actionPending} @click=${this.goFishing}>${icon("waves")}<span>Go fishing</span></button></div>`
          : html`
              <div class="collection-actions">
                <button class="secondary-action ${this.sellAllConfirming ? "is-confirming" : ""}" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} aria-label=${this.sellAllConfirming ? `Confirm selling all ${specimens.length} fish for ${formatCoins(collection.fish.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0))} coins` : `Sell all ${specimens.length} fish for ${formatCoins(collection.fish.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0))} coins`} @click=${() => this.sellAllConfirming ? emitUiEvent(this, "ui:sell-all", undefined) : emitUiEvent(this, "ui:collection-confirm", undefined)}>${this.sellAllConfirming ? `Confirm: sell ${specimens.length} fish for ${formatCoins(collection.fish.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0))} coins` : `Sell all · ${formatCoins(collection.fish.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0))} coins`}</button>
                ${this.sellAllConfirming ? html`<button class="secondary-action collection-cancel" type="button" ?disabled=${this.actionPending} @click=${() => emitUiEvent(this, "ui:collection-cancel", undefined)}>Cancel</button>` : nothing}
              </div>
              <div class="sort-row"><label class="muted" for="collection-sort">Sort collection</label><select class="sort-select" id="collection-sort" .value=${this.sortMode} ?disabled=${this.actionPending} @change=${(event: Event) => emitUiEvent(this, "ui:collection-sort", { mode: (event.target as HTMLSelectElement).value as CollectionSortMode })}><option value="newest">Newest</option><option value="heaviest">Heaviest</option><option value="value">Most valuable</option><option value="species">Species</option></select></div>
              <div class="collection-grid">
                ${specimens.map((specimen) => html`<article class="collection-card" data-species-id=${specimen.speciesId}><div class="collection-card-top"><h2>${specimen.species.commonName}</h2><span class="rarity-badge rarity-${specimen.species.rarity}">${capitalize(specimen.species.rarity)}</span></div><fish-image .species=${specimen.species}></fish-image>${this.renderSpecimenNotes(specimen)}<button class="secondary-action sell-action" type="button" ?disabled=${this.actionPending} aria-disabled=${String(this.actionPending)} @click=${() => emitUiEvent(this, "ui:sell-catch", { catchId: specimen.id })}>${icon("coin")}<span>Sell ${formatCoins(specimen.saleValueCoins)}</span></button><specimen-details .specimen=${specimen}></specimen-details></article>`)}
              </div>
            `}
      </section>
    `;
  }
}

customElements.define("collection-screen", CollectionScreenElement);
