import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  ENVIRONMENT: string;
  APP_ORIGIN?: string;
  DEV_AUTH_ENABLED?: string;
  SESSION_TTL_SECONDS?: string;
}

export type AppVariables = {
  playerId: string;
};
