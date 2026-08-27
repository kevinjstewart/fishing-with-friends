import type { GameStateResponse, PurchaseRequest } from "@fishing/shared/contracts";
import { useCallback, useMemo, useState } from "react";
import { Icon, type IconName } from "../../shared-ui/icons";
import { formatCoins } from "../../shared-ui/presenters";
import type { ShopCategory } from "../../ui/types";
import { ShopItem, type ShopDefinition } from "./ShopItem";
import { usePurchaseMutation, type PurchaseApi } from "./mutations";
import "./shop.css";

const CATEGORIES: Array<{ id: ShopCategory; label: string; icon: IconName }> = [
  { id: "bait", label: "Bait", icon: "bait" },
  { id: "lures", label: "Lures", icon: "lure" },
  { id: "rods", label: "Rods", icon: "rod" },
  { id: "boats", label: "Boats", icon: "anchor" },
];

interface ShopFeedback {
  state: "loading" | "ready" | "error";
  message: string;
  retry?: () => void;
  retryLabel?: string;
}

export interface ShopScreenProps {
  state: GameStateResponse;
  api: PurchaseApi;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete that purchase.";
}

function itemsForCategory(state: GameStateResponse, category: ShopCategory): ShopDefinition[] {
  if (category === "bait") return state.catalog.baits;
  if (category === "lures") return state.catalog.lures;
  if (category === "rods") return state.catalog.rods;
  return state.catalog.boats;
}

export function ShopScreen({ state, api }: ShopScreenProps) {
  const [category, setCategory] = useState<ShopCategory>("bait");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<ShopFeedback>();
  const purchase = usePurchaseMutation(api);
  const items = useMemo(() => itemsForCategory(state, category), [category, state]);

  const retryRefresh = useCallback(() => {
    setFeedback({ state: "loading", message: "Refreshing your account…" });
    void purchase.refreshAuthoritativeState().then(
      () => setFeedback({ state: "ready", message: "Wallet and inventory are up to date." }),
      (error: unknown) => setFeedback({ state: "error", message: errorMessage(error), retry: retryRefresh, retryLabel: "Retry refresh" }),
    );
  }, [purchase]);

  const runPurchase = useCallback((input: PurchaseRequest) => {
    const request = purchase.execute(input);
    if (!request) return;
    setFeedback({ state: "loading", message: "Buying…" });
    void request.then(
      (outcome) => {
        if (input.quantity !== undefined) setQuantities((current) => ({ ...current, [input.itemId]: 1 }));
        if (outcome.reconciliationError) {
          setFeedback({ state: "error", message: "Purchase completed, but account data could not be refreshed.", retry: retryRefresh, retryLabel: "Retry refresh" });
          return;
        }
        setFeedback({ state: "ready", message: `Purchased ${input.itemId.replace(/-/g, " ")}` });
      },
      (error: unknown) => setFeedback({ state: "error", message: errorMessage(error), retry: () => runPurchase(input), retryLabel: "Retry purchase" }),
    );
  }, [purchase, retryRefresh]);

  return (
    <section className="screen shop-screen" data-testid="shop-screen">
      <header className="screen-hero">
        <div className="screen-hero-text"><span className="eyebrow">Club outfitter</span><h1>The Tackle Room</h1></div>
        <span className="hero-value" aria-label={`Coins available: ${formatCoins(state.coins)}`}><Icon name="coin" /><span>{formatCoins(state.coins)}</span></span>
      </header>
      <div className="shop-tabs" role="tablist" aria-label="Shop categories">
        {CATEGORIES.map((entry) => {
          const active = category === entry.id;
          return <button key={entry.id} className={`shop-tab ${active ? "is-active" : ""}`} type="button" role="tab" aria-selected={active} aria-controls="shop-items-panel" onClick={() => setCategory(entry.id)}><Icon name={entry.icon} /><span>{entry.label}</span></button>;
        })}
      </div>
      {feedback ? <div className={`shop-feedback is-${feedback.state}`} data-testid="mutation-feedback" role={feedback.state === "error" ? "alert" : "status"} aria-live={feedback.state === "error" ? "assertive" : "polite"}><span>{feedback.message}</span>{feedback.retry ? <button className="secondary-action" type="button" onClick={feedback.retry}>{feedback.retryLabel ?? "Retry purchase"}</button> : null}</div> : null}
      <div className="shop-list" id="shop-items-panel" role="tabpanel" aria-label={`${category} shop items`}>
        {items.map((item) => <ShopItem key={item.id} state={state} item={item} category={category} quantity={quantities[item.id] ?? 1} purchasePending={purchase.pending} onQuantityChange={(itemId, quantity) => setQuantities((current) => ({ ...current, [itemId]: quantity }))} onPurchase={runPurchase} />)}
      </div>
    </section>
  );
}
