import type { D1Database } from "@cloudflare/workers-types";
import type { CompleteFishingResponse, FishingEncounterResponse, GameStateResponse } from "@fishing/shared";
import type { Env } from "./env";
import { app } from "./index";
import { describe, expect, it } from "vitest";

interface StoredPlayer {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface StoredGameState {
  player_id: string;
  coins: number;
  active_boat_id: string;
  active_rod_id: string;
  active_lure_id: string;
  active_bait_id: string;
  created_at: string;
  updated_at: string;
}

interface StoredEquipment {
  player_id: string;
  equipment_type: string;
  equipment_id: string;
  quantity: number;
  durability: number | null;
}

interface StoredEncounter {
  id: string;
  player_id: string;
  location_id: string;
  species_id: string;
  weight_kg: number;
  length_cm: number;
  quality: string;
  sale_value_coins: number;
  difficulty_seed: number;
  rod_id: string;
  lure_id: string;
  bait_id: string;
  started_at: string;
  expires_at: string;
  status: string;
  completed_at: string | null;
}

interface StoredCatch {
  id: string;
  encounter_id: string;
  player_id: string;
  species_id: string;
  weight_kg: number;
  length_cm: number;
  quality: string;
  sale_value_coins: number;
  caught_at: string;
  location_id: string;
  status: string;
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly players: StoredPlayer[],
    private readonly gameStates: StoredGameState[],
    private readonly equipment: StoredEquipment[],
    private readonly encounters: StoredEncounter[],
    private readonly catches: StoredCatch[],
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    let changes = 0;
    if (this.sql.includes("INSERT INTO players")) {
      const [id, telegramUserId, telegramUsername, displayName, createdAt, updatedAt] = this.values as [string, string, string | null, string, string, string];
      const existing = this.players.find((player) => player.telegram_user_id === telegramUserId);
      if (existing) {
        existing.telegram_username = telegramUsername;
        existing.display_name = displayName;
        existing.updated_at = updatedAt;
      } else {
        this.players.push({ id, telegram_user_id: telegramUserId, telegram_username: telegramUsername, display_name: displayName, created_at: createdAt, updated_at: updatedAt });
      }
      changes = 1;
    }

    if (this.sql.includes("INSERT OR IGNORE INTO player_game_states")) {
      const [playerId, coins, boatId, rodId, lureId, baitId, createdAt, updatedAt] = this.values as [string, number, string, string, string, string, string, string];
      if (!this.gameStates.some((state) => state.player_id === playerId)) {
        this.gameStates.push({ player_id: playerId, coins, active_boat_id: boatId, active_rod_id: rodId, active_lure_id: lureId, active_bait_id: baitId, created_at: createdAt, updated_at: updatedAt });
        changes = 1;
      }
    }

    if (this.sql.includes("INSERT OR IGNORE INTO player_equipment")) {
      const [playerId, equipmentType, equipmentId, quantity, durability] = this.values as [string, string, string, number, number | null];
      if (!this.equipment.some((item) => item.player_id === playerId && item.equipment_type === equipmentType && item.equipment_id === equipmentId)) {
        this.equipment.push({ player_id: playerId, equipment_type: equipmentType, equipment_id: equipmentId, quantity, durability });
        changes = 1;
      }
    }

    if (this.sql.includes("UPDATE player_equipment SET quantity")) {
      const [playerId, equipmentId] = this.values as [string, string];
      const item = this.equipment.find((candidate) => candidate.player_id === playerId && candidate.equipment_type === "bait" && candidate.equipment_id === equipmentId && (this.sql.includes("quantity + 1") || candidate.quantity > 0));
      if (item) {
        item.quantity += this.sql.includes("quantity + 1") ? 1 : -1;
        changes = 1;
      }
    }

    if (this.sql.includes("UPDATE player_equipment SET durability")) {
      const [playerId, equipmentId] = this.values as [string, string];
      const item = this.equipment.find((candidate) => candidate.player_id === playerId && candidate.equipment_type === "lure" && candidate.equipment_id === equipmentId && (this.sql.includes("durability + 1") || (candidate.durability ?? 0) > 0));
      if (item) {
        item.durability = (item.durability ?? 0) + (this.sql.includes("durability + 1") ? 1 : -1);
        changes = 1;
      }
    }

