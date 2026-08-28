import type { CatchDecision, FishSpecimen } from "@fishing/shared/contracts";
import { Icon } from "../../shared-ui/icons";
import { formatCoins } from "../../shared-ui/presenters";

export interface CatchDecisionProps {
  specimen: FishSpecimen;
  actionPending: boolean;
  onDecision: (decision: CatchDecision) => void;
}
export function CatchDecision({ specimen, actionPending, onDecision }: CatchDecisionProps) {
  return (
    <section className="catch-decision" data-testid="catch-decision" aria-label="Catch decision controls">
      <div className="catch-decision-heading">
        <span className="eyebrow">Your call</span>
        <strong>Keep the trophy or cash out?</strong>
      </div>
      <div className="catch-actions">
        <button
          className="catch-choice keep-choice"
          type="button"
          disabled={actionPending}
          aria-disabled={actionPending}
          onClick={() => onDecision("keep")}
        >
          <Icon name="trophy" />
          <span className="choice-copy"><strong>Keep</strong><small>Add to collection</small></span>
        </button>
        <button
          className="catch-choice sell-choice"
          type="button"
          disabled={actionPending}
          aria-disabled={actionPending}
          onClick={() => onDecision("sell")}
        >
          <Icon name="coin" />
          <span className="choice-copy"><strong>Sell</strong><small>+{formatCoins(specimen.saleValueCoins)} coins</small></span>
        </button>
      </div>
    </section>
  );
}
