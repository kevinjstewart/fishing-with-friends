import { bytesEqual, hexToBytes, hmacSha256 } from "./crypto";
import { badRequest } from "./errors";

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 60;

export interface TelegramUser {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface ValidatedTelegramInitData {
  authDate: number;
  queryId?: string;
  user: TelegramUser;
}

function normalizeUser(value: unknown): TelegramUser {
  if (!value || typeof value !== "object") {
    throw badRequest("Telegram initData does not contain a valid user.");
  }

  const candidate = value as Record<string, unknown>;
  const rawId = candidate.id;
  const id = typeof rawId === "string" ? rawId : typeof rawId === "number" && Number.isSafeInteger(rawId) ? String(rawId) : null;
  if (!id || !/^\d+$/.test(id) || id === "0") {
    throw badRequest("Telegram initData does not contain a valid user ID.");
  }

  const username = typeof candidate.username === "string" ? candidate.username : undefined;
  const firstName = typeof candidate.first_name === "string" ? candidate.first_name : undefined;
  const lastName = typeof candidate.last_name === "string" ? candidate.last_name : undefined;

  return { id, username, first_name: firstName, last_name: lastName };
}

export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): Promise<ValidatedTelegramInitData> {
  if (!initData || initData.length > 8192) {
    throw badRequest("Telegram initData is missing or too large.");
  }

  const params = new URLSearchParams(initData);
  const values = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    if (values.has(key)) {
      throw badRequest("Telegram initData contains duplicate fields.");
    }
    values.set(key, value);
  }

  const receivedHash = values.get("hash");
  const hashBytes = receivedHash ? hexToBytes(receivedHash) : null;
  const authDateValue = values.get("auth_date");
  const userValue = values.get("user");
  if (!hashBytes || !authDateValue || !userValue) {
    throw badRequest("Telegram initData is missing required fields.");
  }

  const authDate = Number(authDateValue);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw badRequest("Telegram initData contains an invalid auth date.");
  }

  const dataCheckString = [...values.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmacSha256("WebAppData", botToken);
  const calculatedHash = await hmacSha256(secretKey, dataCheckString);
  if (!bytesEqual(calculatedHash, hashBytes)) {
    throw badRequest("Telegram initData signature is invalid.");
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS || nowSeconds - authDate > maxAgeSeconds) {
    throw badRequest("Telegram initData has expired.");
  }

  let user: TelegramUser;
  try {
    user = normalizeUser(JSON.parse(userValue) as unknown);
  } catch (error) {
    if (error instanceof Error && error.name === "ApiError") {
      throw error;
    }
    throw badRequest("Telegram initData contains invalid user data.");
  }

  return { authDate, queryId: values.get("query_id") || undefined, user };
}

export function displayNameForUser(user: TelegramUser): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.username || `Telegram user ${user.id}`;
}
