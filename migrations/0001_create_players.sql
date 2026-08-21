CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_players_telegram_user_id
  ON players (telegram_user_id);