    if (this.sql.includes("INSERT INTO fishing_encounters")) {
      const [id, playerId, locationId, speciesId, weight, length, quality, saleValue, seed, rodId, lureId, baitId, startedAt, expiresAt] = this.values as [string, string, string, string, number, number, string, number, number, string, string, string, string, string];
      this.encounters.push({ id, player_id: playerId, location_id: locationId, species_id: speciesId, weight_kg: weight, length_cm: length, quality, sale_value_coins: saleValue, difficulty_seed: seed, rod_id: rodId, lure_id: lureId, bait_id: baitId, started_at: startedAt, expires_at: expiresAt, status: "active", completed_at: null });
      changes = 1;
    }

    if (this.sql.includes("UPDATE fishing_encounters SET status")) {
      const [status, completedAt, encounterId, playerId] = this.values as [string, string, string, string];
      const encounter = this.encounters.find((candidate) => candidate.id === encounterId && candidate.player_id === playerId && candidate.status === "active");
      if (encounter) {
        encounter.status = status;
        encounter.completed_at = completedAt;
        changes = 1;
      }
    }

    if (this.sql.includes("INSERT INTO player_catches")) {
      const [id, encounterId, playerId, speciesId, weight, length, quality, saleValue, caughtAt, locationId] = this.values as [string, string, string, string, number, number, string, number, string, string];
      this.catches.push({ id, encounter_id: encounterId, player_id: playerId, species_id: speciesId, weight_kg: weight, length_cm: length, quality, sale_value_coins: saleValue, caught_at: caughtAt, location_id: locationId, status: "pending" });
      changes = 1;
    }

    if (this.sql.includes("UPDATE player_catches SET status")) {
      const [status, catchId, playerId] = this.values as [string, string, string];
      const storedCatch = this.catches.find((candidate) => candidate.id === catchId && candidate.player_id === playerId && candidate.status === "pending");
      if (storedCatch) {
        storedCatch.status = status;
        changes = 1;
      }
    }

    if (this.sql.includes("UPDATE player_game_states SET coins")) {
      const [amount, , playerId] = this.values as [number, string, string];
      const state = this.gameStates.find((candidate) => candidate.player_id === playerId);
      if (state) {
        state.coins += amount;
        changes = 1;
      }
    }
    return { success: true, meta: { changes } };
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM players")) {
      const value = this.sql.includes("telegram_user_id = ?")
        ? this.players.find((player) => player.telegram_user_id === this.values[0])
        : this.players.find((player) => player.id === this.values[0]);
      return (value as T | undefined) ?? null;
    }
    if (this.sql.includes("FROM player_game_states")) {
      return (this.gameStates.find((state) => state.player_id === this.values[0]) as T | undefined) ?? null;
    }
    if (this.sql.includes("FROM fishing_encounters")) {
      const value = this.sql.includes("status = 'active'")
        ? this.encounters.find((encounter) => encounter.player_id === this.values[0] && encounter.status === "active")
        : this.encounters.find((encounter) => encounter.id === this.values[0] && encounter.player_id === this.values[1]);
      return (value as T | undefined) ?? null;
    }
    if (this.sql.includes("FROM player_catches")) {
      const value = this.catches.find((storedCatch) => storedCatch.id === this.values[0] && storedCatch.player_id === this.values[1]);
      return (value as T | undefined) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.equipment.filter((item) => item.player_id === this.values[0]) as T[] };
  }
}

