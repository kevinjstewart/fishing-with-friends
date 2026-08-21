import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../env";
import { unauthorized } from "../lib/errors";
import { verifySessionToken } from "../lib/session";

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (context, next) => {
  const authorization = context.req.header("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw unauthorized();
  }

  const claims = await verifySessionToken(context.env, match[1]);
  context.set("playerId", claims.sub);
  await next();
};
