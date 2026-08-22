CREATE TABLE fishing_encounters (
  id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  length_cm INTEGER NOT NULL CHECK (length_cm > 0),
  quality TEXT NOT NULL CHECK (quality IN ('common', 'good', 'large', 'trophy', 'exceptional')),
  sale_value_coins INTEGER NOT NULL CHECK (sale_value_coins >= 0),
  difficulty_seed INTEGER NOT NULL,
  rod_id TEXT NOT NULL,
  lure_id TEXT NOT NULL,
  bait_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'caught', 'lost', 'expired')),
  completed_at TEXT
);

CREATE INDEX idx_fishing_encounters_player_status
  ON fishing_encounters (player_id, status);

CREATE TABLE player_catches (
  id TEXT PRIMARY KEY NOT NULL,
  encounter_id TEXT NOT NULL UNIQUE REFERENCES fishing_encounters(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  length_cm INTEGER NOT NULL CHECK (length_cm > 0),
  quality TEXT NOT NULL CHECK (quality IN ('common', 'good', 'large', 'trophy', 'exceptional')),
  sale_value_coins INTEGER NOT NULL CHECK (sale_value_coins >= 0),
  caught_at TEXT NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'kept', 'sold'))
);

CREATE INDEX idx_player_catches_player_status
  ON player_catches (player_id, status);
