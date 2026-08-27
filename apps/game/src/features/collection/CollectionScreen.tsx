import type { CollectionResponse, FishSpecimen } from "@fishing/shared/contracts";
import { useMemo, useState } from "react";
import { Icon } from "../../shared-ui/icons";
import { FishImage } from "../../shared-ui/FishImage";
import { SpecimenDetails } from "../../shared-ui/SpecimenDetails";
import { capitalize, collectionSorters, formatCoins } from "../../shared-ui/presenters";
import type { CollectionSortMode } from "../../ui/types";
import type { CollectionMutationApi, CollectionReconciliation, SellAllOutcome, SellOneOutcome } from "./mutations";
import { useCollectionMutations } from "./mutations";
import "./collection.css";

interface CollectionFeedback {
  state: "loading" | "ready" | "error";
  message: string;
  retry?: () => void;
  retryLabel?: string;
}

export interface CollectionScreenProps {
  collection: CollectionResponse;
  api: CollectionMutationApi;
  onGoFishing: () => void;
}

function errorMessage(error: unknown, fallback = "Unable to sell that fish."): string {
  return error instanceof Error ? error.message : fallback;
}

function reconciliationComplete(reconciliation: CollectionReconciliation): boolean {
  return Boolean(reconciliation.collection && reconciliation.gameState && reconciliation.leaderboard && reconciliation.errors.length === 0);
}

function reconciliationNote(reconciliation: CollectionReconciliation): string {
  return reconciliationComplete(reconciliation)
    ? " Wallet and collection are up to date."
    : " Sale outcome confirmed; refresh failed, so retry shortly.";
}

function renderSellAllOutcome(outcome: SellAllOutcome, retrySale: () => void, retryRefresh: () => void): CollectionFeedback {
  const { before, reconciliation, operationError } = outcome;
  if (!before || !reconciliation.collection) {
    return {
      state: "error",
      message: errorMessage(operationError, "Unable to confirm the sale. Retry when your connection is stable."),
      retry: operationError ? retrySale : retryRefresh,
      retryLabel: operationError ? "Retry sell all" : "Retry refresh",
    };
  }

  const remainingIds = new Set(reconciliation.collection.fish.map((specimen) => specimen.id));
  const sold = before.fish.filter((specimen) => !remainingIds.has(specimen.id));
  const soldValue = sold.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0);
  const complete = sold.length === before.fish.length;
  const note = reconciliationNote(reconciliation);
  if (complete) {
    return {
      state: reconciliationComplete(reconciliation) ? "ready" : "error",
      message: sold.length > 0 ? `Sold ${sold.length} fish for ${soldValue.toLocaleString()} coins.${note}` : "No fish to sell.",
      retry: reconciliationComplete(reconciliation) ? undefined : retryRefresh,
      retryLabel: "Retry refresh",
    };
  }

  const errorText = operationError instanceof Error ? ` ${operationError.message}` : "";
  return {
    state: reconciliationComplete(reconciliation) ? "ready" : "error",
    message: `Sold ${sold.length} of ${before.fish.length} fish for ${soldValue.toLocaleString()} coins.${errorText}${note}`,
    retry: reconciliationComplete(reconciliation) ? retrySale : retryRefresh,
    retryLabel: reconciliationComplete(reconciliation) ? "Retry sell all" : "Retry refresh",
  };
}

function renderSellOneOutcome(outcome: SellOneOutcome, catchId: string, retrySale: () => void, retryRefresh: () => void): CollectionFeedback {
  const { before, result, reconciliation, operationError } = outcome;
  const stillListed = reconciliation.collection?.fish.some((specimen) => specimen.id === catchId) ?? true;
  if (operationError && stillListed) {
    return { state: "error", message: errorMessage(operationError), retry: retrySale, retryLabel: "Retry sale" };
  }
  if (operationError && !stillListed) {
    const soldSpecimen = before?.fish.find((specimen) => specimen.id === catchId);
    return {
      state: reconciliationComplete(reconciliation) ? "ready" : "error",
      message: `Sale confirmed${soldSpecimen ? ` for ${soldSpecimen.saleValueCoins.toLocaleString()} coins` : ""}.${reconciliationNote(reconciliation)}`,
      retry: reconciliationComplete(reconciliation) ? undefined : retryRefresh,
      retryLabel: "Retry refresh",
    };
  }
  if (!result) return { state: "error", message: "Unable to confirm the sale. Retry when your connection is stable.", retry: retryRefresh, retryLabel: "Retry refresh" };
  return {
    state: reconciliationComplete(reconciliation) ? "ready" : "error",
    message: `Sold ${result.catch.species.commonName} for ${result.catch.saleValueCoins.toLocaleString()} coins.${reconciliationNote(reconciliation)}`,
    retry: reconciliationComplete(reconciliation) ? undefined : retryRefresh,
    retryLabel: "Retry refresh",
  };
}

