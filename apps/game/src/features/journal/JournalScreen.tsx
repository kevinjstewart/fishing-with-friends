import type { FishJournalResponse, GameStateResponse, JournalEntry } from "@fishing/shared/contracts";
import { useState, type ChangeEvent } from "react";
import { Icon } from "../../shared-ui/icons";
import { FishImage } from "../../shared-ui/FishImage";
import { capitalize, formatDate, journalDiscoveryHint } from "../../shared-ui/presenters";
import type { JournalFilterMode } from "../../ui/types";

export interface JournalScreenProps {
  journal: FishJournalResponse;
  state: GameStateResponse;
  actionPending?: boolean;
  onGoFishing: () => void;
}

export function JournalScreen({ journal, state, actionPending = false, onGoFishing }: JournalScreenProps) {
  const [filterMode, setFilterMode] = useState<JournalFilterMode>("all");
  const discovered = journal.entries.filter((entry) => entry.discovered);
  const visibleEntries = journal.entries.filter((entry) => filterMode === "all" || (filterMode === "discovered" ? entry.discovered : !entry.discovered));

  return (
    <section className="screen journal-screen" data-testid="journal-screen">
      <div className="dashboard-header"><div><span className="eyebrow">Fish journal</span><h1>{discovered.length} of {journal.entries.length} species discovered</h1></div></div>
      <div className="journal-controls">
        <label className="muted" htmlFor="journal-filter">Show</label>
        <select className="sort-select" id="journal-filter" value={filterMode} disabled={actionPending} onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilterMode(event.target.value as JournalFilterMode)}>
          <option value="all">All species ({journal.entries.length})</option>
          <option value="discovered">Discovered ({discovered.length})</option>
          <option value="undiscovered">Undiscovered ({journal.entries.length - discovered.length})</option>
        </select>
        <span className="muted">{visibleEntries.length} shown</span>
      </div>
      {visibleEntries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-message">{filterMode === "discovered" ? "No species discovered yet. Start with the beginner water and make your first cast." : "Every species is already recorded in your journal."}</p>
          {filterMode === "discovered" ? <button className="primary-action empty-state-action" type="button" disabled={actionPending} onClick={onGoFishing}><Icon name="waves" /><span>Go fishing</span></button> : <span className="muted">Use the filter above to review every entry.</span>}
        </div>
      ) : (
        <div className="journal-grid">
          {visibleEntries.map((entry) => entry.discovered ? <DiscoveredJournalCard key={entry.species.id} entry={entry} /> : <UndiscoveredJournalCard key={entry.species.id} entry={entry} state={state} />)}
        </div>
      )}
    </section>
  );
}

function DiscoveredJournalCard({ entry }: { entry: JournalEntry }) {
  const species = entry.species;
  return (
    <article className="journal-card" data-species-id={species.id}>
      <div className="journal-card-top"><h2>{species.commonName}</h2><span className={`rarity-badge rarity-${species.rarity}`}>{capitalize(species.rarity)}</span></div>
      <FishImage species={species} />
      <ul className="journal-stats">
        <li><span>Caught</span><strong>{entry.timesCaught.toLocaleString()}</strong></li>
        <li><span>Largest</span><strong>{entry.heaviestWeightKg !== null ? `${entry.heaviestWeightKg.toFixed(2)} kg` : "—"}</strong></li>
        <li><span>Longest</span><strong>{entry.longestLengthCm !== null ? `${entry.longestLengthCm} cm` : "—"}</strong></li>
        <li><span>Best sale</span><strong>{entry.bestSaleValueCoins !== null ? entry.bestSaleValueCoins.toLocaleString() : "—"}</strong></li>
      </ul>
      <details className="journal-field-notes">
        <summary><Icon name="book" /><span>Field notes</span></summary>
        <div className="journal-field-notes-body">
          <em>{species.scientificName}</em>
          <p className="journal-bio">{species.description}</p>
          <div className="journal-facts"><SpeciesFact label="Habitat" value={species.habitat} /><SpeciesFact label="Native range" value={species.nativeRange} /></div>
          <div className="journal-record-dates"><SpeciesFact label="Discovered" value={formatDate(entry.firstCaughtAt)} /><SpeciesFact label="Last caught" value={formatDate(entry.lastCaughtAt)} /></div>
          <p className="journal-source">Source: <a href={species.source.url} target="_blank" rel="noopener noreferrer">{species.source.name}</a></p>
        </div>
      </details>
    </article>
  );
}

function UndiscoveredJournalCard({ entry, state }: { entry: JournalEntry; state: GameStateResponse }) {
  const species = entry.species;
  return (
    <article className="journal-card is-undiscovered" data-species-id={species.id}>
      <div className="journal-card-top"><h2>Undiscovered species</h2><span className={`rarity-badge rarity-${species.rarity}`}>{capitalize(species.rarity)}</span></div>
      <span className="journal-unknown-mark">?</span>
      <span className="journal-discovery-state">Field notes locked</span>
      <p className="journal-hint">{journalDiscoveryHint(state, species)}</p>
      <p className="muted">Land one catch to reveal this species.</p>
    </article>
  );
}

function SpeciesFact({ label, value }: { label: string; value: string }) {
  return <div className="species-fact"><span>{label}</span><p>{value}</p></div>;
}
