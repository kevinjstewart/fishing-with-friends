import type { D1Database } from "@cloudflare/workers-types";
import type {
  CatchDecision,
  CatchDecisionResponse,
  CompleteFishingRequest,
  CompleteFishingResponse,
  EquipmentType,
  FishQuality,
  ActiveFishingEncounterResponse,
  FishSpecimen,
  FishingEncounterResponse,
  FishingMiniGameConfig,
  RiskBand,
  SellCatchResponse,
  StartFishingRequest,
} from "@fishing/shared";
import { GAME_CATALOG, rodRiskBandForWeight } from "@fishing/shared";
import type { Env } from "../env";
import { conflict, badRequest, notFound } from "../lib/errors";
import { GameRepository } from "../persistence/game-repository";

export interface PlayerDataRow {
  coins: number;
  active_boat_id: string;
  active_rod_id: string;
  active_lure_id: string;
  active_bait_id: string;
}

export interface EquipmentRow {
  equipment_type: EquipmentType;
  equipment_id: string;
  quantity: number;
  durability: number | null;
}

export async function loadPlayerData(db: D1Database, playerId: string): Promise<{ state: PlayerDataRow; equipment: EquipmentRow[] }> {
  const [state, equipment] = await Promise.all([
    db.prepare("SELECT coins, active_boat_id, active_rod_id, active_lure_id, active_bait_id FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<PlayerDataRow>(),
    db.prepare("SELECT equipment_type, equipment_id, quantity, durability FROM player_equipment WHERE player_id = ?").bind(playerId).all<EquipmentRow>(),
  ]);
  if (!state) throw notFound("The player game state was not found.");
  return { state, equipment: equipment.results };
}

interface EncounterRow {
  id: string;
  player_id: string;
  location_id: string;
  species_id: string;
  weight_kg: number;
  length_cm: number;
  quality: FishQuality;
  sale_value_coins: number;
  difficulty_seed: number;
  rod_id: string;
  lure_id: string;
  bait_id: string;
  started_at: string;
  expires_at: string;
  status: "active" | "caught" | "lost" | "expired";
  completed_at: string | null;
}

export interface CatchRow {
  id: string;
  encounter_id: string;
  player_id: string;
  species_id: string;
  weight_kg: number;
  length_cm: number;
  quality: FishQuality;
  sale_value_coins: number;
  caught_at: string;
  location_id: string;
  status: "pending" | "kept" | "sold";
}

const rarityWeights = { common: 70, uncommon: 28, rare: 10, legendary: 2 } as const;
const rarityValueMultipliers = { common: 1, uncommon: 1.12, rare: 1.32, legendary: 1.7 } as const;
const qualityValueMultipliers: Record<FishQuality, number> = { common: 0.9, good: 1, large: 1.18, trophy: 1.55, exceptional: 2.2 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getEquipment(rows: EquipmentRow[], type: EquipmentType, id: string): EquipmentRow | undefined {
  return rows.find((row) => row.equipment_type === type && row.equipment_id === id);
}

function chooseWeighted<T>(items: T[], weights: number[], random = Math.random): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function selectEligibleSpecies(locationId: string, baitId: string, lureId: string, random = Math.random) {
  const location = GAME_CATALOG.locations.find((candidate) => candidate.id === locationId);
  const bait = GAME_CATALOG.baits.find((candidate) => candidate.id === baitId);
  const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === lureId);
  if (!location || !bait || !lure) return undefined;

  const eligible = GAME_CATALOG.fish.filter(
    (species) => location.fishIds.includes(species.id) && species.availableLocationIds.includes(location.id) && bait.fishIds.includes(species.id) && species.acceptedBaitIds.includes(bait.id),
  );
  if (eligible.length === 0) return undefined;

  const weights = eligible.map((species) => {
    const lurePreference = lure.preferredFishIds.includes(species.id) ? 1.8 : 1;
    const baitPreference = bait.fishIds.includes(species.id) ? bait.attraction : 1;
    return rarityWeights[species.rarity] * lurePreference * baitPreference;
  });
  return chooseWeighted(eligible, weights, random);
}

function specimenForSpecies(species: (typeof GAME_CATALOG.fish)[number], random = Math.random): Pick<EncounterRow, "weight_kg" | "length_cm" | "quality" | "sale_value_coins"> {
  const percentile = clamp(0.08 + random() * 0.9, 0.01, 0.99);
  const normalizedSize = Math.pow(percentile, 1.35);
  const weightKg = species.minimumWeightKg + (species.maximumWeightKg - species.minimumWeightKg) * normalizedSize;
  const lengthRatio = clamp((weightKg - species.minimumWeightKg) / (species.maximumWeightKg - species.minimumWeightKg), 0, 1);
  const lengthCm = Math.round(species.minimumLengthCm + (species.maximumLengthCm - species.minimumLengthCm) * lengthRatio);
  const quality: FishQuality = percentile >= 0.98 ? "exceptional" : percentile >= 0.88 ? "trophy" : percentile >= 0.68 ? "large" : percentile >= 0.3 ? "good" : "common";
  const sizeMultiplier = Math.pow(Math.max(0.25, weightKg / species.typicalWeightKg), 0.7);
  const saleValueCoins = Math.max(1, Math.round(species.baseValueCoins * sizeMultiplier * rarityValueMultipliers[species.rarity] * qualityValueMultipliers[quality]));
  return { weight_kg: Number(weightKg.toFixed(2)), length_cm: lengthCm, quality, sale_value_coins: saleValueCoins };
}

function miniGameFor(species: (typeof GAME_CATALOG.fish)[number], rod: (typeof GAME_CATALOG.rods)[number], lure: (typeof GAME_CATALOG.lures)[number]): FishingMiniGameConfig {
  return {
    catchZoneSize: Number(clamp(0.2 + rod.catchZoneBonus + lure.catchZoneBonus - species.difficulty * 0.08, 0.12, 0.44).toFixed(3)),
    catchMeterGainRate: Number((0.34 + rod.control * 0.08).toFixed(3)),
    catchMeterLossRate: Number((0.26 + species.difficulty * 0.34 + lure.difficultyModifier * 0.1).toFixed(3)),
    durationSeconds: Math.round(clamp(species.movementProfile.fightDurationSeconds * 0.55, 9, 24)),
  };
}

function riskFor(weightKg: number, rod: (typeof GAME_CATALOG.rods)[number]): RiskBand {
  return rodRiskBandForWeight(weightKg, rod.maxFishWeightKg);
}

function encounterResponseFromRow(row: EncounterRow): FishingEncounterResponse {
  const location = GAME_CATALOG.locations.find((candidate) => candidate.id === row.location_id);
  const species = GAME_CATALOG.fish.find((candidate) => candidate.id === row.species_id);
  const rod = GAME_CATALOG.rods.find((candidate) => candidate.id === row.rod_id);
  const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === row.lure_id);
  if (!location || !species || !rod || !lure) throw new Error("The stored fishing encounter references missing catalogue data.");

  return {
    encounterId: row.id,
    difficultySeed: row.difficulty_seed,
    locationId: location.id,
    locationName: location.name,
    species,
    miniGame: miniGameFor(species, rod, lure),
    rodRiskBand: riskFor(row.weight_kg, rod),
    expiresAt: row.expires_at,
  };
}

