import type { FishSpecimen } from "@fishing/shared/contracts";
import { getSpeciesSizeComparison } from "../ui/specimen-size";
import { capitalize, formatDate } from "./presenters";

export interface SpecimenDetailsProps {
  specimen: FishSpecimen;
  variant?: "card" | "catch";
}

export function SpecimenDetails({ specimen, variant = "card" }: SpecimenDetailsProps) {
  const comparison = getSpeciesSizeComparison(specimen);
  return (
    <div className={`specimen-details ${variant === "catch" ? "catch-specimen" : ""}`} data-testid="specimen-details">
      <strong>{capitalize(specimen.quality)}</strong>
      <StatChip value={specimen.weightKg.toFixed(1)} unit="KG" />
      <StatChip value={`${specimen.lengthCm}`} unit="CM" />
      <StatChip value={specimen.saleValueCoins.toLocaleString()} unit="COINS" />
      <div className="specimen-caught-meta">
        <span className="specimen-location">Caught at {specimen.locationName}</span>
        <span className="specimen-caught-date">Caught {formatDate(specimen.caughtAt)}</span>
      </div>
      <div className="species-size">
        <div className="species-size-heading"><span>Species size</span><strong className="species-size-value">{comparison.percentOfMaximum}% of max</strong></div>
        <div
          className="species-size-track"
          role="img"
          aria-label={`${specimen.weightKg.toFixed(1)} kilograms, ${comparison.label.toLowerCase()} for ${specimen.species.commonName}. Typical is ${specimen.species.typicalWeightKg.toFixed(1)} kilograms and the species maximum is ${specimen.species.maximumWeightKg.toFixed(1)} kilograms.`}
        >
          <span className="species-size-fill" style={{ width: `${comparison.fillPercent}%` }} />
          <span className="species-size-typical" style={{ left: `${comparison.typicalMarkerPercent}%` }} aria-hidden="true" title={`Typical size: ${specimen.species.typicalWeightKg.toFixed(1)} kg`} />
        </div>
        <div className="species-size-scale"><span className="species-size-status">{comparison.label}</span><span className="species-size-typical-label">Typical {specimen.species.typicalWeightKg.toFixed(1)} kg · Max {specimen.species.maximumWeightKg.toFixed(1)} kg</span></div>
      </div>
    </div>
  );
}

function StatChip({ value, unit }: { value: string; unit: string }) {
  return <span className="stat-chip"><b>{value}</b><small>{unit}</small></span>;
}