export function CollectionScreen({ collection, api, onGoFishing }: CollectionScreenProps) {
  const [sortMode, setSortMode] = useState<CollectionSortMode>("newest");
  const [sellAllConfirming, setSellAllConfirming] = useState(false);
  const [feedback, setFeedback] = useState<CollectionFeedback>();
  const mutations = useCollectionMutations(api);
  const specimens = useMemo(() => [...collection.fish].sort(collectionSorters[sortMode]), [collection.fish, sortMode]);
  const totalValue = collection.fish.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0);

  const retryRefresh = () => {
    setFeedback({ state: "loading", message: "Refreshing your collection…" });
    void mutations.refreshAuthoritativeState().then((reconciliation) => {
      setFeedback(reconciliationComplete(reconciliation)
        ? { state: "ready", message: "Wallet and collection are up to date." }
        : { state: "error", message: "Some account data could not be refreshed.", retry: retryRefresh, retryLabel: "Retry refresh" });
    });
  };

  const startSellOne = (catchId: string) => {
    const request = mutations.executeSellOne(catchId);
    if (!request) return;
    setFeedback({ state: "loading", message: "Selling the fish…" });
    void request.then(
      (outcome) => setFeedback(renderSellOneOutcome(outcome, catchId, () => startSellOne(catchId), retryRefresh)),
      (error: unknown) => setFeedback({ state: "error", message: errorMessage(error), retry: () => startSellOne(catchId), retryLabel: "Retry sale" }),
    );
  };

  const startSellAll = () => {
    const request = mutations.executeSellAll();
    if (!request) return;
    setSellAllConfirming(false);
    setFeedback({ state: "loading", message: "Selling all fish…" });
    void request.then(
      (outcome) => setFeedback(renderSellAllOutcome(outcome, startSellAll, retryRefresh)),
      (error: unknown) => setFeedback({ state: "error", message: errorMessage(error, "Unable to sell all fish."), retry: startSellAll, retryLabel: "Retry sell all" }),
    );
  };

  const handleSellAllClick = () => {
    if (sellAllConfirming) {
      startSellAll();
      return;
    }
    setFeedback(undefined);
    setSellAllConfirming(true);
  };

  return (
    <section className="screen collection-screen" data-testid="collection-screen">
      <div className="dashboard-header"><div><span className="eyebrow">Your collection</span><h1>Kept fish{specimens.length ? ` (${specimens.length})` : ""}</h1></div></div>
      {feedback ? <div className={`collection-feedback is-${feedback.state}`} data-testid="mutation-feedback" role={feedback.state === "error" ? "alert" : "status"} aria-live={feedback.state === "error" ? "assertive" : "polite"}><span>{feedback.message}</span>{feedback.retry ? <button className="secondary-action" type="button" onClick={feedback.retry}>{feedback.retryLabel ?? "Retry"}</button> : null}</div> : null}
      {specimens.length === 0 ? (
        <div className="empty-state"><p className="empty-message">No kept fish yet. Land a catch and choose “Keep fish” to start your collection.</p><button className="primary-action empty-state-action" type="button" disabled={mutations.pending} aria-disabled={mutations.pending} onClick={onGoFishing}><Icon name="waves" /><span>Go fishing</span></button></div>
      ) : (
        <>
          <div className="collection-actions">
            <button className={`secondary-action ${sellAllConfirming ? "is-confirming" : ""}`} type="button" disabled={mutations.pending} aria-disabled={mutations.pending} aria-label={sellAllConfirming ? `Confirm selling all ${specimens.length} fish for ${formatCoins(totalValue)} coins` : `Sell all ${specimens.length} fish for ${formatCoins(totalValue)} coins`} onClick={handleSellAllClick}>{sellAllConfirming ? `Confirm: sell ${specimens.length} fish for ${formatCoins(totalValue)} coins` : `Sell all · ${formatCoins(totalValue)} coins`}</button>
            {sellAllConfirming ? <button className="secondary-action collection-cancel" type="button" disabled={mutations.pending} aria-disabled={mutations.pending} onClick={() => { setSellAllConfirming(false); setFeedback(undefined); }}>Cancel</button> : null}
          </div>
          <div className="sort-row"><label className="muted" htmlFor="collection-sort">Sort collection</label><select className="sort-select" id="collection-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as CollectionSortMode)}><option value="newest">Newest</option><option value="heaviest">Heaviest</option><option value="value">Most valuable</option><option value="species">Species</option></select></div>
          <div className="collection-grid">
            {specimens.map((specimen) => <article className="collection-card" key={specimen.id} data-species-id={specimen.speciesId} data-catch-id={specimen.id}><div className="collection-card-top"><h2>{specimen.species.commonName}</h2><span className={`rarity-badge rarity-${specimen.species.rarity}`}>{capitalize(specimen.species.rarity)}</span></div><FishImage species={specimen.species} />{renderSpecimenNotes(specimen)}<button className="secondary-action sell-action" type="button" disabled={mutations.pending} aria-disabled={mutations.pending} data-testid="sell-catch" aria-label={`Sell ${specimen.species.commonName} for ${formatCoins(specimen.saleValueCoins)} coins`} onClick={() => startSellOne(specimen.id)}><Icon name="coin" /><span>Sell {formatCoins(specimen.saleValueCoins)}</span></button><SpecimenDetails specimen={specimen} /></article>)}
          </div>
        </>
      )}
    </section>
  );
}

function renderSpecimenNotes(specimen: FishSpecimen) {
  return <details className="collection-species-info"><summary>{specimen.species.scientificName}</summary><div className="collection-species-notes"><p className="collection-description">{specimen.species.description}</p><SpeciesFact label="Habitat" value={specimen.species.habitat} /><SpeciesFact label="Native range" value={specimen.species.nativeRange} /><p className="journal-source">Source: <a href={specimen.species.source.url} target="_blank" rel="noopener noreferrer">{specimen.species.source.name}</a></p></div></details>;
}

function SpeciesFact({ label, value }: { label: string; value: string }) {
  return <div className="species-fact"><span>{label}</span><p>{value}</p></div>;
}