export async function getActiveFishingEncounter(env: Env, playerId: string): Promise<ActiveFishingEncounterResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const encounter = await env.DB
    .prepare("SELECT * FROM fishing_encounters WHERE player_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
    .bind(playerId)
    .first<EncounterRow>();
  if (!encounter) return { encounter: null, expired: false };

  if (new Date(encounter.expires_at).getTime() <= Date.now()) {
    await env.DB
      .prepare("UPDATE fishing_encounters SET status = ?, completed_at = ? WHERE id = ? AND player_id = ? AND status = 'active'")
      .bind("expired", new Date().toISOString(), encounter.id, playerId)
      .run();
    return { encounter: null, expired: true };
  }

  const response = encounterResponseFromRow(encounter);
  const remainingSeconds = Math.max(1, Math.ceil((new Date(encounter.expires_at).getTime() - Date.now()) / 1000));
  response.miniGame = {
    ...response.miniGame,
    durationSeconds: Math.min(response.miniGame.durationSeconds, remainingSeconds),
  };
  return { encounter: response, expired: false };
}

export interface RodBreakInput {
  weightKg: number;
  rodMaxFishWeightKg: number;
  breakResistance: number;
  performance: number;
}

export function rodBreakChancePercent(input: RodBreakInput): number {
  const ratio = input.weightKg / input.rodMaxFishWeightKg;
  let base: number;
  if (ratio <= 0.65) base = 0;
  else if (ratio <= 0.85) base = 0.05;
  else if (ratio <= 1) base = 0.25;
  else if (ratio <= 1.35) base = 0.9;
  else base = Math.min(4 + (ratio - 1.35) * 2, 10);
  const performanceFactor = 1.7 - clamp(input.performance, 0, 1) * 1.2;
  const resistanceFactor = 1.15 - (clamp(input.breakResistance, 0.98, 1) - 0.98) * 15;
  return Math.min(12, base * performanceFactor * resistanceFactor);
}

