import type { PlayerProfile } from "@fishing/shared";
import type { Env } from "../env";
import { displayNameForUser, type TelegramUser } from "../lib/telegram";
import { PlayerRepository } from "../persistence/player-repository";

export async function findOrCreateTelegramPlayer(env: Env, user: TelegramUser): Promise<PlayerProfile> {
  return new PlayerRepository(env.DB).upsertTelegramPlayer({
    telegramUserId: user.id,
    telegramUsername: user.username,
    displayName: displayNameForUser(user),
  });
}

export async function findPlayer(env: Env, playerId: string): Promise<PlayerProfile | null> {
  return new PlayerRepository(env.DB).findById(playerId);
}
