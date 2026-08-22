import type {
  CatchDecisionRequest,
  CompleteFishingRequest,
  CompleteFishingResponse,
  FishingEncounterResponse,
  GameStateResponse,
  StartFishingRequest,
} from "@fishing/shared";
import type { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { badRequest } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { completeFishing, decideCatch, startFishing } from "../services/fishing-service";
import { getGameState } from "../services/game-service";

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

export function registerGameRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>): void {
  app.get("/api/game/state", requireAuth, async (context) => {
    const state = await getGameState(context.env, context.get("playerId"));
    return context.json<GameStateResponse>(state);
  });

  app.post("/api/game/encounters", requireAuth, async (context) => {
    const input = ensureStartRequest(await readJson<StartFishingRequest>(context.req.raw));
    const encounter = await startFishing(context.env, context.get("playerId"), input);
    return context.json<FishingEncounterResponse>(encounter, 201);
  });

  app.post("/api/game/encounters/:encounterId/complete", requireAuth, async (context) => {
    const input = ensureCompleteRequest(await readJson<CompleteFishingRequest>(context.req.raw));
    const result = await completeFishing(context.env, context.get("playerId"), context.req.param("encounterId"), input);
    return context.json<CompleteFishingResponse>(result);
  });

  app.post("/api/game/catches/:catchId/decision", requireAuth, async (context) => {
    const input = ensureDecisionRequest(await readJson<CatchDecisionRequest>(context.req.raw));
    const result = await decideCatch(context.env, context.get("playerId"), context.req.param("catchId"), input.decision);
    return context.json(result);
  });
}
