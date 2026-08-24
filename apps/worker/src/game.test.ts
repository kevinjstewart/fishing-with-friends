import type { D1Database } from "@cloudflare/workers-types";
import type { CompleteFishingResponse, FishingEncounterResponse, GameStateResponse } from "@fishing/shared";
import type { Env } from "./env";
import { app } from "./index";
import { resetRateLimits } from "./lib/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

interface StoredSpeciesRecord {
  player_id: string;
  species_id: string;
  times_caught: number;
  heaviest_weight_kg: number;
  longest_length_cm: number;
  best_sale_value_coins: number;
  first_caught_at: string;
  last_caught_at: string;
}

interface Stores {
  players: StoredPlayer[];
  gameStates: StoredGameState[];
  equipment: StoredEquipment[];
  encounters: StoredEncounter[];
  catches: StoredCatch[];
  records: StoredSpeciesRecord[];
}

function findEquipment(stores: Stores, playerId: string, type: string, id: string): StoredEquipment | undefined {
  return stores.equipment.find((item) => item.player_id === playerId && item.equipment_type === type && item.equipment_id === id);
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly stores: Stores,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const changes = await this.execute();
    return { success: true, meta: { changes } };
  }

  private execute(): number {
    const { sql, stores } = this;

    if (sql.includes("INSERT INTO players")) {
      const [id, telegramUserId, telegramUsername, displayName, createdAt, updatedAt] = this.values as [string, string, string | null, string, string, string];
      const existing = stores.players.find((player) => player.telegram_user_id === telegramUserId);
      if (existing) {
        existing.telegram_username = telegramUsername;
        existing.display_name = displayName;
        existing.updated_at = updatedAt;
      } else {
        stores.players.push({ id, telegram_user_id: telegramUserId, telegram_username: telegramUsername, display_name: displayName, created_at: createdAt, updated_at: updatedAt });
      }
      return 1;
    }

    if (sql.includes("INSERT OR IGNORE INTO player_game_states")) {
      const [playerId, coins, boatId, rodId, lureId, baitId, createdAt, updatedAt] = this.values as [string, number, string, string, string, string, string, string];
      if (!stores.gameStates.some((state) => state.player_id === playerId)) {
        stores.gameStates.push({ player_id: playerId, coins, active_boat_id: boatId, active_rod_id: rodId, active_lure_id: lureId, active_bait_id: baitId, created_at: createdAt, updated_at: updatedAt });
        return 1;
      }
      return 0;
    }

    if (sql.includes("INSERT OR IGNORE INTO player_equipment")) {
      const [playerId, equipmentType, equipmentId, quantity, durability] = this.values as [string, string, string, number, number | null];
      if (!stores.equipment.some((item) => item.player_id === playerId && item.equipment_type === equipmentType && item.equipment_id === equipmentId)) {
        stores.equipment.push({ player_id: playerId, equipment_type: equipmentType, equipment_id: equipmentId, quantity, durability });
        return 1;
      }
      return 0;
    }

    if (sql.includes("INSERT INTO player_species_records")) {
      const [playerId, speciesId, heaviest, longest, best, firstAt, lastAt] = this.values as [string, string, number, number, number, string, string];
      const existing = stores.records.find((record) => record.player_id === playerId && record.species_id === speciesId);
      if (!existing) {
        stores.records.push({ player_id: playerId, species_id: speciesId, times_caught: 1, heaviest_weight_kg: heaviest, longest_length_cm: longest, best_sale_value_coins: best, first_caught_at: firstAt, last_caught_at: lastAt });
      } else {
        existing.times_caught += 1;
        existing.heaviest_weight_kg = Math.max(existing.heaviest_weight_kg, heaviest);
        existing.longest_length_cm = Math.max(existing.longest_length_cm, longest);
        existing.best_sale_value_coins = Math.max(existing.best_sale_value_coins, best);
        existing.last_caught_at = lastAt;
      }
      return 1;
    }

    if (sql.includes("INSERT INTO fishing_encounters")) {
      const [id, playerId, locationId, speciesId, weight, length, quality, saleValue, seed, rodId, lureId, baitId, startedAt, expiresAt] = this.values as [string, string, string, string, number, number, string, number, number, string, string, string, string, string];
      stores.encounters.push({ id, player_id: playerId, location_id: locationId, species_id: speciesId, weight_kg: weight, length_cm: length, quality, sale_value_coins: saleValue, difficulty_seed: seed, rod_id: rodId, lure_id: lureId, bait_id: baitId, started_at: startedAt, expires_at: expiresAt, status: "active", completed_at: null });
      return 1;
    }

    if (sql.includes("INSERT INTO player_catches")) {
      const [id, encounterId, playerId, speciesId, weight, length, quality, saleValue, caughtAt, locationId] = this.values as [string, string, string, string, number, number, string, number, string, string];
      stores.catches.push({ id, encounter_id: encounterId, player_id: playerId, species_id: speciesId, weight_kg: weight, length_cm: length, quality, sale_value_coins: saleValue, caught_at: caughtAt, location_id: locationId, status: "pending" });
      return 1;
    }

    if (sql.includes("INSERT INTO player_equipment")) {
      const [playerId, second, third] = this.values as [string, string, number | string];
      let type: string;
      let quantity: number;
      let durability: number | null;
      if (sql.includes("'lure'")) {
        type = "lure";
        quantity = 1;
        durability = Number(third);
      } else if (sql.includes("'bait'")) {
        type = "bait";
        quantity = Number(third);
        durability = null;
      } else {
        type = String(second);
        quantity = 1;
        durability = null;
      }
      const id = sql.includes("'lure'") || sql.includes("'bait'") ? String(second) : String(third);
      const existing = findEquipment(stores, playerId, type, id);
      if (!existing) {
        stores.equipment.push({ player_id: playerId, equipment_type: type, equipment_id: id, quantity, durability });
        return 1;
      }
      if (sql.includes("quantity = MAX(quantity, 1)")) existing.quantity = Math.max(existing.quantity, 1);
      if (sql.includes("quantity = quantity + excluded.quantity")) existing.quantity += quantity;
      if (sql.includes("durability = excluded.durability")) {
        existing.durability = durability;
        existing.quantity = Math.max(existing.quantity, 1);
      }
      return 1;
    }

    if (sql.includes("SET coins = coins - ")) {
      const [amount, , playerId] = this.values as [number, string, string];
      const state = stores.gameStates.find((candidate) => candidate.player_id === playerId);
      if (state && state.coins >= amount) {
        state.coins -= amount;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET coins = coins + ")) {
      const [amount, , playerId] = this.values as [number, string, string];
      const state = stores.gameStates.find((candidate) => candidate.player_id === playerId);
      if (state) {
        state.coins += amount;
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE fishing_encounters SET status")) {
      const [status, completedAt, encounterId, playerId] = this.values as [string, string, string, string];
      const encounter = stores.encounters.find((candidate) => candidate.id === encounterId && candidate.player_id === playerId && candidate.status === "active");
      if (encounter) {
        encounter.status = status;
        encounter.completed_at = completedAt;
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE player_catches SET status = 'sold'")) {
      const [catchId, playerId] = this.values as [string, string];
      const storedCatch = stores.catches.find((candidate) => candidate.id === catchId && candidate.player_id === playerId && (candidate.status === "pending" || candidate.status === "kept"));
      if (storedCatch) {
        storedCatch.status = "sold";
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE player_catches SET status")) {
      const [status, catchId, playerId] = this.values as [string, string, string];
      const storedCatch = stores.catches.find((candidate) => candidate.id === catchId && candidate.player_id === playerId && candidate.status === "pending");
      if (storedCatch) {
        storedCatch.status = status;
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE player_game_states SET active_rod_id") || sql.includes("UPDATE player_game_states SET active_lure_id") || sql.includes("UPDATE player_game_states SET active_bait_id") || sql.includes("UPDATE player_game_states SET active_boat_id")) {
      const [idValue, , playerId] = this.values as [string, string, string];
      const state = stores.gameStates.find((candidate) => candidate.player_id === playerId);
      if (!state) return 0;
      if (sql.includes("active_rod_id")) state.active_rod_id = idValue;
      if (sql.includes("active_lure_id")) state.active_lure_id = idValue;
      if (sql.includes("active_bait_id")) state.active_bait_id = idValue;
      if (sql.includes("active_boat_id")) state.active_boat_id = idValue;
      return 1;
    }

    if (sql.includes("UPDATE player_equipment SET quantity = 0")) {
      const [playerId, rodId] = this.values as [string, string];
      const rod = findEquipment(stores, playerId, "rod", rodId);
      if (rod && rod.quantity > 0) {
        rod.quantity = 0;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET quantity = quantity - 1, durability = ?")) {
      const [freshDurability, playerId, lureId] = this.values as [number, string, string];
      const lure = findEquipment(stores, playerId, "lure", lureId);
      if (lure && lure.quantity > 0 && (lure.durability ?? 0) <= 0) {
        lure.quantity -= 1;
        lure.durability = freshDurability;
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE player_equipment SET quantity = quantity + 1")) {
      const [playerId, equipmentId] = this.values as [string, string];
      const type = sql.includes("'lure'") ? "lure" : "bait";
      const item = findEquipment(stores, playerId, type, equipmentId);
      if (item) {
        item.quantity += 1;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET durability = ? WHERE") && sql.includes("durability <= 0")) {
      const [freshDurability, playerId, lureId] = this.values as [number, string, string];
      const lure = findEquipment(stores, playerId, "lure", lureId);
      if (lure && (lure.durability ?? 0) < 1) {
        lure.durability = freshDurability;
        return 1;
      }
      return 0;
    }

    if (sql.includes("UPDATE player_equipment SET quantity = quantity - 1")) {
      const [playerId, equipmentId] = this.values as [string, string];
      const item = findEquipment(stores, playerId, "bait", equipmentId);
      if (item && item.quantity > 0) {
        item.quantity -= 1;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET durability = durability - 1")) {
      const [playerId, lureId] = this.values as [string, string];
      const lure = findEquipment(stores, playerId, "lure", lureId);
      if (lure && (lure.durability ?? 0) > 0) {
        lure.durability = (lure.durability ?? 0) - 1;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET durability = durability + 1")) {
      const [playerId, lureId] = this.values as [string, string];
      const lure = findEquipment(stores, playerId, "lure", lureId);
      if (lure) {
        lure.durability = (lure.durability ?? 0) + 1;
        return 1;
      }
      return 0;
    }

    if (sql.includes("SET durability = ?")) {
      const [freshDurability, playerId, lureId] = this.values as [number, string, string];
      const lure = findEquipment(stores, playerId, "lure", lureId);
      if (lure && (lure.durability ?? 0) < 1) {
        lure.durability = freshDurability;
        return 1;
      }
      return 0;
    }

    return 0;
  }

  async first<T>(): Promise<T | null> {
    const { sql, stores } = this;
    if (sql.includes("FROM players")) {
      const value = sql.includes("telegram_user_id = ?")
        ? stores.players.find((player) => player.telegram_user_id === this.values[0])
        : stores.players.find((player) => player.id === this.values[0]);
      return (value as T | undefined) ?? null;
    }
    if (sql.includes("FROM player_game_states")) {
      return (stores.gameStates.find((state) => state.player_id === this.values[0]) as T | undefined) ?? null;
    }
    if (sql.includes("FROM fishing_encounters")) {
      const value = sql.includes("status = 'active'")
        ? stores.encounters.find((encounter) => encounter.player_id === this.values[0] && encounter.status === "active")
        : stores.encounters.find((encounter) => encounter.id === this.values[0] && encounter.player_id === this.values[1]);
      return (value as T | undefined) ?? null;
    }
    if (sql.includes("FROM player_catches")) {
      const value = stores.catches.find((storedCatch) => storedCatch.id === this.values[0] && storedCatch.player_id === this.values[1]);
      return (value as T | undefined) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const { sql, stores } = this;
    if (sql.includes("FROM player_catches")) {
      const results = stores.catches
        .filter((row) => row.player_id === this.values[0] && (row.status === "pending" || row.status === "kept"))
        .sort((a, b) => b.caught_at.localeCompare(a.caught_at));
      return { results: results as T[] };
    }
    if (sql.includes("FROM players p")) {
      const rows = stores.gameStates.map((state) => {
        const player = stores.players.find((candidate) => candidate.id === state.player_id)!;
        const catches = stores.catches.filter((catchRow) => catchRow.player_id === player.id && catchRow.status === "kept");
        return {
          player_id: player.id,
          display_name: player.display_name,
          telegram_username: player.telegram_username,
          catch_count: catches.length,
          heaviest_catch_kg: Math.max(0, ...catches.map((catchRow) => catchRow.weight_kg)),
        };
      }).sort((a, b) => b.catch_count - a.catch_count || b.heaviest_catch_kg - a.heaviest_catch_kg || a.display_name.localeCompare(b.display_name));
      return { results: rows as T[] };
    }
    if (sql.includes("FROM player_species_records")) {
      return { results: stores.records.filter((record) => record.player_id === this.values[0]) as T[] };
    }
    return { results: stores.equipment.filter((item) => item.player_id === this.values[0]) as T[] };
  }
}

function createEnvironment(overrides: Partial<Env> = {}): { env: Env; stores: Stores } {
  const stores: Stores = { players: [], gameStates: [], equipment: [], encounters: [], catches: [], records: [] };
  const db = {
    prepare: (sql: string) => new FakeD1Statement(sql, stores),
    batch: async (statements: FakeD1Statement[]) => Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;
  const env: Env = {
    DB: db,
    TELEGRAM_BOT_TOKEN: "test-token",
    ENVIRONMENT: "development",
    DEV_AUTH_ENABLED: "true",
    APP_ORIGIN: "http://localhost:5173",
    RATE_LIMIT_AUTH_PER_MINUTE: "100000",
    RATE_LIMIT_CASTS_PER_MINUTE: "100000",
    RATE_LIMIT_ACTIONS_PER_MINUTE: "100000",
    ...overrides,
  };
  return { env, stores };
}

async function authenticate(env: Env): Promise<string> {
  const response = await app.request(
    "/api/auth/dev",
    { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Auth": "true" }, body: JSON.stringify({ displayName: "Game tester" }) },
    env,
  );
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

const jsonHeaders = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const authHeaders = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

interface TestHarness {
  env: Env;
  stores: Stores;
  token: string;
}

async function setup(): Promise<TestHarness> {
  const { env, stores } = createEnvironment();
  const token = await authenticate(env);
  return { env, stores, token };
}

const WILLOW_POND_SETUP = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

async function completeEncounter(harness: { env: Env; token: string }, encounterId: string, performance: number): Promise<Response> {
  vi.setSystemTime(Date.now() + 15_000);
  return app.request(`/api/game/encounters/${encodeURIComponent(encounterId)}/complete`, { method: "POST", headers: jsonHeaders(harness.token), body: JSON.stringify({ performance }) }, harness.env);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimits();
});

describe("game state route", () => {
  it("initializes a persistent starter loadout and exposes lake progression", async () => {
    const { env, token } = await setup();

    const response = await app.request("/api/game/state", { headers: { Authorization: `Bearer ${token}` } }, env);
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
      expect.objectContaining({ id: "cedar-marsh", unlocked: false }),
      expect.objectContaining({ id: "pinewater-lake", unlocked: false }),
      expect.objectContaining({ id: "lake-greywater", unlocked: false }),
    ]));
    expect(state.catalog.fish).toHaveLength(17);
  });

  it("does not duplicate starter equipment when state is requested again", async () => {
    const { env, token } = await setup();
    const headers = { Authorization: `Bearer ${token}` };

    await app.request("/api/game/state", { headers }, env);
    const response = await app.request("/api/game/state", { headers }, env);
    const state = (await response.json()) as GameStateResponse;

    expect(state.inventory.baits).toHaveLength(1);
    expect(state.inventory.baits[0].quantity).toBe(10);
    expect(state.inventory.lures[0].durability).toBe(10);
  });
});

describe("fishing loop", () => {
  it("restores an active encounter after reload and marks an interrupted encounter expired", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, stores, token } = await setup();
      const headers = authHeaders(token);
      const start = await app.request("/api/game/encounters", { method: "POST", headers: jsonHeaders(token), body: JSON.stringify(WILLOW_POND_SETUP) }, env);
      expect(start.status).toBe(201);
      const encounter = (await start.json()) as FishingEncounterResponse;

      const active = await app.request("/api/game/encounters/active", { headers }, env);
      expect(active.status).toBe(200);
      expect(await active.json()).toEqual({ encounter: expect.objectContaining({ encounterId: encounter.encounterId }), expired: false });

      const stored = stores.encounters.find((candidate) => candidate.id === encounter.encounterId);
      if (!stored) throw new Error("The active encounter was not stored.");
      stored.expires_at = new Date(Date.now() - 1_000).toISOString();

      const expired = await app.request("/api/game/encounters/active", { headers }, env);
      expect(expired.status).toBe(200);
      expect(await expired.json()).toEqual({ encounter: null, expired: true });
      expect(stored.status).toBe("expired");

      const noActiveEncounter = await app.request("/api/game/encounters/active", { headers }, env);
      expect(await noActiveEncounter.json()).toEqual({ encounter: null, expired: false });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("creates an encounter, consumes resources, resolves a catch exactly once, and updates the journal", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      expect(encounterResponse.status).toBe(201);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      expect(encounter.species.availableLocationIds).toContain("willow-pond");

      const stateAfterStart = (await (await app.request("/api/game/state", { headers }, env)).json()) as GameStateResponse;
      expect(stateAfterStart.inventory.baits[0].quantity).toBe(9);
      expect(stateAfterStart.inventory.lures[0].durability).toBe(9);

      const completeResponse = await completeEncounter({ env, token }, encounter.encounterId, 1);
      expect(completeResponse.status).toBe(200);
      const complete = (await completeResponse.json()) as CompleteFishingResponse;
      expect(complete.outcome).toBe("caught");
      expect(complete.rodBroke).toBe(false);
      expect(complete.species.id).toBe(encounter.species.id);
      expect(complete.rodId).toBe("starter-fiberglass");
      expect(["low", "moderate", "high"]).toContain(complete.rodRiskBand);
      expect(complete.rodBreakChancePercent).toBeGreaterThanOrEqual(0);
      expect(complete.catch?.speciesId).toBe(encounter.species.id);
      expect(complete.catch?.weightKg).toBeGreaterThanOrEqual(encounter.species.minimumWeightKg);
      expect(complete.catch?.weightKg).toBeLessThanOrEqual(encounter.species.maximumWeightKg);

      const duplicate = await completeEncounter({ env, token }, encounter.encounterId, 1);
      expect(duplicate.status).toBe(409);

      const journalResponse = await app.request("/api/game/journal", { headers: { Authorization: `Bearer ${token}` } }, env);
      expect(journalResponse.status).toBe(200);
      const journal = (await journalResponse.json()) as { entries: Array<{ speciesId: string; discovered: boolean; timesCaught: number; heaviestWeightKg: number | null }> };
      expect(journal.entries).toHaveLength(17);
      const entry = journal.entries.find((candidate) => candidate.speciesId === encounter.species.id);
      expect(entry).toMatchObject({ discovered: true, timesCaught: 1 });
      expect(entry?.heaviestWeightKg).toBeCloseTo(complete.catch?.weightKg ?? 0, 2);

      const sale = await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, env);
      expect(sale.status).toBe(200);
      const saleBody = (await sale.json()) as { coins: number };
      expect(saleBody.coins).toBe(100 + (complete.catch?.saleValueCoins ?? 0));

      const duplicateDecision = await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, env);
      expect(duplicateDecision.status).toBe(409);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("breaks an overloaded rod on a failed fight and falls back to the strongest remaining rod", async () => {
    const randomSpy = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.95)
      .mockReturnValue(0.0001);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      expect(encounter.species.id).toBe("smallmouth-bass");

      const completeResponse = await completeEncounter({ env, token }, encounter.encounterId, 0);
      expect(completeResponse.status).toBe(200);
      const complete = (await completeResponse.json()) as CompleteFishingResponse;
      expect(complete.outcome).toBe("lost");
      expect(complete.rodBroke).toBe(true);
      expect(complete.species.id).toBe(encounter.species.id);
      expect(complete.rodRiskBand).toBe("high");
      expect(complete.rodBreakChancePercent).toBeGreaterThan(0);
      expect(complete.message).toContain("snapped");

      const state = (await (await app.request("/api/game/state", { headers }, env)).json()) as GameStateResponse;
      expect(state.inventory.rods[0]).toMatchObject({ id: "starter-fiberglass", quantity: 0 });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("keeps rod risk at zero for easy fish with a suitable rod", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.001);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      expect(["yellow-perch", "pumpkinseed", "rock-bass", "bluegill"]).toContain(encounter.species.id);

      const completeResponse = await completeEncounter({ env, token }, encounter.encounterId, 0);
      const complete = (await completeResponse.json()) as CompleteFishingResponse;
      expect(complete.outcome).toBe("lost");
      expect(complete.rodBroke).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("collection", () => {
  it("lists kept fish and allows later sale exactly once", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      const complete = (await (await completeEncounter({ env, token }, encounter.encounterId, 1)).json()) as CompleteFishingResponse;

      const keep = await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "keep" }) }, env);
      expect(keep.status).toBe(200);

      const collectionResponse = await app.request("/api/game/collection", { headers: { Authorization: `Bearer ${token}` } }, env);
      expect(collectionResponse.status).toBe(200);
      const collection = (await collectionResponse.json()) as { fish: Array<{ id: string }> };
      expect(collection.fish.map((fish) => fish.id)).toContain(complete.catch?.id);

      const saleResponse = await app.request(`/api/game/catches/${complete.catch?.id}/sell`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
      expect(saleResponse.status).toBe(200);
      const sale = (await saleResponse.json()) as { coins: number; catch: { saleValueCoins: number } };
      expect(sale.coins).toBe(100 + sale.catch.saleValueCoins);

      const duplicateSale = await app.request(`/api/game/catches/${complete.catch?.id}/sell`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
      expect(duplicateSale.status).toBe(409);

      const emptied = (await (await app.request("/api/game/collection", { headers: { Authorization: `Bearer ${token}` } }, env)).json()) as { fish: unknown[] };
      expect(emptied.fish).toHaveLength(0);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("friends", () => {
  it("ranks players by kept catches and excludes sold fish", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);

      for (let index = 0; index < 2; index += 1) {
        const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(WILLOW_POND_SETUP) }, env);
        const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
        const complete = (await (await completeEncounter({ env, token }, encounter.encounterId, 1)).json()) as CompleteFishingResponse;
        await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: index === 0 ? "keep" : "sell" }) }, env);
      }

      const response = await app.request("/api/game/friends", { headers: { Authorization: `Bearer ${token}` } }, env);
      expect(response.status).toBe(200);
      const leaderboard = (await response.json()) as { entries: Array<{ displayName: string; catchCount: number; heaviestCatchKg: number }> };
      expect(leaderboard.entries).toHaveLength(1);
      expect(leaderboard.entries[0]).toMatchObject({ displayName: "Game tester", catchCount: 1 });
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("shop", () => {
  it("sells bait, validates purchases, and rejects unaffordable items", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, stores, token } = await setup();
      const headers = jsonHeaders(token);

      const worms = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "worm", quantity: 5 }) }, env);
      expect(worms.status).toBe(200);
      const wormResult = (await worms.json()) as { coins: number; inventory: GameStateResponse["inventory"] };
      expect(wormResult.coins).toBe(60);
      expect(wormResult.inventory.baits[0]).toMatchObject({ id: "worm", quantity: 15 });

      const tooExpensive = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "silver-spinner" }) }, env);
      expect(tooExpensive.status).toBe(409);

      const unknownItem = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "ghost-lure" }) }, env);
      expect(unknownItem.status).toBe(404);

      const badQuantity = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "worm", quantity: 0 }) }, env);
      expect(badQuantity.status).toBe(400);

      const duplicateBoat = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "shore-fishing" }) }, env);
      expect(duplicateBoat.status).toBe(409);

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify({ locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" }) }, env);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      const complete = (await (await completeEncounter({ env, token }, encounter.encounterId, 1)).json()) as CompleteFishingResponse;
      expect(complete.catch).not.toBeNull();
      const sale = (await (await app.request(`/api/game/catches/${complete.catch?.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, env)).json()) as { coins: number };

      const crayfish = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "crayfish" }) }, env);
      expect(crayfish.status).toBe(200);
      const crayfishResult = (await crayfish.json()) as { coins: number; inventory: GameStateResponse["inventory"] };
      expect(crayfishResult.coins).toBe(sale.coins - 28);
      expect(crayfishResult.inventory.baits.find((bait) => bait.id === "crayfish")?.quantity).toBe(1);

      const lure = stores.equipment.find((item) => item.player_id && item.equipment_type === "lure");
      if (!lure) throw new Error("Starter lure was not initialized.");
      lure.durability = 3;
      const replacementLure = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: lure.equipment_id }) }, env);
      expect(replacementLure.status).toBe(200);
      const replacementResult = (await replacementLure.json()) as { inventory: GameStateResponse["inventory"] };
      expect(replacementResult.inventory.lures[0]).toMatchObject({ id: lure.equipment_id, quantity: 2, durability: 3 });

      const selectCrayfish = await app.request("/api/game/equipment/select", { method: "POST", headers, body: JSON.stringify({ baitId: "crayfish" }) }, env);
      expect(selectCrayfish.status).toBe(200);
      const selectResult = (await selectCrayfish.json()) as { activeEquipment: GameStateResponse["activeEquipment"] };
      expect(selectResult.activeEquipment.baitId).toBe("crayfish");

      const unownedRod = await app.request("/api/game/equipment/select", { method: "POST", headers, body: JSON.stringify({ rodId: "lake-heavy" }) }, env);
      expect(unownedRod.status).toBe(409);

      const recoveryRefusal = await app.request("/api/game/recovery/dig-worms", { method: "POST", headers: authHeaders(token) }, env);
      expect(recoveryRefusal.status).toBe(409);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("unlocks the next lake when a boat is purchased once", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      for (let index = 0; index < 80 && (await currentCoins(env, token)) < 450; index += 1) {
        const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
        if (encounterResponse.status !== 201) {
          await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "worm", quantity: 5 }) }, env);
          await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "copper-spinner" }) }, env);
          continue;
        }
        const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
        const complete = (await (await completeEncounter({ env, token }, encounter.encounterId, 1)).json()) as CompleteFishingResponse;
        if (complete.catch) {
          await app.request(`/api/game/catches/${complete.catch.id}/decision`, { method: "POST", headers, body: JSON.stringify({ decision: "sell" }) }, env);
        }
      }

      const before = await currentCoins(env, token);
      expect(before).toBeGreaterThanOrEqual(450);

      const rowboat = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "rowboat" }) }, env);
      expect(rowboat.status).toBe(200);
      const rowboatResult = (await rowboat.json()) as { coins: number };
      expect(rowboatResult.coins).toBe(before - 450);

      const duplicate = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "rowboat" }) }, env);
      expect(duplicate.status).toBe(409);

      const state = (await (await app.request("/api/game/state", { headers }, env)).json()) as GameStateResponse;
      expect(state.locations.find((location) => location.id === "cedar-marsh")?.unlocked).toBe(true);
      expect(state.locations.find((location) => location.id === "pinewater-lake")?.unlocked).toBe(true);
      expect(state.locations.find((location) => location.id === "lake-greywater")?.unlocked).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }

    async function currentCoins(env: Env, token: string): Promise<number> {
      const response = await app.request("/api/game/state", { headers: authHeaders(token) }, env);
      const state = (await response.json()) as GameStateResponse;
      return state.coins;
    }
  });

  it("restores emergency tackle so a broke player can keep fishing", async () => {
    const { env, stores, token } = await setup();
    const headers = jsonHeaders(token);
    await app.request("/api/game/state", { headers }, env);

    const wormBait = stores.equipment.find((item) => item.equipment_type === "bait");
    const lure = stores.equipment.find((item) => item.equipment_type === "lure");
    if (!wormBait || !lure || !stores.gameStates[0]) throw new Error("Starter state was not initialized.");
    wormBait.quantity = 0;
    lure.durability = 0;
    stores.gameStates[0].coins = 3;

    const recovery = await app.request("/api/game/recovery/dig-worms", { method: "POST", headers }, env);
    expect(recovery.status).toBe(200);
    const recovered = (await recovery.json()) as { wormsGranted: number; lureRestored: boolean; coins: number };
    expect(recovered.wormsGranted).toBe(5);
    expect(recovered.lureRestored).toBe(true);
    expect(recovered.coins).toBe(3);

    const state = (await (await app.request("/api/game/state", { headers }, env)).json()) as GameStateResponse;
    expect(state.inventory.baits[0].quantity).toBe(5);
    expect(state.inventory.lures[0].durability).toBe(10);

    const again = await app.request("/api/game/recovery/dig-worms", { method: "POST", headers }, env);
    expect(again.status).toBe(409);
  });

  it("lets a broken rod be replaced for free from the shop", async () => {
    const randomSpy = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.95)
      .mockReturnValue(0.0001);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);
      const setupBody = { locationId: "willow-pond", rodId: "starter-fiberglass", lureId: "copper-spinner", baitId: "worm" };

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;
      await completeEncounter({ env, token }, encounter.encounterId, 0);

      const replacement = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "starter-fiberglass" }) }, env);
      expect(replacement.status).toBe(200);
      const replacementResult = (await replacement.json()) as { coins: number; inventory: GameStateResponse["inventory"]; activeEquipment: GameStateResponse["activeEquipment"] };
      expect(replacementResult.coins).toBe(100);
      expect(replacementResult.inventory.rods[0]).toMatchObject({ id: "starter-fiberglass", quantity: 1 });
      expect(replacementResult.activeEquipment.rodId).toBe("starter-fiberglass");

      const fishingAgain = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(setupBody) }, env);
      expect(fishingAgain.status).toBe(201);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("encounter hardening", () => {
  it("rejects completions that arrive faster than a real fight allows, without consuming the encounter", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { env, token } = await setup();
      const headers = jsonHeaders(token);

      const encounterResponse = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(WILLOW_POND_SETUP) }, env);
      expect(encounterResponse.status).toBe(201);
      const encounter = (await encounterResponse.json()) as FishingEncounterResponse;

      const instant = await app.request(`/api/game/encounters/${encounter.encounterId}/complete`, { method: "POST", headers, body: JSON.stringify({ performance: 1 }) }, env);
      expect(instant.status).toBe(409);
      expect(((await instant.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");

      const retry = await completeEncounter({ env, token }, encounter.encounterId, 1);
      expect(retry.status).toBe(200);
      expect(((await retry.json()) as CompleteFishingResponse).outcome).toBe("caught");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("rate limiting", () => {
  it("blocks casting beyond the configured burst while leaving other buckets open", async () => {
    resetRateLimits();
    const { env } = createEnvironment({
      RATE_LIMIT_CASTS_PER_MINUTE: "2",
      RATE_LIMIT_AUTH_PER_MINUTE: "100000",
      RATE_LIMIT_ACTIONS_PER_MINUTE: "100000",
    });
    const token = await authenticate(env);
    const headers = jsonHeaders(token);

    const first = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(WILLOW_POND_SETUP) }, env);
    expect(first.status).toBe(201);
    const second = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(WILLOW_POND_SETUP) }, env);
    expect(second.status).toBe(409);

    const third = await app.request("/api/game/encounters", { method: "POST", headers, body: JSON.stringify(WILLOW_POND_SETUP) }, env);
    expect(third.status).toBe(429);
    const blocked = (await third.json()) as { error: { code: string; message: string } };
    expect(blocked.error.code).toBe("RATE_LIMITED");
    expect(blocked.error.message).toContain("Try again in");

    const purchase = await app.request("/api/game/shop/purchase", { method: "POST", headers, body: JSON.stringify({ itemId: "worm" }) }, env);
    expect(purchase.status).toBe(200);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
