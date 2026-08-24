UPDATE fishing_encounters
SET status = 'expired', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
WHERE status = 'active'
  AND EXISTS (
    SELECT 1
    FROM fishing_encounters AS newer
    WHERE newer.player_id = fishing_encounters.player_id
      AND newer.status = 'active'
      AND (
        newer.started_at > fishing_encounters.started_at
        OR (newer.started_at = fishing_encounters.started_at AND newer.id > fishing_encounters.id)
      )
  );

CREATE UNIQUE INDEX idx_one_active_encounter_per_player
  ON fishing_encounters (player_id)
  WHERE status = 'active';
