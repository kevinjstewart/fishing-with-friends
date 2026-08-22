import type { D1Database } from "@cloudflare/workers-types";
import type {
  ActiveEquipment,
  CollectionResponse,
  EquipmentType,
  FishJournalResponse,
  JournalEntry,
  PlayerInventory,
  PurchaseRequest,
  PurchaseResponse,
  RecoveryResponse,
  SelectEquipmentRequest,
  SelectEquipmentResponse,
} from "@fishing/shared";
import { GAME_CATALOG } from "@fishing/shared";
import type { Env } from "../env";
import { badRequest, conflict, notFound } from "../lib/errors";
import { GameRepository } from "../persistence/game-repository";
import { loadPlayerData, specimenFromRow, type CatchRow } from "./fishing-service";

interface SpeciesRecordRow {
  species_id: string;
  times_caught: number;
  heaviest_weight_kg: number;
  longest_length_cm: number;
  best_sale_value_coins: number;
  first_caught_at: string;
  last_caught_at: string;
}

const WORM_BAIT_ID = "worm";
const STARTER_LURE_ID = "copper-spinner";
const MAX_BAIT_PURCHASE_QUANTITY = 50;

function inventoryBucket(type: EquipmentType): keyof PlayerInventory {
  if (type === "boat") return "boats";
  if (type === "rod") return "rods";
  if (type === "lure") return "lures";
  return "baits";
}

function emptyInventory(): PlayerInventory {
  return { boats: [], rods: [], lures: [], baits: [] };
}

export async function loadInventorySnapshot(db: D1Database, playerId: string): Promise<PurchaseResponse> {
  const state = await db
    .prepare("SELECT coins, active_boat_id, active_rod_id, active_lure_id, active_bait_id FROM player_game_states WHERE player_id = ? LIMIT 1")
    .bind(playerId)
    .first<{ coins: number; active_boat_id: string; active_rod_id: string; active_lure_id: string; active_bait_id: string }>();
  if (!state) throw notFound("The player game state was not found.");
  const equipment = await db
    .prepare("SELECT equipment_type, equipment_id, quantity, durability FROM player_equipment WHERE player_id = ? ORDER BY equipment_type, equipment_id")
    .bind(playerId)
    .all<{ equipment_type: EquipmentType; equipment_id: string; quantity: number; durability: number | null }>();
  const inventory = emptyInventory();
  for (const row of equipment.results) {
    inventory[inventoryBucket(row.equipment_type)].push({ id: row.equipment_id, quantity: row.quantity, durability: row.durability });
  }
  const activeEquipment: ActiveEquipment = {
    boatId: state.active_boat_id,
    rodId: state.active_rod_id,
    lureId: state.active_lure_id,
    baitId: state.active_bait_id,
  };
  return { coins: state.coins, inventory, activeEquipment };
}

async function deductCoins(db: D1Database, playerId: string, amount: number): Promise<boolean> {
  const update = await db
    .prepare("UPDATE player_game_states SET coins = coins - ?, updated_at = ? WHERE player_id = ? AND coins >= ?")
    .bind(amount, new Date().toISOString(), playerId, amount)
    .run();
  return update.meta.changes === 1;
}

async function refundCoins(db: D1Database, playerId: string, amount: number): Promise<void> {
  await db.prepare("UPDATE player_game_states SET coins = coins + ?, updated_at = ? WHERE player_id = ?").bind(amount, new Date().toISOString(), playerId).run();
}

