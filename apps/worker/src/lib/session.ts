import type { Env } from "../env";
import { base64UrlDecode, base64UrlEncode, bytesEqual, hmacSha256 } from "./crypto";
import { unauthorized } from "./errors";

interface SessionClaims {
  sub: string;
  exp: number;
}

function sessionSecret(env: Env): string {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  return `fishing-with-friends-session:${env.TELEGRAM_BOT_TOKEN}`;
}

export async function createSessionToken(env: Env, playerId: string): Promise<{ accessToken: string; expiresAt: string }> {
  const configuredTtl = Number(env.SESSION_TTL_SECONDS ?? 7 * 24 * 60 * 60);
  const ttlSeconds = Number.isSafeInteger(configuredTtl) && configuredTtl > 0 ? configuredTtl : 7 * 24 * 60 * 60;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = base64UrlEncode(JSON.stringify({ sub: playerId, exp: expiresAtSeconds } satisfies SessionClaims));
  const signature = base64UrlEncode(await hmacSha256(sessionSecret(env), payload));
  return { accessToken: `${payload}.${signature}`, expiresAt: new Date(expiresAtSeconds * 1000).toISOString() };
}

export async function verifySessionToken(env: Env, token: string): Promise<SessionClaims> {
  const [payloadPart, signaturePart, extraPart] = token.split(".");
  if (!payloadPart || !signaturePart || extraPart) {
    throw unauthorized("The session token is invalid.");
  }

  const receivedSignature = base64UrlDecode(signaturePart);
  if (!receivedSignature) {
    throw unauthorized("The session token is invalid.");
  }
  const expectedSignature = await hmacSha256(sessionSecret(env), payloadPart);
  if (!bytesEqual(receivedSignature, expectedSignature)) {
    throw unauthorized("The session token is invalid.");
  }

  const payload = base64UrlDecode(payloadPart);
  if (!payload) {
    throw unauthorized("The session token is invalid.");
  }

  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch {
    throw unauthorized("The session token is invalid.");
  }

  if (!claims || typeof claims !== "object") {
    throw unauthorized("The session token is invalid.");
  }
  const candidate = claims as Partial<SessionClaims>;
  if (
    typeof candidate.sub !== "string" ||
    !candidate.sub ||
    typeof candidate.exp !== "number" ||
    !Number.isSafeInteger(candidate.exp) ||
    candidate.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw unauthorized("The session token has expired.");
  }

  return { sub: candidate.sub, exp: candidate.exp };
}
