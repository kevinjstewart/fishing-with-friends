import type { ContentfulStatusCode } from "hono/utils/http-status";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ErrorResponse, HealthResponse, MeResponse } from "@fishing/shared/contracts";
import type { AppVariables, Env } from "./env";
import { requireAuth } from "./middleware/auth";
import { ApiError, notFound } from "./lib/errors";
import { registerAuthRoutes } from "./routes/auth";
import { registerGameRoutes } from "./routes/game";
import { findPlayer } from "./services/player-service";

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("/api/*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin, context) => {
      if (!origin) return "";
      if (context.env.APP_ORIGIN === "*") return "*";
      return context.env.APP_ORIGIN === origin ? origin : "";
    },
    allowHeaders: ["Authorization", "Content-Type", "X-Dev-Auth"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/api/health", (context) => {
  return context.json<HealthResponse>({ status: "ok", service: "fishing-with-friends-worker" });
});

registerAuthRoutes(app);
registerGameRoutes(app);

app.get("/api/me", requireAuth, async (context) => {
  const player = await findPlayer(context.env, context.get("playerId"));
  if (!player) {
    throw notFound("The authenticated player no longer exists.");
  }
  return context.json<MeResponse>({ player });
});

app.notFound((context) => {
  if (context.req.path.startsWith("/api/")) {
    throw notFound();
  }
  return context.text("Not found", 404);
});

app.onError((error, context) => {
  const apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  if (!(error instanceof ApiError)) {
    console.error("Unhandled Worker request error", { method: context.req.method, path: context.req.path });
  }
  return context.json<ErrorResponse>({ error: { code: apiError.code, message: apiError.message } }, apiError.status as ContentfulStatusCode);
});

export default app;