export async function purchaseItem(env: Env, playerId: string, input: PurchaseRequest): Promise<PurchaseResponse> {
  if (!input || typeof input.itemId !== "string" || input.itemId.trim().length === 0) {
    throw badRequest("itemId is required.");
  }
  const itemId = input.itemId.trim();
  const boat = GAME_CATALOG.boats.find((candidate) => candidate.id === itemId);
  const rod = GAME_CATALOG.rods.find((candidate) => candidate.id === itemId);
  const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === itemId);
  const bait = GAME_CATALOG.baits.find((candidate) => candidate.id === itemId);

  let type: EquipmentType;
  let priceCoins: number;
  let quantity = 1;
  if (boat) {
    type = "boat";
    priceCoins = boat.priceCoins;
  } else if (rod) {
    type = "rod";
    priceCoins = rod.priceCoins;
  } else if (lure) {
    type = "lure";
    priceCoins = lure.priceCoins;
  } else if (bait) {
    type = "bait";
    priceCoins = bait.priceCoins;
    if (input.quantity !== undefined) {
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_BAIT_PURCHASE_QUANTITY) {
        throw badRequest(`quantity must be an integer between 1 and ${MAX_BAIT_PURCHASE_QUANTITY}.`);
      }
      quantity = input.quantity;
    }
  } else {
    throw notFound("The shop does not sell that item.");
  }
  if (type !== "bait" && input.quantity !== undefined && input.quantity !== 1) {
    throw badRequest("quantity is only supported for bait.");
  }

  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const { equipment } = await loadPlayerData(env.DB, playerId);
  const owned = equipment.find((row) => row.equipment_type === type && row.equipment_id === itemId);
  if ((type === "boat" || type === "rod") && owned && owned.quantity > 0) {
    throw conflict(type === "boat" ? "You already own that boat." : "You already own that rod.");
  }
  const totalCost = priceCoins * quantity;
  if (!(await deductCoins(env.DB, playerId, totalCost))) {
    throw conflict("You do not have enough coins for that purchase.");
  }

  try {
    if (type === "boat" || type === "rod") {
      await env.DB
        .prepare(
          `INSERT INTO player_equipment (player_id, equipment_type, equipment_id, quantity, durability)
           VALUES (?, ?, ?, 1, NULL)
           ON CONFLICT(player_id, equipment_type, equipment_id) DO UPDATE SET quantity = MAX(quantity, 1)`,
        )
        .bind(playerId, type, itemId)
        .run();
    } else if (type === "lure") {
      const maximumDurability = lure?.maximumDurability ?? 0;
      if (!owned) {
        await env.DB
          .prepare(
            `INSERT INTO player_equipment (player_id, equipment_type, equipment_id, quantity, durability)
             VALUES (?, 'lure', ?, 1, ?)`,
          )
          .bind(playerId, itemId, maximumDurability)
          .run();
      } else {
        await env.DB
          .prepare("UPDATE player_equipment SET quantity = quantity + 1 WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ?")
          .bind(playerId, itemId)
          .run();
        if ((owned.durability ?? 0) < 1) {
          await env.DB
            .prepare("UPDATE player_equipment SET durability = ? WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ? AND durability <= 0")
            .bind(maximumDurability, playerId, itemId)
            .run();
        }
      }
    } else {
      await env.DB
        .prepare(
          `INSERT INTO player_equipment (player_id, equipment_type, equipment_id, quantity, durability)
           VALUES (?, 'bait', ?, ?, NULL)
           ON CONFLICT(player_id, equipment_type, equipment_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        )
        .bind(playerId, itemId, quantity)
        .run();
    }
  } catch (error) {
    await refundCoins(env.DB, playerId, totalCost);
    throw error;
  }

  return loadInventorySnapshot(env.DB, playerId);
}

export async function selectEquipment(env: Env, playerId: string, input: SelectEquipmentRequest): Promise<SelectEquipmentResponse> {
  if (!input || (input.rodId === undefined && input.lureId === undefined && input.baitId === undefined)) {
    throw badRequest("Provide at least one of rodId, lureId, or baitId.");
  }
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const { equipment } = await loadPlayerData(env.DB, playerId);

  const assignments: Array<{ column: string; id: string }> = [];
  if (input.rodId !== undefined) {
    const rod = GAME_CATALOG.rods.find((candidate) => candidate.id === input.rodId);
    const owned = equipment.find((row) => row.equipment_type === "rod" && row.equipment_id === input.rodId);
    if (!rod || !owned || owned.quantity < 1) throw conflict("You do not own that rod.");
    assignments.push({ column: "active_rod_id", id: rod.id });
  }
  if (input.lureId !== undefined) {
    const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === input.lureId);
    const owned = equipment.find((row) => row.equipment_type === "lure" && row.equipment_id === input.lureId);
    if (!lure || !owned || owned.quantity < 1) throw conflict("You do not own that lure.");
    assignments.push({ column: "active_lure_id", id: lure.id });
  }
  if (input.baitId !== undefined) {
    const bait = GAME_CATALOG.baits.find((candidate) => candidate.id === input.baitId);
    const owned = equipment.find((row) => row.equipment_type === "bait" && row.equipment_id === input.baitId);
    if (!bait || !owned || owned.quantity < 1) throw conflict("You are out of that bait.");
    assignments.push({ column: "active_bait_id", id: bait.id });
  }

  for (const assignment of assignments) {
    await env.DB
      .prepare(`UPDATE player_game_states SET ${assignment.column} = ?, updated_at = ? WHERE player_id = ?`)
      .bind(assignment.id, new Date().toISOString(), playerId)
      .run();
  }

  const snapshot = await loadInventorySnapshot(env.DB, playerId);
  return { activeEquipment: snapshot.activeEquipment, inventory: snapshot.inventory };
}

export async function getCollection(env: Env, playerId: string): Promise<CollectionResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const rows = await env.DB
    .prepare("SELECT * FROM player_catches WHERE player_id = ? AND status IN ('pending', 'kept') ORDER BY caught_at DESC")
    .bind(playerId)
    .all<CatchRow>();
  return { fish: rows.results.map((row) => specimenFromRow(row)) };
}

export async function getFishJournal(env: Env, playerId: string): Promise<FishJournalResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const records = await env.DB
    .prepare(
      `SELECT species_id, times_caught, heaviest_weight_kg, longest_length_cm, best_sale_value_coins, first_caught_at, last_caught_at
       FROM player_species_records WHERE player_id = ?`,
    )
    .bind(playerId)
    .all<SpeciesRecordRow>();
  const bySpecies = new Map(records.results.map((row) => [row.species_id, row]));
  const entries: JournalEntry[] = GAME_CATALOG.fish.map((species) => {
    const record = bySpecies.get(species.id);
    if (!record) {
      return {
        speciesId: species.id,
        discovered: false,
        timesCaught: 0,
        heaviestWeightKg: null,
        longestLengthCm: null,
        bestSaleValueCoins: null,
        firstCaughtAt: null,
        lastCaughtAt: null,
      };
    }
    return {
      speciesId: species.id,
      discovered: true,
      timesCaught: record.times_caught,
      heaviestWeightKg: record.heaviest_weight_kg,
      longestLengthCm: record.longest_length_cm,
      bestSaleValueCoins: record.best_sale_value_coins,
      firstCaughtAt: record.first_caught_at,
      lastCaughtAt: record.last_caught_at,
    };
  });
  return { entries };
}

export async function digForWorms(env: Env, playerId: string): Promise<RecoveryResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const { state, equipment } = await loadPlayerData(env.DB, playerId);
  const worm = GAME_CATALOG.baits.find((candidate) => candidate.id === WORM_BAIT_ID);
  if (!worm) throw new Error("The catalogue is missing the starter bait.");

  const totalBait = equipment.filter((row) => row.equipment_type === "bait").reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
  const usableLure = equipment.some((row) => row.equipment_type === "lure" && row.quantity > 0 && (row.durability ?? 0) >= 1);
  if (state.coins >= worm.priceCoins || (totalBait > 0 && usableLure)) {
    throw conflict("You still have a way to fish. The digging spot is for emergencies.");
  }

  let wormsGranted = 0;
  let lureRestored = false;
  if (totalBait === 0) {
    wormsGranted = 5;
    await env.DB
      .prepare(
        `INSERT INTO player_equipment (player_id, equipment_type, equipment_id, quantity, durability)
         VALUES (?, 'bait', ?, ?, NULL)
         ON CONFLICT(player_id, equipment_type, equipment_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
      )
      .bind(playerId, WORM_BAIT_ID, wormsGranted)
      .run();
  }
  if (!usableLure) {
    const spinner = GAME_CATALOG.lures.find((candidate) => candidate.id === STARTER_LURE_ID);
    if (spinner) {
      await env.DB
        .prepare(
          `INSERT INTO player_equipment (player_id, equipment_type, equipment_id, quantity, durability)
           VALUES (?, 'lure', ?, 1, ?)
           ON CONFLICT(player_id, equipment_type, equipment_id) DO UPDATE SET durability = excluded.durability, quantity = MAX(quantity, 1)`,
        )
        .bind(playerId, STARTER_LURE_ID, spinner.maximumDurability)
        .run();
      lureRestored = true;
    }
  }
  if (!wormsGranted && !lureRestored) {
    throw conflict("You still have a way to fish. The digging spot is for emergencies.");
  }

  const fresh = await env.DB.prepare("SELECT coins FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<{ coins: number }>();
  if (!fresh) throw notFound("The player game state was not found.");
  return { wormsGranted, lureRestored, coins: fresh.coins };
}