function createEnvironment(): Env {
  const players: StoredPlayer[] = [];
  const gameStates: StoredGameState[] = [];
  const equipment: StoredEquipment[] = [];
  const encounters: StoredEncounter[] = [];
  const catches: StoredCatch[] = [];
  const db = {
    prepare: (sql: string) => new FakeD1Statement(sql, players, gameStates, equipment, encounters, catches),
    batch: async (statements: FakeD1Statement[]) => Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;
  return {
    DB: db,
    TELEGRAM_BOT_TOKEN: "test-token",
    ENVIRONMENT: "development",
    DEV_AUTH_ENABLED: "true",
    APP_ORIGIN: "http://localhost:5173",
  };
}

async function authenticate(environment: Env): Promise<string> {
  const response = await app.request(
    "/api/auth/dev",
    { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Auth": "true" }, body: JSON.stringify({ displayName: "Game tester" }) },
    environment,
  );
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

describe("game state route", () => {
  it("initializes a persistent starter loadout and exposes lake progression", async () => {
    const environment = createEnvironment();
    const accessToken = await authenticate(environment);

    const response = await app.request("/api/game/state", { headers: { Authorization: `Bearer ${accessToken}` } }, environment);
    expect(response.status).toBe(200);
    const state = (await response.json()) as GameStateResponse;

    expect(state).toMatchObject({
      coins: 100,
      activeEquipment: { boatId: "shore-fishing", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" },
      inventory: {
        boats: [{ id: "shore-fishing", quantity: 1 }],
        rods: [{ id: "starter-fiberglass", quantity: 1 }],
        lures: [{ id: "copper-spinner", quantity: 1, durability: 10 }],
        baits: [{ id: "worm", quantity: 10, durability: null }],
      },
    });
    expect(state.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "willow-pond", unlocked: true }),
      expect.objectContaining({ id: "pinewater-lake", unlocked: false }),
      expect.objectContaining({ id: "lake-greywater", unlocked: false }),
    ]));
    expect(state.catalog.fish).toHaveLength(13);
  });

  it("does not duplicate starter equipment when state is requested again", async () => {
    const environment = createEnvironment();
    const accessToken = await authenticate(environment);
    const headers = { Authorization: `Bearer ${accessToken}` };

    await app.request("/api/game/state", { headers }, environment);
    const response = await app.request("/api/game/state", { headers }, environment);
    const state = (await response.json()) as GameStateResponse;

    expect(state.inventory.baits).toHaveLength(1);
    expect(state.inventory.baits[0].quantity).toBe(10);
    expect(state.inventory.lures[0].durability).toBe(10);
  });

  it("creates an encounter, consumes resources, and resolves a catch exactly once", async () => {
    const environment = createEnvironment();
    const accessToken = await authenticate(environment);
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const setup = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

    const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setup) }, environment);
    expect(encounterResponse.status).toBe(201);
    const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
    expect(encounter.species.availableLocationIds).toContain("willow-pond");

    const stateAfterStart = (await (await app.request("/api/game/state", { headers }, environment)).json()) as GameStateResponse;
    expect(stateAfterStart.inventory.baits[0].quantity).toBe(9);
    expect(stateAfterStart.inventory.lures[0].durability).toBe(9);

    const completeResponse = await app.request(`/api/game/encounters/${encounter.encounterId}/complete`, { method: "POST", headers, body: JSON.stringify({ performance: 1 }) }, environment);
    expect(completeResponse.status).toBe(200);
    const complete = (await completeResponse.json()) as CompleteFishingResponse;
    expect(complete.outcome).toBe("caught");
    expect(complete.catch?.speciesId).toBe(encounter.species.id);
    expect(complete.catch?.weightKg).toBeGreaterThanOrEqual(encounter.species.minimumWeightKg);
    expect(complete.catch?.weightKg).toBeLessThanOrEqual(encounter.species.maximumWeightKg);

    const duplicate = await app.request(`/api/game/encounters/${encounter.encounterId}/complete`, { method: "POST", headers, body: JSON.stringify({ performance: 1 }) }, environment);
    expect(duplicate.status).toBe(409);

    const sale = await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, environment);
    expect(sale.status).toBe(200);
    const saleBody = (await sale.json()) as { coins: number };
    expect(saleBody.coins).toBe(100 + (complete.catch?.saleValueCoins ?? 0));

    const duplicateDecision = await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, environment);
    expect(duplicateDecision.status).toBe(409);
  });
});
