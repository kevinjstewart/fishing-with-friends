import type { D1Database } from "@cloudflare/workers-types";
import type {
  CatchDecision,
  CatchDecisionResponse,
  CompleteFishingRequest,
  CompleteFishingResponse,
  EquipmentType,
  FishQuality,
  FishSpecimen,
  FishingEncounterResponse,
  FishingMiniGameConfig,
  RiskBand,
  StartFishingRequest,
} from "@fishing/shared";
import { GAME_CATALOG } from "@fishing/shared";
import type { Env } from "../env";
import { conflict, badRequest, notFound } from "../lib/errors";
import { GameRepository } from "../persistence/game-repository";

interface PlayerStateRow {
  coins: number;
  active_boat_id: string;
  active_rod_id: string;
  active_lure_id: string;
  active_bait_id: string;
}

interface EquipmentRow {
  equipment_type: EquipmentType;
  equipment_id: string;
  quantity: number;
  durability: number | null;
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

interface CatchRow {
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
  const ratio = weightKg / rod.maxFishWeightKg;
  if (ratio <= 0.65) return "low";
  if (ratio <= 1) return "moderate";
  return "high";
}

function specimenFromRow(row: CatchRow | EncounterRow): FishSpecimen {
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

async function loadPlayerData(db: D1Database, playerId: string): Promise<{ state: PlayerStateRow; equipment: EquipmentRow[] }> {
  const [state, equipment] = await Promise.all([
    db.prepare("SELECT coins, active_boat_id, active_rod_id, active_lure_id, active_bait_id FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<PlayerStateRow>(),
    db.prepare("SELECT equipment_type, equipment_id, quantity, durability FROM player_equipment WHERE player_id = ?").bind(playerId).all<EquipmentRow>(),
  ]);
  if (!state) throw notFound("The player game state was not found.");
  return { state, equipment: equipment.results };
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
  if (!ownedLure || ownedLure.quantity < 1 || (ownedLure.durability ?? 0) < 1) throw conflict("That lure has no uses remaining.");
  if (!ownedBait || ownedBait.quantity < 1) throw conflict("You are out of that bait. Dig for Worms or visit the shop.");

  const activeEncounter = await env.DB.prepare("SELECT id FROM fishing_encounters WHERE player_id = ? AND status = 'active' AND expires_at > ? LIMIT 1").bind(playerId, new Date().toISOString()).first<{ id: string }>();
  if (activeEncounter) throw conflict("Finish your current fishing attempt first.");

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
    await env.DB.prepare("UPDATE player_equipment SET quantity = quantity + 1 WHERE player_id = ? AND equipment_type = 'bait' AND equipment_id = ?").bind(playerId, bait.id).run();
    throw conflict("Your lure changed. Check your loadout and try again.");
  }
  try {
    await env.DB.prepare(
      `INSERT INTO fishing_encounters
        (id, player_id, location_id, species_id, weight_kg, length_cm, quality, sale_value_coins, difficulty_seed, rod_id, lure_id, bait_id, started_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    ).bind(encounterId, playerId, location.id, species.id, specimen.weight_kg, specimen.length_cm, specimen.quality, specimen.sale_value_coins, difficultySeed, rod.id, lure.id, bait.id, startedAt.toISOString(), expiresAt.toISOString()).run();
  } catch (error) {
    await env.DB.prepare("UPDATE player_equipment SET quantity = quantity + 1 WHERE player_id = ? AND equipment_type = 'bait' AND equipment_id = ?").bind(playerId, bait.id).run();
    await env.DB.prepare("UPDATE player_equipment SET durability = durability + 1 WHERE player_id = ? AND equipment_type = 'lure' AND equipment_id = ?").bind(playerId, lure.id).run();
    throw error;
  }

  return {
    encounterId,
    locationId: location.id,
    locationName: location.name,
    species,
    miniGame,
    rodRiskBand: riskFor(specimen.weight_kg, rod),
    expiresAt: expiresAt.toISOString(),
  };
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
  const threshold = clamp(0.35 + species.difficulty * 0.38, 0.35, 0.75);
  const caught = input.performance >= threshold;
  const completedAt = new Date().toISOString();
  const update = await env.DB.prepare("UPDATE fishing_encounters SET status = ?, completed_at = ? WHERE id = ? AND player_id = ? AND status = 'active'").bind(caught ? "caught" : "lost", completedAt, encounterId, playerId).run();
  if (update.meta.changes !== 1) throw conflict("That fishing encounter has already been resolved.");

  if (!caught) {
    return { outcome: "lost", message: "The fish got away. Your bait and lure were spent, but your rod is still ready.", catch: null };
  }

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
  return { outcome: "caught", message: `You landed a ${species.commonName}. Decide whether to keep it or sell it.`, catch: specimenFromRow(catchRow) };
}

export async function decideCatch(env: Env, playerId: string, catchId: string, decision: CatchDecision): Promise<CatchDecisionResponse> {
  if (decision !== "keep" && decision !== "sell") throw badRequest("decision must be keep or sell.");
  const catchRow = await env.DB.prepare("SELECT * FROM player_catches WHERE id = ? AND player_id = ? LIMIT 1").bind(catchId, playerId).first<CatchRow>();
  if (!catchRow) throw notFound("That catch was not found.");
  if (catchRow.status !== "pending") throw conflict("That catch has already been decided.");

  const update = await env.DB.prepare("UPDATE player_catches SET status = ? WHERE id = ? AND player_id = ? AND status = 'pending'").bind(decision === "keep" ? "kept" : "sold", catchId, playerId).run();
  if (update.meta.changes !== 1) throw conflict("That catch has already been decided.");
  if (decision === "sell") {
    await env.DB.prepare("UPDATE player_game_states SET coins = coins + ?, updated_at = ? WHERE player_id = ?").bind(catchRow.sale_value_coins, new Date().toISOString(), playerId).run();
  }
  const state = await env.DB.prepare("SELECT coins FROM player_game_states WHERE player_id = ? LIMIT 1").bind(playerId).first<{ coins: number }>();
  if (!state) throw notFound("The player game state was not found.");
  return { decision, coins: state.coins, catch: specimenFromRow({ ...catchRow, status: decision === "keep" ? "kept" : "sold" }) };
}
