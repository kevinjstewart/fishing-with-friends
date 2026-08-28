import type { CatchDecisionResponse, CompleteFishingResponse, GameStateResponse } from "@fishing/shared/contracts";
import { Icon } from "../../shared-ui/icons";
import { FishImage } from "../../shared-ui/FishImage";
import { SpecimenDetails } from "../../shared-ui/SpecimenDetails";
import { capitalize, formatCoins, RISK_PRESENTATION, riskLabel } from "../../shared-ui/presenters";
import { CatchDecision } from "./CatchDecision";
import "./encounter.css";

export interface CatchResultProps {
  result: CompleteFishingResponse;
  gameState: GameStateResponse;
  actionPending: boolean;
  onDecision: (decision: "keep" | "sell") => void;
  onBack: () => void;
}
export interface DecisionResultProps {
  decision: CatchDecisionResponse;
  onBack: () => void;
}

function TackleReport({ result, gameState }: { result: CompleteFishingResponse; gameState: GameStateResponse }) {
  const rod = gameState.catalog.rods.find((candidate) => candidate.id === result.rodId);
  const replacementName = result.replacementRodId
    ? gameState.catalog.rods.find((candidate) => candidate.id === result.replacementRodId)?.name
    : undefined;
  return (
    <details className={`result-risk risk-${result.rodRiskBand} ${result.rodBroke ? "did-break" : ""}`} open={result.rodBroke}>
      <summary>
        <span className="tackle-report-label"><Icon name="rod" /><span>{result.rodBroke ? "Rod snapped" : "Tackle report"}</span></span>
        <strong>{result.rodBroke ? "Action needed" : riskLabel(result.rodRiskBand)}</strong>
      </summary>
      <div className="tackle-report-body">
        <p>{rod?.name ?? "Your rod"} faced a {result.rodBreakChancePercent.toFixed(2)}% break chance.</p>
        <span className="result-risk-consequence">{result.rodBroke ? "This rod is no longer usable." : RISK_PRESENTATION[result.rodRiskBand].consequence}</span>
        {result.rodBroke ? <p className="rod-replacement">{replacementName ? `${replacementName} is equipped now.` : "Claim a free Starter Fiberglass rod in Shop → Rods before casting again."}</p> : null}
      </div>
    </details>
  );
}

export function CatchResult({ result, gameState, actionPending, onDecision, onBack }: CatchResultProps) {
  const species = result.species ?? result.catch?.species;
  if (!result.catch) {
    return (
      <section className="fishing-status catch-result" data-testid="catch-result">
        <article className="lost-reveal">
          <span className="lost-mark"><Icon name="fish" /></span>
          <span className="eyebrow">The line went slack</span>
          <h1>It got away</h1>
          <strong className="lost-species">{species?.commonName ?? "Unknown fish"}</strong>
          <p className="result-message">{result.message}</p>
          <button className="primary-action retry-cast" type="button" disabled={actionPending} aria-disabled={actionPending} onClick={onBack}>
            <Icon name="waves" /><span>Cast again</span>
          </button>
        </article>
        <TackleReport result={result} gameState={gameState} />
      </section>
    );
  }

  return (
    <section className="fishing-status catch-result" data-testid="catch-result">
      <article className="catch-reveal">
        <header className="catch-masthead">
          <div className="catch-title"><span className="eyebrow">{result.catch.locationName}</span><h1>{result.catch.species.commonName}</h1></div>
          <span className="landed-seal"><Icon name="spark" /><span>LANDED</span></span>
        </header>
        <div className="catch-visual">
          <FishImage variant="catch" species={result.catch.species} />
          <span className={`catch-quality quality-${result.catch.quality}`}>{capitalize(result.catch.quality)}</span>
          <div className="catch-sale-value" data-testid="catch-sale-value" role="group" aria-label={`Sell value: ${formatCoins(result.catch.saleValueCoins)} coins`}>
            <Icon name="coin" />
            <span className="catch-sale-copy"><span className="catch-sale-label">SELL VALUE</span><strong>+{formatCoins(result.catch.saleValueCoins)} <small>COINS</small></strong></span>
          </div>
        </div>
        <SpecimenDetails variant="catch" specimen={result.catch} />
        <p className="catch-flavor">{result.message}</p>
      </article>
      <TackleReport result={result} gameState={gameState} />
      <CatchDecision specimen={result.catch} actionPending={actionPending} onDecision={onDecision} />
    </section>
  );
}

export function DecisionResult({ decision, onBack }: DecisionResultProps) {
  const sold = decision.decision === "sell";
  return (
    <section className="fishing-status decision-result" data-testid="decision-result">
      <span className="decision-mark"><Icon name={sold ? "coin" : "trophy"} /></span>
      <span className="eyebrow">{sold ? "Sold" : "Trophy secured"}</span>
      <h1>{sold ? "Nice payday!" : "Into the livewell!"}</h1>
      <div className="decision-receipt"><span>{decision.catch.species.commonName}</span><strong>{sold ? `+${formatCoins(decision.catch.saleValueCoins)} coins` : "Collection +1"}</strong></div>
      <div className="decision-wallet"><Icon name="coin" /><span>Wallet</span><strong>{formatCoins(decision.coins)}</strong></div>
      <button className="primary-action decision-continue" type="button" onClick={onBack}><Icon name="waves" /><span>Fish again</span></button>
    </section>
  );
}