export function minimumFightSeconds(rodControl: number): number {
  const gainRate = 0.34 + rodControl * 0.08;
  const perfectPlaySeconds = (0.44 + 0.28 / 0.9) / gainRate;
  return Math.max(0.5, Math.floor(perfectPlaySeconds * 0.6 * 10) / 10);
}

export function specimenFromRow(row: CatchRow | EncounterRow): FishSpecimen {
  const species = GAME_CATALOG.fish.find((candidate) => candidate.id === row.species_id);
  const location = GAME_CATALOG.locations.find((candidate) => candidate.id === row.location_id);
  if (!species || !location) throw new Error("The stored fish references missing catalogue data.");
  return {
    id: row.id,
    speciesId: row.species_id,
    species,
    weightKg: row.weight_kg,
    lengthCm: row.length_cm,
    quality: row.quality,
    saleValueCoins: row.sale_value_coins,
    caughtAt: "caught_at" in row ? row.caught_at : row.started_at,
    locationId: row.location_id,
    locationName: location.name,
  };
}


export async function startFishing(env: Env, playerId: string, input: StartFishingRequest): Promise<FishingEncounterResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const { equipment } = await loadPlayerData(env.DB, playerId);
  const location = GAME_CATALOG.locations.find((candidate) => candidate.id === input.locationId);
  const rod = GAME_CATALOG.rods.find((candidate) => candidate.id === input.rodId);
  const lure = GAME_CATALOG.lures.find((candidate) => candidate.id === input.lureId);
  const bait = GAME_CATALOG.baits.find((candidate) => candidate.id === input.baitId);
  if (!location || !rod || !lure || !bait) throw badRequest("The selected fishing setup is invalid.");

  const ownedBoatIds = new Set(equipment.filter((item) => item.equipment_type === "boat" && item.quantity > 0).map((item) => item.equipment_id));
  const highestBoatTier = Math.max(0, ...GAME_CATALOG.boats.filter((candidate) => ownedBoatIds.has(candidate.id)).map((candidate) => candidate.tier));
  const requiredBoat = GAME_CATALOG.boats.find((candidate) => candidate.id === location.requiredBoatId);
  if (!requiredBoat || requiredBoat.tier > highestBoatTier) throw conflict("That water is locked by your current boat.");

  const ownedRod = getEquipment(equipment, "rod", rod.id);
  const ownedLure = getEquipment(equipment, "lure", lure.id);
  const ownedBait = getEquipment(equipment, "bait", bait.id);
  if (!ownedRod || ownedRod.quantity < 1) throw conflict("You do not own that rod.");
  if (!ownedLure || ownedLure.quantity < 1) throw conflict("You do not own that lure.");
  if ((ownedLure.durability ?? 0) < 1 && ownedLure.quantity < 2) throw conflict("That lure has no uses remaining. Buy a fresh one from the shop.");
  if (!ownedBait || ownedBait.quantity < 1) throw conflict("You are out of that bait. Dig for Worms or visit the shop.");

  const activeEncounter = await env.DB
    .prepare("SELECT id, expires_at FROM fishing_encounters WHERE player_id = ? AND status = 'active' LIMIT 1")
    .bind(playerId)
    .first<{ id: string; expires_at: string }>();
  if (activeEncounter) {
    if (new Date(activeEncounter.expires_at).getTime() <= Date.now()) {
      await env.DB
        .prepare("UPDATE fishing_encounters SET status = ?, completed_at = ? WHERE id = ? AND player_id = ? AND status = 'active'")
        .bind("expired", new Date().toISOString(), activeEncounter.id, playerId)
        .run();
    } else {
      throw conflict("Finish your current fishing attempt first.");
    }
  }

  const species = selectEligibleSpecies(location.id, bait.id, lure.id);
  if (!species) throw conflict("That bait cannot attract fish in this location.");
  const specimen = specimenForSpecies(species);
  const miniGame = miniGameFor(species, rod, lure);
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + (miniGame.durationSeconds + 30) * 1000);
  const encounterId = crypto.randomUUID();
  const difficultySeed = Math.floor(Math.random() * 2_147_483_647);

  const baitUpdate = await env.DB.prepare("UPDATE player_equipment SET quantity = quantity - 1 WHERE player_id = ? AND equipment_type = 'bait' AND equipment_id = ? AND quantity > 0").bind(playerId, bait.id).run();
  if (baitUpdate.meta.changes !== 1) throw conflict("Your bait changed. Check your loadout and try again.");
  const lureUpdate = await env.DB.prepare("UPDATE player_equipment SET durability = durability - 1 WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ? AND durability > 0").bind(playerId, lure.id).run();
  if (lureUpdate.meta.changes !== 1) {
    const spareSwap = await env.DB
      .prepare(
        "UPDATE player_equipment SET quantity = quantity - 1, durability = ? WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ? AND durability <= 0 AND quantity > 0",
      )
      .bind(Math.max(0, lure.maximumDurability - 1), playerId, lure.id)
      .run();
    if (spareSwap.meta.changes !== 1) {
      await env.DB.prepare("UPDATE player_equipment SET quantity = quantity + 1 WHERE player_id = ? AND equipment_type = 'bait' AND equipment_id = ?").bind(playerId, bait.id).run();
      throw conflict("That lure has no uses remaining. Tie on a fresh one from the shop.");
    }
  }
  try {
    await env.DB.prepare(
      `INSERT INTO fishing_encounters
        (id, player_id, location_id, species_id, weight_kg, length_cm, quality, sale_value_coins, difficulty_seed, rod_id, lure_id, bait_id, started_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    ).bind(encounterId, playerId, location.id, species.id, specimen.weight_kg, specimen.length_cm, specimen.quality, specimen.sale_value_coins, difficultySeed, rod.id, lure.id, bait.id, startedAt.toISOString(), expiresAt.toISOString()).run();
  } catch (error) {
    await env.DB.prepare("UPDATE player_equipment SET quantity = quantity + 1 WHERE player_id = ? AND equipment_type = 'bait' AND equipment_id = ?").bind(playerId, bait.id).run();
    if (lureUpdate.meta.changes === 1) {
      await env.DB.prepare("UPDATE player_equipment SET durability = durability + 1 WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ?").bind(playerId, lure.id).run();
    } else {
      await env.DB.prepare("UPDATE player_equipment SET quantity = quantity + 1, durability = 0 WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ?").bind(playerId, lure.id).run();
    }
    const activeAfterInsertFailure = await env.DB
      .prepare("SELECT id FROM fishing_encounters WHERE player_id = ? AND status = 'active' AND expires_at > ? LIMIT 1")
      .bind(playerId, new Date().toISOString())
      .first<{ id: string }>();
    if (activeAfterInsertFailure) throw conflict("Finish your current fishing attempt first.");
    throw error;
  }

  return encounterResponseFromRow({
    id: encounterId,
    player_id: playerId,
    location_id: location.id,
    species_id: species.id,
    weight_kg: specimen.weight_kg,
    length_cm: specimen.length_cm,
    quality: specimen.quality,
    sale_value_coins: specimen.sale_value_coins,
    difficulty_seed: difficultySeed,
    rod_id: rod.id,
    lure_id: lure.id,
    bait_id: bait.id,
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    status: "active",
    completed_at: null,
  });
}

export async function completeFishing(env: Env, playerId: string, encounterId: string, input: CompleteFishingRequest): Promise<CompleteFishingResponse> {
  if (!Number.isFinite(input.performance) || input.performance < 0 || input.performance > 1) throw badRequest("performance must be a number between 0 and 1.");
  const encounter = await env.DB.prepare("SELECT * FROM fishing_encounters WHERE id = ? AND player_id = ? LIMIT 1").bind(encounterId, playerId).first<EncounterRow>();
  if (!encounter) throw notFound("That fishing encounter was not found.");
  if (encounter.status !== "active") throw conflict("That fishing encounter has already been resolved.");
  if (new Date(encounter.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("UPDATE fishing_encounters SET status = 'expired', completed_at = ? WHERE id = ? AND player_id = ? AND status = 'active'").bind(new Date().toISOString(), encounterId, playerId).run();
    throw conflict("That fishing attempt expired. Your bait and lure were already used.");
  }

  const species = GAME_CATALOG.fish.find((candidate) => candidate.id === encounter.species_id);
  if (!species) throw new Error("The encounter references missing catalogue data.");
  const rod = GAME_CATALOG.rods.find((candidate) => candidate.id === encounter.rod_id);
  const fightSeconds = (Date.now() - new Date(encounter.started_at).getTime()) / 1000;
  if (rod && fightSeconds < minimumFightSeconds(rod.control)) {
    throw conflict("That result arrived faster than any real fight could. Try again once the fight has had time to happen.");
  }
  const threshold = clamp(0.35 + species.difficulty * 0.38, 0.35, 0.75);
  const caught = input.performance >= threshold;
  const completedAt = new Date().toISOString();
  const update = await env.DB.prepare("UPDATE fishing_encounters SET status = ?, completed_at = ? WHERE id = ? AND player_id = ? AND status = 'active'").bind(caught ? "caught" : "lost", completedAt, encounterId, playerId).run();
  if (update.meta.changes !== 1) throw conflict("That fishing encounter has already been resolved.");

  let rodBroke = false;
  let replacementRodId: string | null = null;
  const rodRiskBand = rod ? riskFor(encounter.weight_kg, rod) : "high";
  const actualRodBreakChancePercent = rod
    ? Number(
        rodBreakChancePercent({
          weightKg: encounter.weight_kg,
          rodMaxFishWeightKg: rod.maxFishWeightKg,
          breakResistance: rod.breakResistance,
          performance: input.performance,
        }).toFixed(2),
      )
    : 100;
  if (rod) {
    const breakChance = rodBreakChancePercent({
      weightKg: encounter.weight_kg,
      rodMaxFishWeightKg: rod.maxFishWeightKg,
      breakResistance: rod.breakResistance,
      performance: input.performance,
    });
    if (breakChance > 0 && Math.random() * 100 < breakChance) {
      const brokeUpdate = await env.DB.prepare(
        "UPDATE player_equipment SET quantity = 0 WHERE player_id = ? AND equipment_type = 'rod' AND equipment_id = ? AND quantity > 0",
      ).bind(playerId, rod.id).run();
      if (brokeUpdate.meta.changes === 1) {
        rodBroke = true;
        replacementRodId = await reassignRodAfterBreak(env.DB, playerId);
      }
    }
  }

  if (!caught) {
    const message = rodBroke && rod
      ? `The fish got away and your ${rod.name} snapped during the fight.`
      : "The fish got away. Your bait and lure were spent, but your rod is still ready.";
    return {
      outcome: "lost",
      message,
      species,
      rodId: encounter.rod_id,
      rodRiskBand,
      rodBreakChancePercent: actualRodBreakChancePercent,
      catch: null,
      rodBroke,
      replacementRodId,
    };
  }

  await recordSpeciesCatch(env.DB, playerId, encounter.species_id, encounter.weight_kg, encounter.length_cm, encounter.sale_value_coins, completedAt);

  const catchId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO player_catches
      (id, encounter_id, player_id, species_id, weight_kg, length_cm, quality, sale_value_coins, caught_at, location_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).bind(catchId, encounter.id, playerId, encounter.species_id, encounter.weight_kg, encounter.length_cm, encounter.quality, encounter.sale_value_coins, completedAt, encounter.location_id).run();

  const catchRow: CatchRow = {
    id: catchId,
    encounter_id: encounter.id,
    player_id: playerId,
    species_id: encounter.species_id,
    weight_kg: encounter.weight_kg,
    length_cm: encounter.length_cm,
    quality: encounter.quality,
    sale_value_coins: encounter.sale_value_coins,
    caught_at: completedAt,
    location_id: encounter.location_id,
    status: "pending",
  };
  let message = `You landed a ${species.commonName}. Decide whether to keep it or sell it.`;
  if (rodBroke) {
    const replacement = GAME_CATALOG.rods.find((candidate) => candidate.id === replacementRodId);
    message += ` Your ${rod?.name ?? "rod"} snapped during the landing${replacement ? `; you equip your ${replacement.name}.` : ". Visit the shop for a new rod."}`;
  }
  return {
    outcome: "caught",
    message,
    species,
    rodId: encounter.rod_id,
    rodRiskBand,
    rodBreakChancePercent: actualRodBreakChancePercent,
    catch: specimenFromRow(catchRow),
    rodBroke,
    replacementRodId,
  };
}

async function reassignRodAfterBreak(db: D1Database, playerId: string): Promise<string | null> {
  const ownedRods = await db
    .prepare("SELECT equipment_id FROM player_equipment WHERE player_id = ? AND equipment_type = 'rod' AND quantity > 0")
    .bind(playerId)
    .all<{ equipment_id: string }>();
  const ownedIds = new Set(ownedRods.results.map((row) => row.equipment_id));
  const strongest = GAME_CATALOG.rods.filter((rod) => ownedIds.has(rod.id)).sort((a, b) => b.strength - a.strength)[0];
  // Keep the non-null active_rod_id column valid when no usable rod remains.
  // The null return value tells the client that this is only a placeholder,
  // not a real replacement the player can fish with.
  const nextActiveRodId = strongest?.id ?? "starter-fiberglass";
  await db
    .prepare("UPDATE player_game_states SET active_rod_id = ?, updated_at = ? WHERE player_id = ?")
    .bind(nextActiveRodId, new Date().toISOString(), playerId)
    .run();
  return strongest?.id ?? null;
}

async function recordSpeciesCatch(
  db: D1Database,
  playerId: string,
  speciesId: string,
  weightKg: number,
  lengthCm: number,
  saleValueCoins: number,
  caughtAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO player_species_records
        (player_id, species_id, times_caught, heaviest_weight_kg, longest_length_cm, best_sale_value_coins, first_caught_at, last_caught_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, species_id) DO UPDATE SET
         times_caught = times_caught + 1,
         heaviest_weight_kg = MAX(heaviest_weight_kg, excluded.heaviest_weight_kg),
         longest_length_cm = MAX(longest_length_cm, excluded.longest_length_cm),
         best_sale_value_coins = MAX(best_sale_value_coins, excluded.best_sale_value_coins),
         last_caught_at = excluded.last_caught_at`,
    )
    .bind(playerId, speciesId, weightKg, lengthCm, saleValueCoins, caughtAt, caughtAt)
    .run();
}

