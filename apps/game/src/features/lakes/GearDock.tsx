import type { GameStateResponse, SelectEquipmentRequest } from "@fishing/shared/contracts";
import { Icon } from "../../shared-ui/icons";
import { GearSelector } from "./GearSelector";

export interface GearDockProps {
  state: GameStateResponse;
  actionPending: boolean;
  onSelectEquipment: (input: SelectEquipmentRequest) => void;
}

export function GearDock({ state, actionPending, onSelectEquipment }: GearDockProps) {
  const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
  return (
    <section className="gear-dock" aria-label="Current tackle">
      <div className="gear-tile boat-tile" role="img" aria-label={boat ? `Boat: ${boat.name}, tier ${boat.tier}` : "No boat"}>
        <span className="gear-icon"><Icon name="anchor" /></span>
        <span className="gear-text"><span className="gear-name">{boat?.name ?? "No boat"}</span><span className="gear-meta">{boat ? `Tier ${boat.tier}` : "—"}</span></span>
      </div>
      <div className="gear-selector-wrap">
        <GearSelector state={state} equipmentType="rod" tone="rod" iconName="rod" actionPending={actionPending} onSelectEquipment={onSelectEquipment} />
      </div>
      <div className="gear-selector-wrap">
        <GearSelector state={state} equipmentType="lure" tone="lure" iconName="lure" actionPending={actionPending} onSelectEquipment={onSelectEquipment} />
      </div>
      <div className="gear-selector-wrap">
        <GearSelector state={state} equipmentType="bait" tone="bait" iconName="bait" actionPending={actionPending} onSelectEquipment={onSelectEquipment} />
      </div>
    </section>
  );
}
