CREATE TABLE player_game_states (
  player_id TEXT PRIMARY KEY NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coins INTEGER NOT NULL CHECK (coins >= 0),
  active_boat_id TEXT NOT NULL,
  active_rod_id TEXT NOT NULL,
  active_lure_id TEXT NOT NULL,
  active_bait_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE player_equipment (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('boat', 'rod', 'lure', 'bait')),
  equipment_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  durability INTEGER,
  PRIMARY KEY (player_id, equipment_type, equipment_id)
);

CREATE INDEX idx_player_equipment_player
  ON player_equipment (player_id);
