import type { BaitDefinition, GameStateResponse, LureDefinition, OwnedEquipment, RodDefinition, SelectEquipmentRequest } from "@fishing/shared/contracts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../../shared-ui/icons";

export type SelectorType = "rod" | "lure" | "bait";
type SelectorDefinition = RodDefinition | LureDefinition | BaitDefinition;

interface GearSelectorProps {
  state: GameStateResponse;
  equipmentType: SelectorType;
  tone: SelectorType;
  iconName: IconName;
  actionPending: boolean;
  onSelectEquipment: (input: SelectEquipmentRequest) => void;
}

function definitionsFor(state: GameStateResponse, type: SelectorType): SelectorDefinition[] {
  if (type === "rod") return state.catalog.rods;
  if (type === "lure") return state.catalog.lures;
  return state.catalog.baits;
}

function inventoryFor(state: GameStateResponse, type: SelectorType): OwnedEquipment[] {
  if (type === "rod") return state.inventory.rods;
  if (type === "lure") return state.inventory.lures;
  return state.inventory.baits;
}

function activeIdFor(state: GameStateResponse, type: SelectorType): string {
  if (type === "rod") return state.activeEquipment.rodId;
  if (type === "lure") return state.activeEquipment.lureId;
  return state.activeEquipment.baitId;
}

function requestFor(type: SelectorType, id: string): SelectEquipmentRequest {
  if (type === "rod") return { rodId: id };
  if (type === "lure") return { lureId: id };
  return { baitId: id };
}

function labelFor(type: SelectorType): string {
  if (type === "rod") return "Rod";
  if (type === "lure") return "Lure";
  return "Bait";
}

function detailFor(type: SelectorType, definition: SelectorDefinition, ownership: OwnedEquipment | undefined): string {
  if (type === "bait") return `${ownership?.quantity ?? 0} portions`;
  if (type === "lure") return `${ownership?.durability ?? 0}/${(definition as LureDefinition).maximumDurability} uses`;
  return `up to ${(definition as RodDefinition).maxFishWeightKg} kg`;
}

export function GearSelector({ state, equipmentType, tone, iconName, actionPending, onSelectEquipment }: GearSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const definitions = definitionsFor(state, equipmentType);
  const inventory = inventoryFor(state, equipmentType);
  const activeId = activeIdFor(state, equipmentType);
  const current = definitions.find((definition) => definition.id === activeId);
  const currentOwnership = inventory.find((item) => item.id === activeId);
  const ownedDefinitions = definitions.filter((definition) => inventory.some((item) => item.id === definition.id && item.quantity > 0));
  const interactive = ownedDefinitions.length > 1;
  const name = current?.name ?? `No ${equipmentType}`;
  const alert = !currentOwnership || currentOwnership.quantity < 1 || (equipmentType === "lure" && (currentOwnership.durability ?? 0) < 1);
  const label = current ? `${labelFor(equipmentType)}: ${name}` : `No ${equipmentType} equipped`;
  const lureBar = equipmentType === "lure" && current && currentOwnership
    ? Math.max(0, (currentOwnership.durability ?? 0) / (current as LureDefinition).maximumDurability)
    : undefined;
  const meta = equipmentType === "rod" && current
    ? `≤${(current as RodDefinition).maxFishWeightKg}kg`
    : equipmentType === "bait"
      ? `×${currentOwnership?.quantity ?? 0}`
      : "—";
  const badge = currentOwnership && currentOwnership.quantity > 1 ? `+${currentOwnership.quantity - 1}` : undefined;
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) tileRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open || !optionsRef.current || !rootRef.current) return;
    const options = optionsRef.current;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const margin = 8;
    options.style.setProperty("--menu-shift-x", "0px");
    const bounds = options.getBoundingClientRect();
    const shift = bounds.right > viewportWidth - margin
      ? viewportWidth - margin - bounds.right
      : bounds.left < margin
        ? margin - bounds.left
        : 0;
    options.style.setProperty("--menu-shift-x", `${Math.round(shift)}px`);
  }, [open]);

  const select = (id: string) => {
    close(true);
    onSelectEquipment(requestFor(equipmentType, id));
  };

  const tileContent = (
    <>
      <span className="gear-icon"><Icon name={iconName} />{badge ? <span className="gear-badge">{badge}</span> : null}</span>
      <span className="gear-text">
        <span className="gear-name">{name}</span>
        {lureBar !== undefined ? <span className="gear-bar"><span className="gear-bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, lureBar)) * 100)}%` }} /></span> : <span className="gear-meta">{meta}</span>}
      </span>
    </>
  );

  return (
    <div className="gear-slot" ref={rootRef} data-equipment-type={equipmentType}>
      {interactive ? (
        <button
          className={`gear-tile tone-${tone} ${alert ? "is-alert" : ""}`}
          ref={tileRef}
          type="button"
          aria-label={`${label}. Tap to switch`}
          aria-controls={`equipment-options-${equipmentType}`}
          aria-expanded={open}
          disabled={actionPending}
          aria-disabled={actionPending}
          onClick={() => {
            if (!actionPending) setOpen((currentOpen) => !currentOpen);
          }}
        >{tileContent}</button>
      ) : (
        <div className={`gear-tile tone-${tone} ${alert ? "is-alert" : ""}`} role="img" aria-label={label}>{tileContent}</div>
      )}
      {interactive ? (
        <div className="equipment-options" ref={optionsRef} id={`equipment-options-${equipmentType}`} role="menu" hidden={!open}>
          {ownedDefinitions.map((definition) => {
            const ownership = inventory.find((item) => item.id === definition.id);
            const active = definition.id === activeId;
            return (
              <button
                className={`equipment-option ${active ? "is-active" : ""}`}
                key={definition.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={actionPending}
                aria-disabled={actionPending}
                onClick={() => select(definition.id)}
              >
                <span className="equipment-option-name">{definition.name}</span>
                <span className="equipment-option-detail">{detailFor(equipmentType, definition, ownership)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
