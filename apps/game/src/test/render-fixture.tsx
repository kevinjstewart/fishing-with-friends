import { createRoot, type Root } from "react-dom/client";
import type { CatchDecisionResponse, CompleteFishingResponse, GameStateResponse } from "@fishing/shared/contracts";
import { GameTabbar } from "../features/chrome/GameTabbar";
import { GameTopbar } from "../features/chrome/GameTopbar";
import { RetryPanel } from "../features/chrome/ScreenStatus";
import { CatchResult, DecisionResult } from "../features/encounter/CatchResult";
import type { ReactNode } from "react";
import "../app/react-shell.css";

export type EncounterFixtureView = "catch" | "lost" | "broken-rod" | "decision-keep" | "decision-sell" | "retry";

export interface EncounterFixtureOptions {
  gameState: GameStateResponse;
  view: EncounterFixtureView;
  result?: CompleteFishingResponse;
  decision?: CatchDecisionResponse;
  resultOptions?: { outcome?: "caught" | "lost"; rodBroke?: boolean };
}

let fixtureRoot: Root | undefined;

function defaultResult(options: EncounterFixtureOptions): CompleteFishingResponse {
  const species = options.gameState.catalog.fish[0];
  const location = options.gameState.locations.find((candidate) => candidate.id === species.availableLocationIds[0]) ?? options.gameState.locations[0];
  if (!species || !location) throw new Error("The encounter fixture needs one fish and one location.");
  const lost = options.view === "lost" || options.resultOptions?.outcome === "lost";
  const rodBroke = options.view === "broken-rod" || Boolean(options.resultOptions?.rodBroke);
  const specimen = {
    id: "fixture-catch",
    speciesId: species.id,
    species,
    weightKg: species.typicalWeightKg * 1.35,
    lengthCm: Math.round(species.typicalLengthCm * 1.2),
    quality: "trophy" as const,
    saleValueCoins: 184,
    caughtAt: "2026-01-01T12:00:00.000Z",
    locationId: location.id,
    locationName: location.name,
  };
  return {
    outcome: lost ? "lost" : "caught",
    message: lost ? "One last run shook the hook free." : "A clean fight and a beautiful fish.",
    species,
    rodId: options.gameState.activeEquipment.rodId,
    rodRiskBand: rodBroke ? "high" : "low",
    rodBreakChancePercent: rodBroke ? 27.5 : 0.25,
    catch: lost ? null : specimen,
    rodBroke,
    replacementRodId: rodBroke ? options.gameState.catalog.rods[1]?.id ?? null : null,
  };
}

function defaultDecision(options: EncounterFixtureOptions, result: CompleteFishingResponse): CatchDecisionResponse {
  if (!result.catch) throw new Error("The decision fixture needs a caught specimen.");
  const sell = options.view === "decision-sell";
  return { decision: sell ? "sell" : "keep", coins: sell ? options.gameState.coins + result.catch.saleValueCoins : options.gameState.coins, catch: result.catch };
}

function FixtureShell({ options, children }: { options: EncounterFixtureOptions; children: ReactNode }) {
  return (
    <div className="react-app-shell" data-testid="react-fixture-shell">
      <div className="app-frame" data-testid="app-frame" data-toast-visible="false" data-view="catch">
        <GameTopbar coins={options.gameState.coins} onShop={() => {}} />
        <main className="app-content" data-testid="app-content" data-view="catch">{children}</main>
        <GameTabbar activeScreen="lakes" navEnabled onNavigate={() => {}} />
      </div>
    </div>
  );
}

export function renderEncounterFixture(options: EncounterFixtureOptions): void {
  const rootElement = document.querySelector<HTMLElement>("#ui-root");
  if (!rootElement) throw new Error("UI root is missing.");
  if (!fixtureRoot) {
    // The fixture runs against the legacy page so the production Lit shell can
    // stay intact while this test-only React surface owns the host element.
    rootElement.replaceChildren();
    fixtureRoot = createRoot(rootElement);
  }
  const result = options.result ?? defaultResult(options);
  const decision = options.decision ?? (options.view === "decision-keep" || options.view === "decision-sell" ? defaultDecision(options, result) : undefined);
  const content = options.view === "retry" ? (
    <RetryPanel
      eyebrow="Catch choice not saved"
      message="Your connection dropped. Your catch is still waiting for a Keep or Sell choice."
      retryLabel="Retry choice"
      onRetry={() => {}}
      onBack={() => {}}
    />
  ) : decision ? (
    <DecisionResult decision={decision} onBack={() => {}} />
  ) : (
    <CatchResult result={result} gameState={options.gameState} actionPending={false} onDecision={() => {}} onBack={() => {}} />
  );
  fixtureRoot.render(<FixtureShell options={options}>{content}</FixtureShell>);
}

export function unmountEncounterFixture(): void {
  fixtureRoot?.unmount();
  fixtureRoot = undefined;
}
