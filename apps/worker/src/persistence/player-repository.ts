import type { D1Database } from "@cloudflare/workers-types";
import type { PlayerProfile } from "@fishing/shared";

interface PlayerRow {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

function toProfile(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    telegramUsername: row.telegram_username,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PlayerRepository {
  constructor(private readonly db: D1Database) {}

  async upsertTelegramPlayer(input: { telegramUserId: string; telegramUsername?: string; displayName: string }): Promise<PlayerProfile> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO players (id, telegram_user_id, telegram_username, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           telegram_username = excluded.telegram_username,
           display_name = excluded.display_name,
           updated_at = excluded.updated_at`,
      )
      .bind(crypto.randomUUID(), input.telegramUserId, input.telegramUsername ?? null, input.displayName, now, now)
      .run();

    const row = await this.db
      .prepare(
        `SELECT id, telegram_user_id, telegram_username, display_name, created_at, updated_at
         FROM players WHERE telegram_user_id = ? LIMIT 1`,
      )
      .bind(input.telegramUserId)
      .first<PlayerRow>();

    if (!row) {
      throw new Error("The player was not available after upsert.");
    }
    return toProfile(row);
  }

  async findById(id: string): Promise<PlayerProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT id, telegram_user_id, telegram_username, display_name, created_at, updated_at
         FROM players WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<PlayerRow>();

    return row ? toProfile(row) : null;
  }
}
