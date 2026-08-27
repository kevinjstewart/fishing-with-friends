import type { D1Database } from "@cloudflare/workers-types";
import type { ActiveEquipment, EquipmentType, GameStateResponse, OwnedEquipment, PlayerInventory } from "@fishing/shared/contracts";
import { GAME_CATALOG } from "@fishing/shared/catalog";

interface GameStateRow {
  player_id: string;
  coins: number;
  active_boat_id: string;
  active_rod_id: string;
  active_lure_id: string;
  active_bait_id: string;
  created_at: string;
  updated_at: string;
}

interface EquipmentRow {
  equipment_type: EquipmentType;
  equipment_id: string;
  quantity: number;
  durability: number | null;
}

const defaultEquipment: Array<EquipmentRow & { equipment_type: EquipmentType }> = [
  { equipment_type: "boat", equipment_id: "shore-fishing", quantity: 1, durability: null },
  { equipment_type: "rod", equipment_id: "starter-fiberglass", quantity: 1, durability: null },
  { equipment_type: "lure", equipment_id: "copper-spinner", quantity: 1, durability: 10 },
  { equipment_type: "bait", equipment_id: "worm", quantity: 10, durability: null },
];

function emptyInventory(): PlayerInventory {
  return { boats: [], rods: [], lures: [], baits: [] };
}

function inventoryKey(type: EquipmentType): keyof PlayerInventory {
  if (type === "boat") return "boats";
  if (type === "rod") return "rods";
  if (type === "lure") return "lures";
  return "baits";
}

function toEquipment(row: EquipmentRow): OwnedEquipment {
  return { id: row.equipment_id, quantity: row.quantity, durability: row.durability };
}

export class GameRepository {
  constructor(private readonly db: D1Database) {}

  async ensurePlayerState(playerId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO player_game_states
          (player_id, coins, active_boat_id, active_rod_id, active_lure_id, active_bait_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(playerId, 100, "shore-fishing", "starter-fiberglass", "copper-spinner", "worm", now, now)
      .run();

    for (const equipment of defaultEquipment) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO player_equipment
            (player_id, equipment_type, equipment_id, quantity, durability)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(playerId, equipment.equipment_type, equipment.equipment_id, equipment.quantity, equipment.durability)
        .run();
    }
  }

  async getState(playerId: string): Promise<GameStateResponse> {
    await this.ensurePlayerState(playerId);

    const state = await this.db
      .prepare(
        `SELECT player_id, coins, active_boat_id, active_rod_id, active_lure_id, active_bait_id, created_at, updated_at
         FROM player_game_states WHERE player_id = ? LIMIT 1`,
      )
      .bind(playerId)
      .first<GameStateRow>();
    const equipment = await this.db
      .prepare(
        `SELECT equipment_type, equipment_id, quantity, durability
         FROM player_equipment WHERE player_id = ? ORDER BY equipment_type, equipment_id`,
      )
      .bind(playerId)
      .all<EquipmentRow>();

    if (!state) {
      throw new Error("The game state was not available after initialization.");
    }

    const inventory = emptyInventory();
    for (const row of equipment.results) {
      inventory[inventoryKey(row.equipment_type)].push(toEquipment(row));
    }

    const activeEquipment: ActiveEquipment = {
      boatId: state.active_boat_id,
      rodId: state.active_rod_id,
      lureId: state.active_lure_id,
      baitId: state.active_bait_id,
    };
    const ownedBoatIds = new Set(inventory.boats.filter((boat) => boat.quantity > 0).map((boat) => boat.id));
    const ownedBoatTiers = GAME_CATALOG.boats.filter((boat) => ownedBoatIds.has(boat.id)).map((boat) => boat.tier);
    const highestBoatTier = Math.max(0, ...ownedBoatTiers);

    return {
      catalog: GAME_CATALOG,
      coins: state.coins,
      activeEquipment,
      inventory,
      locations: GAME_CATALOG.locations.map((location) => {
        const requiredBoat = GAME_CATALOG.boats.find((boat) => boat.id === location.requiredBoatId);
        return { ...location, unlocked: Boolean(requiredBoat && requiredBoat.tier <= highestBoatTier) };
      }),
    };
  }
}
