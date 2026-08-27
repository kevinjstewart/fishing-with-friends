import type { AuthResponse, DevAuthRequest, TelegramAuthRequest } from "@fishing/shared/contracts";
import type { Hono } from "hono";
import type { Context } from "hono";
import type { AppVariables, Env } from "../env";
import { badRequest, forbidden, tooManyRequests } from "../lib/errors";
import { authRateLimit, checkRateLimit } from "../lib/rate-limit";
import { createSessionToken } from "../lib/session";
import { validateTelegramInitData } from "../lib/telegram";
import { findOrCreateTelegramPlayer } from "../services/player-service";

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

function ensureTelegramAuthRequest(value: TelegramAuthRequest): string {
  if (!value || typeof value.initData !== "string" || !value.initData) {
    throw badRequest("initData is required.");
  }
  return value.initData;
}

function ensureDevAuthRequest(value: DevAuthRequest): string {
  if (value?.displayName !== undefined && (typeof value.displayName !== "string" || value.displayName.length > 80)) {
    throw badRequest("displayName must be a string with at most 80 characters.");
  }
  return value?.displayName?.trim() || "Local developer";
}

function enforceAuthRateLimit(context: Context<{ Bindings: Env; Variables: AppVariables }>): void {
  const ip = context.req.header("CF-Connecting-IP") ?? "unknown";
  const result = checkRateLimit(`auth:${ip}`, authRateLimit(context.env));
  if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds);
}

export function registerAuthRoutes(app: Hono<{ Bindings: Env; Variables: AppVariables }>): void {
  app.post("/api/auth/telegram", async (context) => {
    enforceAuthRateLimit(context);
    const body = await readJson<TelegramAuthRequest>(context.req.raw);
    const initData = ensureTelegramAuthRequest(body);
    const validated = await validateTelegramInitData(initData, context.env.TELEGRAM_BOT_TOKEN);
    const player = await findOrCreateTelegramPlayer(context.env, validated.user);
    const session = await createSessionToken(context.env, player.id);
    return context.json<AuthResponse>({ ...session, player });
  });

  app.post("/api/auth/dev", async (context) => {
    if (context.env.ENVIRONMENT !== "development" || context.env.DEV_AUTH_ENABLED !== "true") {
      throw forbidden();
    }
    enforceAuthRateLimit(context);
    if (context.req.header("X-Dev-Auth") !== "true") {
      throw forbidden();
    }

    const body = await readJson<DevAuthRequest>(context.req.raw);
    const displayName = ensureDevAuthRequest(body);
    const player = await findOrCreateTelegramPlayer(context.env, {
      id: "local-development-player",
      username: "local_developer",
      first_name: displayName,
    });
    const session = await createSessionToken(context.env, player.id);
    return context.json<AuthResponse>({ ...session, player });
  });
}
