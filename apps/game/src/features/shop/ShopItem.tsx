import type {
  BaitDefinition,
  BoatDefinition,
  GameStateResponse,
  LureDefinition,
  PlayerInventory,
  PurchaseRequest,
  RodDefinition,
} from "@fishing/shared/contracts";
import { Icon, type IconName } from "../../shared-ui/icons";
import { formatCoins, locationNamesForBoat, speciesNamesForIds } from "../../shared-ui/presenters";
import type { ShopCategory } from "../../app/app-types";

export type ShopDefinition = BoatDefinition | RodDefinition | LureDefinition | BaitDefinition;

const ICONS: Record<ShopCategory, IconName> = { boats: "anchor", rods: "rod", lures: "lure", bait: "bait" };

export interface ShopItemProps {
  state: GameStateResponse;
  item: ShopDefinition;
  category: ShopCategory;
  quantity: number;
  purchasePending: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onPurchase: (input: PurchaseRequest) => void;
}

function inventoryKeyFor(category: ShopCategory): keyof PlayerInventory {
  return category === "bait" ? "baits" : category;
}

function equipmentKeyFor(category: ShopCategory): "boatId" | "rodId" | "lureId" | "baitId" {
  return category === "boats" ? "boatId" : category === "rods" ? "rodId" : category === "lures" ? "lureId" : "baitId";
}

export function ShopItem({ state, item, category, quantity, purchasePending, onQuantityChange, onPurchase }: ShopItemProps) {
  const ownership = state.inventory[inventoryKeyFor(category)].find((entry) => entry.id === item.id);
  const owned = Boolean(ownership && ownership.quantity > 0);
  const equipped = Boolean(owned && state.activeEquipment[equipmentKeyFor(category)] === item.id);
  const status = equipped ? "equipped" : owned ? "owned" : undefined;

  let details;
  if (category === "boats") {
    const boat = item as BoatDefinition;
    const unlocks = locationNamesForBoat(state, boat.unlocksLocationIds);
    details = <>{statGrid([["Tier", `${boat.tier}`], ["Price", boat.priceCoins === 0 ? "Free" : `${formatCoins(boat.priceCoins)} coins`], ["Spots", `${unlocks.length}`]])}{speciesList("Unlocks these waters", unlocks)}</>;
  } else if (category === "rods") {
    const rod = item as RodDefinition;
    details = statGrid([["Max fish", `${rod.maxFishWeightKg.toFixed(1)} kg`], ["Strength", `${rod.strength}/3`], ["Control", `×${rod.control.toFixed(2)}`], ["Break resist.", `${Math.round(rod.breakResistance * 100)}%`], ["Catch zone", `+${Math.round(rod.catchZoneBonus * 100)}%`]]);
  } else if (category === "lures") {
    const lure = item as LureDefinition;
    details = <>{statGrid([["Uses", `${lure.maximumDurability}`], ["Catch zone", `+${Math.round(lure.catchZoneBonus * 100)}%`], ["Difficulty", `+${Math.round(lure.difficultyModifier * 100)}%`], ["Owned", `${ownership?.quantity ?? 0}`]])}{speciesList("Best for", speciesNamesForIds(state, lure.preferredFishIds))}</>;
  } else {
    const bait = item as BaitDefinition;
    details = <>{statGrid([["Attraction", `×${bait.attraction.toFixed(2)}`], ["Price", `${formatCoins(bait.priceCoins)} / portion`], ["Owned", `${ownership?.quantity ?? 0}`]])}{speciesList("Attracts", speciesNamesForIds(state, bait.fishIds))}</>;
  }

  const totalCost = category === "bait" ? item.priceCoins * quantity : item.priceCoins;
  const disabled = purchasePending || state.coins < totalCost;
  const kind = category === "boats" ? "boat" : category === "rods" ? "rod" : category === "lures" ? "lure" : "bait";
  const actionLabel = totalCost === 0 ? `Claim ${kind}` : `Buy ${kind}`;
  const actionName = totalCost === 0 ? `${actionLabel} ${item.name}` : `${actionLabel} ${item.name} for ${formatCoins(totalCost)} coins`;

  return (
    <article className={`shop-item tone-${category} ${status ? `is-${status}` : ""}`} data-testid="shop-item" data-item-id={item.id}>
      <span className="shop-icon"><Icon name={ICONS[category]} /></span>
      <div className="shop-body">
        <div className="shop-heading"><h2>{item.name}</h2>{status ? <span className={`shop-state is-${status}`}><Icon name="check" />{status === "equipped" ? "Equipped" : "Owned"}</span> : null}</div>
        <p className="shop-description">{item.description}</p>
        <div className="shop-details">{details}</div>
        {category === "bait" ? (
          <div className="qty-chips" role="group" aria-label={`Amount of ${item.name} to buy`}>
            {[1, 5, 10, 25].map((choice) => (
              <button
                key={choice}
                className={`qty-chip ${choice === quantity ? "is-active" : ""}`}
                type="button"
                disabled={purchasePending}
                aria-disabled={purchasePending}
                aria-pressed={choice === quantity}
                onClick={() => onQuantityChange(item.id, choice)}
              >
                ×{choice}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="shop-side">
        {!owned || category === "lures" || category === "bait" ? (
          <>
            <button className="buy-btn" type="button" disabled={disabled} aria-disabled={disabled} aria-label={actionName} onClick={() => onPurchase({ itemId: item.id, quantity: category === "bait" ? quantity : undefined })}>
              <span className="buy-label">{actionLabel}</span>
              <span className="buy-price">{category === "bait" && quantity > 1 ? <small>×{quantity}</small> : null}{totalCost === 0 ? <small>Free</small> : <><Icon name="coin" />{formatCoins(totalCost)}</>}</span>
            </button>
            {state.coins < totalCost ? <span className="short-note">Need {formatCoins(totalCost - state.coins)} more</span> : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function statGrid(entries: Array<[string, string]>) {
  return <div className="shop-stats">{entries.map(([label, value]) => <div className="shop-stat-cell" key={label}><strong>{value}</strong><span className="muted">{label}</span></div>)}</div>;
}

function speciesList(label: string, names: string[]) {
  return <div className="shop-species"><span className="shop-detail-label">{label}</span><div className="fish-chips">{names.map((name) => <span className="fish-chip" key={name}>{name}</span>)}</div></div>;
}
