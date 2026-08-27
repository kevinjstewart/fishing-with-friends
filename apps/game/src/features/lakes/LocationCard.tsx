import type { GameStateResponse, LocationAvailability } from "@fishing/shared/contracts";
import { Icon } from "../../shared-ui/icons";
import { capitalize, formatCoins, speciesNamesForIds } from "../../shared-ui/presenters";

export interface LocationCardProps {
  state: GameStateResponse;
  location: LocationAvailability;
  selected: boolean;
  onSelect: (location: LocationAvailability) => void;
  onOpenShop: () => void;
}

export function LocationCard({ state, location, selected, onSelect, onOpenShop }: LocationCardProps) {
  const names = speciesNamesForIds(state, location.fishIds);
  const visibleNames = names.slice(0, 3);
  const additionalNames = names.slice(3);
  const boat = state.catalog.boats.find((candidate) => candidate.id === location.requiredBoatId);
  const riskLevel = location.riskBand === "low" ? 1 : location.riskBand === "moderate" ? 2 : 3;
  const label = location.unlocked
    ? undefined
    : `${location.name}, locked. Requires ${boat?.name ?? "a better boat"}. Open the Boats shop to unlock it.`;

  const choose = () => {
    if (location.unlocked) onSelect(location);
    else onOpenShop();
  };

  return (
    <article
      className={`location-card risk-${location.riskBand} ${selected ? "is-selected" : ""} ${location.unlocked ? "" : "is-locked"}`}
      data-location={location.id}
      title={`${location.description} ${location.riskReason}`}
      role={location.unlocked ? "radio" : "button"}
      tabIndex={0}
      aria-checked={location.unlocked ? selected : undefined}
      aria-label={label}
      onClick={choose}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        choose();
      }}
    >
      <div className="location-top">
        <h2>{location.name}</h2>
        <span className={`risk-dots risk-${location.riskBand}`} role="img" aria-label={`${capitalize(location.riskBand)} risk`}>
          {[0, 1, 2].map((index) => <i key={index} className={index < riskLevel ? "on" : undefined} />)}
          <span className="risk-dot-label">{capitalize(location.riskBand)} risk</span>
        </span>
      </div>
      <p className="location-risk-reason">{location.riskReason}</p>
      <div className="location-fish">
        <div className="fish-chips">
          <span className="fish-cue" aria-hidden="true"><Icon name="fish" /></span>
          {visibleNames.map((name) => <span className="fish-chip" key={name}>{name}</span>)}
        </div>
        {additionalNames.length > 0 ? (
          <details className="fish-list-details" onClick={(event) => event.stopPropagation()}>
            <summary>View all {names.length} species</summary>
            <div className="fish-chips fish-chips-expanded">
              {additionalNames.map((name) => <span className="fish-chip" key={name}>{name}</span>)}
            </div>
          </details>
        ) : null}
      </div>
      <div className="location-foot">
        <span className="value-tag"><Icon name="coin" /><span>{formatCoins(location.expectedValueMinCoins)}–{formatCoins(location.expectedValueMaxCoins)}</span></span>
        {location.unlocked ? (
          <span className="location-radio" aria-hidden="true"><Icon name="check" /></span>
        ) : (
          <span className="lock-tag"><Icon name="lock" /><span className="lock-copy"><strong>Requires {boat?.name ?? "a better boat"}</strong><small>{boat ? `${formatCoins(boat.priceCoins)} coins` : "Upgrade boat"}</small></span></span>
        )}
      </div>
    </article>
  );
}
