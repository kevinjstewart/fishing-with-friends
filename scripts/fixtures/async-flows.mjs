// Deterministic browser fixtures for request-lifecycle and encounter recovery checks.

export function deferred() {
  let release;
  let settled = false;
  const promise = new Promise((resolve) => {
    release = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });
  return { promise, release };
}

export function apiError(message, code = "VERIFICATION_FAILURE") {
  return { error: { code, message } };
}

export function activeEncounterFromState(gameState) {
  const location = gameState.locations.find((candidate) => candidate.unlocked) ?? gameState.locations[0];
  const species = gameState.catalog.fish.find((candidate) => candidate.availableLocationIds.includes(location.id)) ?? gameState.catalog.fish[0];
  return {
    encounterId: "browser-verification-encounter",
    difficultySeed: 12345,
    locationId: location.id,
    locationName: location.name,
    species,
    miniGame: {
      catchZoneSize: 0.28,
      catchMeterGainRate: 0.6,
      catchMeterLossRate: 0.4,
      durationSeconds: 12,
    },
    rodRiskBand: location.riskBand,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
