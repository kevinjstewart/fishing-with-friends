CREATE TABLE player_species_records (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  times_caught INTEGER NOT NULL CHECK (times_caught > 0),
  heaviest_weight_kg REAL NOT NULL CHECK (heaviest_weight_kg > 0),
  longest_length_cm INTEGER NOT NULL CHECK (longest_length_cm > 0),
  best_sale_value_coins INTEGER NOT NULL CHECK (best_sale_value_coins >= 0),
  first_caught_at TEXT NOT NULL,
  last_caught_at TEXT NOT NULL,
  PRIMARY KEY (player_id, species_id)
);

CREATE INDEX idx_player_species_records_player
  ON player_species_records (player_id);
