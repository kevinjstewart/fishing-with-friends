import type { Env } from "../env";

interface RateLimitBucket {
  windowStart: number;
  count: number;
}

const WINDOW_MS = 60_000;
const buckets = new Map<string, RateLimitBucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limitPerMinute: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limitPerMinute) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

function limitFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function authRateLimit(env: Env): number {
  return limitFromEnv(env.RATE_LIMIT_AUTH_PER_MINUTE, 20);
}

export function castRateLimit(env: Env): number {
  return limitFromEnv(env.RATE_LIMIT_CASTS_PER_MINUTE, 30);
}

export function actionRateLimit(env: Env): number {
  return limitFromEnv(env.RATE_LIMIT_ACTIONS_PER_MINUTE, 90);
}
