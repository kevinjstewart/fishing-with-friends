import type { GameStateResponse, LocationAvailability, SelectEquipmentRequest } from "@fishing/shared/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared-ui/icons";
import type { ShopCategory } from "../../ui/types";
import { CastBar, type RestockCategory } from "./CastBar";
import { GearDock } from "./GearDock";
import { LocationCarousel } from "./LocationCarousel";
import { useLakesMutations, type LakesMutationApi } from "./mutations";
import "./lakes.css";

interface LakesFeedback {
  state: "loading" | "ready" | "error";
  message: string;
  retry?: () => void;
  retryLabel?: string;
}

export interface LakesScreenProps {
  state: GameStateResponse;
  api: LakesMutationApi;
  onOpenShop: (category: ShopCategory) => void;
  onEncounterStarted: (encounter: NonNullable<Awaited<ReturnType<LakesMutationApi["startFishing"]>>>) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function firstLocation(state: GameStateResponse): LocationAvailability | undefined {
  return state.locations.find((location) => location.unlocked) ?? state.locations[0];
}

export function LakesScreen({ state, api, onOpenShop, onEncounterStarted }: LakesScreenProps) {
  const [selectedLocationId, setSelectedLocationId] = useState(() => firstLocation(state)?.id ?? "");
  const [feedback, setFeedback] = useState<LakesFeedback>();
  const mutations = useLakesMutations(api);

  useEffect(() => {
    if (state.locations.some((location) => location.id === selectedLocationId)) return;
    setSelectedLocationId(firstLocation(state)?.id ?? "");
  }, [selectedLocationId, state]);

  const selected = useMemo(
    () => state.locations.find((location) => location.id === selectedLocationId) ?? firstLocation(state),
    [selectedLocationId, state],
  );

  const retryRefresh = useCallback(() => {
    setFeedback({ state: "loading", message: "Refreshing your tackle…" });
    void mutations.refreshAuthoritativeState().then(
      () => setFeedback({ state: "ready", message: "Tackle and lake access are up to date." }),
      (error: unknown) => setFeedback({ state: "error", message: errorMessage(error, "Unable to refresh your tackle."), retry: retryRefresh, retryLabel: "Retry refresh" }),
    );
  }, [mutations]);

  const runEquipmentSelection = useCallback((input: SelectEquipmentRequest) => {
    const request = mutations.executeEquipment(input);
    if (!request) return;
    setFeedback({ state: "loading", message: "Swapping tackle…" });
    void request.then((outcome) => {
      if (outcome.operationError) {
        setFeedback({ state: "error", message: errorMessage(outcome.operationError, "Unable to change that tackle."), retry: () => runEquipmentSelection(input), retryLabel: "Retry selection" });
        return;
      }
      if (outcome.reconciliationError) {
        setFeedback({ state: "error", message: "Tackle changed, but account data could not be refreshed.", retry: retryRefresh, retryLabel: "Retry refresh" });
        return;
      }
      setFeedback({ state: "ready", message: "Tackle updated." });
    });
  }, [mutations, retryRefresh]);

  const runRecovery = useCallback(() => {
    const request = mutations.executeRecovery();
    if (!request) return;
    setFeedback({ state: "loading", message: "Checking the shallows…" });
    void request.then((outcome) => {
      if (outcome.operationError) {
        setFeedback({ state: "error", message: errorMessage(outcome.operationError, "Unable to recover tackle."), retry: runRecovery, retryLabel: "Retry recovery" });
        return;
      }
      if (outcome.reconciliationError) {
        setFeedback({ state: "error", message: "Recovery completed, but account data could not be refreshed.", retry: retryRefresh, retryLabel: "Retry refresh" });
        return;
      }
      const restored: string[] = [];
      if (outcome.response?.wormsGranted) restored.push(`+${outcome.response.wormsGranted} worms`);
      if (outcome.response?.lureRestored) restored.push("spinner restored");
      setFeedback({ state: "ready", message: restored.length > 0 ? `Emergency tackle: ${restored.join(", ")}.` : "Emergency tackle restored." });
    });
  }, [mutations, retryRefresh]);

  const runCast = useCallback((locationId: string) => {
    const request = mutations.executeCast(locationId, state.activeEquipment);
    if (!request) return;
    setFeedback({ state: "loading", message: "Sending your cast…" });
    void request.then((outcome) => {
      if (outcome.encounter) {
        setFeedback(undefined);
        onEncounterStarted(outcome.encounter);
        return;
      }
      if (outcome.resumedEncounter) {
        setFeedback(undefined);
        onEncounterStarted(outcome.resumedEncounter);
        return;
      }
      const message = outcome.expired
        ? "Your previous encounter expired. No new cast was started; check your tackle and try again."
        : outcome.reconciliationError
          ? "The cast was not confirmed. Your account was refreshed; try casting again."
          : errorMessage(outcome.operationError, "The cast was not sent. Try casting again.");
      setFeedback({ state: "error", message, retry: () => runCast(locationId), retryLabel: "Try casting again" });
    });
  }, [mutations, onEncounterStarted, state.activeEquipment]);

  if (!selected) return null;

  const totalUsableBait = state.inventory.baits.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const hasUsableLure = state.inventory.lures.some((item) => item.quantity > 0 && (item.durability ?? 0) >= 1);
  const wormPrice = state.catalog.baits.find((bait) => bait.id === "worm")?.priceCoins ?? 8;
  const stuck = state.coins < wormPrice && (totalUsableBait === 0 || !hasUsableLure);
  const openShop = (category: ShopCategory | RestockCategory) => onOpenShop(category);

  return (
    <>
      <section className="screen lakes-screen" data-testid="lakes-screen">
        <header className="screen-hero">
          <div className="screen-hero-text"><span className="eyebrow">Choose your water</span><h1>{selected.name}</h1></div>
          <span className="hero-value" aria-label={`Typical catch value: ${selected.expectedValueMinCoins.toLocaleString()}–${selected.expectedValueMaxCoins.toLocaleString()} coins`}><Icon name="coin" /><span>{selected.expectedValueMinCoins.toLocaleString()}–{selected.expectedValueMaxCoins.toLocaleString()}</span></span>
        </header>
        <GearDock state={state} actionPending={Boolean(mutations.pendingAction)} onSelectEquipment={runEquipmentSelection} />
        <LocationCarousel state={state} selectedLocationId={selected.id} onSelect={(location) => setSelectedLocationId(location.id)} onOpenShop={() => openShop("boats")} />
        {stuck ? (
          <aside className="recovery-banner">
            <div><strong>Out of tackle?</strong><p>You can dig the shallows for worms and untangle your old spinner to keep fishing.</p></div>
            <button className="secondary-action" type="button" disabled={Boolean(mutations.pendingAction)} aria-disabled={Boolean(mutations.pendingAction)} onClick={runRecovery}>Dig for worms</button>
          </aside>
        ) : null}
        {feedback ? <div className={`lakes-feedback is-${feedback.state}`} data-testid="mutation-feedback" role={feedback.state === "error" ? "alert" : "status"} aria-live={feedback.state === "error" ? "assertive" : "polite"}><span>{feedback.message}</span>{feedback.retry ? <button className="secondary-action" type="button" onClick={feedback.retry}>{feedback.retryLabel ?? "Try again"}</button> : null}</div> : null}
      </section>
      <CastBar state={state} location={selected} actionPending={Boolean(mutations.pendingAction)} onCast={() => runCast(selected.id)} onOpenShop={openShop} />
    </>
  );
}