export async function decideCatch(env: Env, playerId: string, catchId: string, decision: CatchDecision): Promise<CatchDecisionResponse> {
  if (decision !== "keep" && decision !== "sell") throw badRequest("decision must be keep or sell.");
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const catchRow = await env.DB.prepare("SELECT * FROM player_catches WHERE id = ? AND player_id = ? LIMIT 1").bind(catchId, playerId).first<CatchRow>();
  if (!catchRow) throw notFound("That catch was not found.");
  if (catchRow.status !== "pending") throw conflict("That catch has already been decided.");

  const statements = [
    env.DB.prepare("UPDATE player_catches SET status = ? WHERE id = ? AND player_id = ? AND status = 'pending'").bind(decision === "keep" ? "kept" : "sold", catchId, playerId),
  ];
  if (decision === "sell") {
    statements.push(env.DB.prepare("UPDATE player_game_states SET coins = coins + ?, updated_at = ? WHERE player_id = ?").bind(catchRow.sale_value_coins, new Date().toISOString(), playerId));
  }
  const updates = await env.DB.batch(statements);
  if (updates[0].meta.changes !== 1) throw conflict("That catch has already been decided.");
  const state = await env.DB.prepare("SELECT coins FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<{ coins: number }>();
  if (!state) throw notFound("The player game state was not found.");
  return { decision, coins: state.coins, catch: specimenFromRow({ ...catchRow, status: decision === "keep" ? "kept" : "sold" }) };
}

export async function sellCatch(env: Env, playerId: string, catchId: string): Promise<SellCatchResponse> {
  await new GameRepository(env.DB).ensurePlayerState(playerId);
  const catchRow = await env.DB.prepare("SELECT * FROM player_catches WHERE id = ? AND player_id = ? LIMIT 1").bind(catchId, playerId).first<CatchRow>();
  if (!catchRow) throw notFound("That fish was not found in your collection.");
  if (catchRow.status === "sold") throw conflict("That fish has already been sold.");

  const updates = await env.DB.batch([
    env.DB.prepare("UPDATE player_catches SET status = 'sold' WHERE id = ? AND player_id = ? AND status IN ('pending', 'kept')").bind(catchId, playerId),
    env.DB.prepare("UPDATE player_game_states SET coins = coins + ?, updated_at = ? WHERE player_id = ?").bind(catchRow.sale_value_coins, new Date().toISOString(), playerId),
  ]);
  if (updates[0].meta.changes !== 1) throw conflict("That fish has already been sold.");

  const state = await env.DB.prepare("SELECT coins FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<{ coins: number }>();
  if (!state) throw notFound("The player game state was not found.");
  return { coins: state.coins, catch: specimenFromRow({ ...catchRow, status: "sold" }) };
}
