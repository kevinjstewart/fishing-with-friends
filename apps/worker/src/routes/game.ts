import type {
  CatchDecisionRequest,
  CompleteFishingRequest,
  CompleteFishingResponse,
  ActiveFishingEncounterResponse,
  FishingEncounterResponse,
  GameStateResponse,
  LeaderboardResponse,
  PurchaseRequest,
  SelectEquipmentRequest,
  StartFishingRequest,
} from "@fishing/shared";
import type { Hono } from "hono";
import type { Context } from "hono";
import type { AppVariables, Env } from "../env";
import { badRequest, tooManyRequests } from "../lib/errors";
import { actionRateLimit, castRateLimit, checkRateLimit } from "../lib/rate-limit";
import { requireAuth } from "../middleware/auth";
import { completeFishing, decideCatch, getActiveFishingEncounter, sellCatch, startFishing } from "../services/fishing-service";
import { getGameState } from "../services/game-service";
import { digForWorms, getCollection, getFishJournal, purchaseItem, selectEquipment } from "../services/shop-service";

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

function ensureStartRequest(value: StartFishingRequest): StartFishingRequest {
  if (!value || typeof value.locationId !== "string" || typeof value.rodId !== "string" || typeof value.lureId !== "string" || typeof value.baitId !== "string") {
    throw badRequest("locationId, rodId, lureId, and baitId are required.");
  }
  return value;
}

function ensureCompleteRequest(value: CompleteFishingRequest): CompleteFishingRequest {
  if (!value || typeof value.performance !== "number" || !Number.isFinite(value.performance)) {
    throw badRequest("performance must be a number between 0 and 1.");
  }
  return value;
}

function ensureDecisionRequest(value: CatchDecisionRequest): CatchDecisionRequest {
  if (!value || (value.decision !== "keep" && value.decision !== "sell")) {
    throw badRequest("decision must be keep or sell.");
  }
  return value;
}

function ensurePurchaseRequest(value: PurchaseRequest): PurchaseRequest {
  if (!value || typeof value.itemId !== "string" || value.itemId.trim().length === 0) {
    throw badRequest("itemId is required.");
  }
  if (value.quantity !== undefined && typeof value.quantity !== "number") {
    throw badRequest("quantity must be a number.");
  }
  return value;
}

function ensureSelectEquipmentRequest(value: SelectEquipmentRequest): SelectEquipmentRequest {
  if (!value || (typeof value.rodId !== "string" && typeof value.lureId !== "string" && typeof value.baitId !== "string")) {
    throw badRequest("Provide at least one of rodId, lureId, or baitId.");
  }
  const request: SelectEquipmentRequest = {};
  for (const key of ["rodId", "lureId", "baitId"] as const) {
    const id = value[key];
    if (id === undefined) continue;
    if (typeof id !== "string" || id.trim().length === 0) throw badRequest(`${key} must be a non-empty string.`);
    request[key] = id;
  }
  return request;
}

type GameRateBucket = "casts" | "actions";

function enforceRateLimit(context: Context<{ Bindings: Env; Variables: AppVariables }>, bucket: GameRateBucket): void {
  const limit = bucket === "casts" ? castRateLimit(context.env) : actionRateLimit(context.env);
  const result = checkRateLimit(`${context.get("playerId")}:${bucket}`, limit);
  if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds);
}

export function registerGameRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>): void {
  app.get("/api/game/friends", requireAuth, async (context) => {
    const rows = await context.env.DB.prepare(
      `SELECT p.id AS player_id, p.display_name,
              COUNT(c.id) AS catch_count, COALESCE(MAX(c.weight_kg), 0) AS heaviest_catch_kg
       FROM players p
       INNER JOIN player_game_states s ON s.player_id = p.id
       LEFT JOIN player_catches c ON c.player_id = p.id AND c.status = 'kept'
       GROUP BY p.id, p.display_name
       ORDER BY catch_count DESC, heaviest_catch_kg DESC, p.display_name ASC
       LIMIT 20`,
    ).all<{
      player_id: string;
      display_name: string;
      catch_count: number;
      heaviest_catch_kg: number;
    }>();

    const entries = rows.results.map((row, index) => ({
      rank: index + 1,
      playerId: row.player_id,
      displayName: row.display_name,
      catchCount: row.catch_count,
      heaviestCatchKg: row.heaviest_catch_kg,
    }));
    return context.json<LeaderboardResponse>({ entries });
  });

  app.get("/api/game/state", requireAuth, async (context) => {
    const state = await getGameState(context.env, context.get("playerId"));
    return context.json<GameStateResponse>(state);
  });

  app.get("/api/game/encounters/active", requireAuth, async (context) => {
    const active = await getActiveFishingEncounter(context.env, context.get("playerId"));
    return context.json<ActiveFishingEncounterResponse>(active);
  });

  app.post("/api/game/encounters", requireAuth, async (context) => {
    enforceRateLimit(context, "casts");
    const input = ensureStartRequest(await readJson<StartFishingRequest>(context.req.raw));
    const encounter = await startFishing(context.env, context.get("playerId"), input);
    return context.json<FishingEncounterResponse>(encounter, 201);
  });

  app.post("/api/game/encounters/:encounterId/complete", requireAuth, async (context) => {
    enforceRateLimit(context, "casts");
    const input = ensureCompleteRequest(await readJson<CompleteFishingRequest>(context.req.raw));
    const result = await completeFishing(context.env, context.get("playerId"), context.req.param("encounterId"), input);
    return context.json<CompleteFishingResponse>(result);
  });

  app.post("/api/game/catches/:catchId/decision", requireAuth, async (context) => {
    enforceRateLimit(context, "actions");
    const input = ensureDecisionRequest(await readJson<CatchDecisionRequest>(context.req.raw));
    const result = await decideCatch(context.env, context.get("playerId"), context.req.param("catchId"), input.decision);
    return context.json(result);
  });

  app.post("/api/game/catches/:catchId/sell", requireAuth, async (context) => {
    enforceRateLimit(context, "actions");
    const result = await sellCatch(context.env, context.get("playerId"), context.req.param("catchId"));
    return context.json(result);
  });

  app.get("/api/game/collection", requireAuth, async (context) => {
    const collection = await getCollection(context.env, context.get("playerId"));
    return context.json(collection);
  });

  app.get("/api/game/journal", requireAuth, async (context) => {
    const journal = await getFishJournal(context.env, context.get("playerId"));
    return context.json(journal);
  });

  app.post("/api/game/shop/purchase", requireAuth, async (context) => {
    enforceRateLimit(context, "actions");
    const input = ensurePurchaseRequest(await readJson<PurchaseRequest>(context.req.raw));
    const result = await purchaseItem(context.env, context.get("playerId"), input);
    return context.json(result);
  });

  app.post("/api/game/equipment/select", requireAuth, async (context) => {
    enforceRateLimit(context, "actions");
    const input = ensureSelectEquipmentRequest(await readJson<SelectEquipmentRequest>(context.req.raw));
    const result = await selectEquipment(context.env, context.get("playerId"), input);
    return context.json(result);
  });

  app.post("/api/game/recovery/dig-worms", requireAuth, async (context) => {
    enforceRateLimit(context, "actions");
    const result = await digForWorms(context.env, context.get("playerId"));
    return context.json(result);
  });
}
