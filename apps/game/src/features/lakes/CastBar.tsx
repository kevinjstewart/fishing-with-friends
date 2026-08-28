import type { GameStateResponse, LocationAvailability, RiskBand } from "@fishing/shared/contracts";
import { rodRiskBandForWeight } from "@fishing/shared/risk";
import { Icon, type IconName } from "../../shared-ui/icons";
import { capitalize, eligibleFishForSetup, RISK_PRESENTATION, riskLabel } from "../../shared-ui/presenters";

export type RestockCategory = "bait" | "rods" | "lures";

export interface CastBarProps {
  state: GameStateResponse;
  location: LocationAvailability;
  actionPending: boolean;
  onCast: () => void;
  onOpenShop: (category: RestockCategory) => void;
}

function ReadinessChip({ iconName, text, tone, label }: { iconName: IconName; text: string; tone: "ok" | "warn" | "bad"; label: string }) {
  return <span className={`readiness-chip is-${tone}`} role="img" aria-label={label} title={label}><Icon name={iconName} /><span>{text}</span></span>;
}

export function CastBar({ state, location, actionPending, onCast, onOpenShop }: CastBarProps) {
  const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
  const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
  const equippedRod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
  const rod = equippedRod && state.inventory.rods.find((item) => item.id === equippedRod.id)?.quantity ? equippedRod : undefined;
  const lureDefinition = lure ? state.catalog.lures.find((item) => item.id === lure.id) : undefined;
  const baitDefinition = bait ? state.catalog.baits.find((item) => item.id === bait.id) : undefined;
  const eligibleFish = eligibleFishForSetup(state, location, bait?.id);
  const heaviest = Math.max(0, ...eligibleFish.map((species) => species.maximumWeightKg));
  const baitQuantity = bait?.quantity ?? 0;
  const lureUsesLeft = lure?.durability ?? 0;
  const lureUsable = Boolean(lure && lure.quantity > 0 && (lureUsesLeft >= 1 || lure.quantity > 1));
  const castRiskBand: RiskBand = rod ? rodRiskBandForWeight(heaviest, rod.maxFishWeightKg) : "high";
  const lureName = lureDefinition?.name ?? "your lure";
  const baitName = baitDefinition?.name ?? "your bait";
  const lureWillUseSpare = Boolean(lure && lureUsesLeft < 1 && lure.quantity > 1);
  const lureAfter = lureDefinition
    ? lureWillUseSpare
      ? `${lureName} becomes ${Math.max(0, lureDefinition.maximumDurability - 1)}/${lureDefinition.maximumDurability}`
      : `${lureName} ${Math.max(0, lureUsesLeft - 1)}/${lureDefinition.maximumDurability}`
    : "lure unavailable";
  const canCast = Boolean(location.unlocked && rod && lureUsable && baitQuantity > 0 && eligibleFish.length > 0);
  const castDetails = `${baitName} ×1 · ${lureName} ×1`;
  const afterCasting = lureWillUseSpare
    ? `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter} (spare used)`
    : `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter}`;

  let button: { label: string; iconName: IconName; restock: boolean; action: () => void };
  if (!baitQuantity) {
    button = { label: "Restock bait", iconName: "bait", restock: true, action: () => onOpenShop("bait") };
  } else if (!rod) {
    button = { label: "Claim a rod", iconName: "rod", restock: true, action: () => onOpenShop("rods") };
  } else if (!lureUsable) {
    button = { label: "Replace lure", iconName: "lure", restock: true, action: () => onOpenShop("lures") };
  } else {
    button = { label: `Cast at ${location.name}`, iconName: "waves", restock: false, action: onCast };
  }

  const castRiskDescription = `${riskLabel(castRiskBand)}. ${location.riskReason} ${RISK_PRESENTATION[castRiskBand].consequence}`;
  return (
    <div className="cast-bar" aria-label="Fishing cast controls">
      <div className="cast-details">
        <div className="cast-details-copy">
          <span className="cast-details-title">Next cast</span>
          <strong>{castDetails}</strong>
          <span className="cast-details-after">{afterCasting}</span>
          <span className="sr-only">1 bait + 1 lure use</span>
        </div>
        <div className={`cast-risk risk-${castRiskBand}`} aria-label={castRiskDescription}>
          <span className="cast-risk-label">{capitalize(castRiskBand)}</span>
          <strong>{rod ? `${heaviest.toFixed(1)} / ${rod.maxFishWeightKg.toFixed(1)} kg` : "No rod"}</strong>
        </div>
      </div>
      <div className="cast-readiness">
        <ReadinessChip
          iconName="rod"
          text={`${heaviest.toFixed(1)}kg`}
          tone={castRiskBand === "low" ? "ok" : castRiskBand === "moderate" ? "warn" : "bad"}
          label={rod ? `${castRiskDescription} Fish attracted by ${baitName} reach ${heaviest.toFixed(1)} kilograms; your rod is rated for ${rod.maxFishWeightKg.toFixed(1)} kilograms.` : "No rod is equipped."}
        />
        <ReadinessChip
          iconName="lure"
          text={lureWillUseSpare ? "1 spare" : `${Math.max(0, lureUsesLeft)}`}
          tone={lureUsable ? "ok" : "bad"}
          label={lureUsable ? (lureWillUseSpare ? `${lureName} will consume one spare lure` : `${lureUsesLeft} uses left on ${lureName}`) : "Your lure has no usable copy left"}
        />
        <ReadinessChip
          iconName="bait"
          text={`×${baitQuantity}`}
          tone={baitQuantity > 0 ? "ok" : "bad"}
          label={baitQuantity > 0 ? `${baitQuantity} bait portions left` : "You are out of bait"}
        />
      </div>
      <button
        className={`primary-action cast-cta ${button.restock ? "is-restock" : ""}`}
        data-testid="cast-cta"
        type="button"
        disabled={actionPending || (!button.restock && !canCast)}
        aria-disabled={actionPending || (!button.restock && !canCast)}
        onClick={button.action}
      ><Icon name={button.iconName} /><span>{button.label}</span></button>
    </div>
  );
}
