// Deterministic browser fixtures used by the Phase 0 baseline and async checks.

export const FISH_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/fixture-fish.svg";
export const FISH_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#244f49" />
      <stop offset="1" stop-color="#071b20" />
    </linearGradient>
    <linearGradient id="scales" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d7b36b" />
      <stop offset="0.52" stop-color="#b86d4c" />
      <stop offset="1" stop-color="#633449" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="12" />
    </filter>
  </defs>
  <rect width="640" height="360" fill="url(#water)" />
  <g fill="none" stroke="#b9d6bd" stroke-linecap="round" opacity="0.15">
    <path d="M38 82h194M422 62h148M82 294h164M390 274h212" stroke-width="3" />
    <path d="M12 122h112M500 130h108M280 38h92M264 326h142" stroke-width="1.5" />
  </g>
  <ellipse cx="323" cy="252" rx="190" ry="26" fill="#02090b" opacity="0.6" filter="url(#shadow)" />
  <path d="M117 187c49-70 169-99 286-38 30 16 56 39 83 69-30 4-62 18-85 38-109 94-246 48-284-25l-48 27 25-42-25-42 48 27Z" fill="url(#scales)" />
  <path d="M484 218 576 164l-26 54 26 54-92-54Z" fill="#d7b36b" opacity="0.9" />
  <path d="M229 149c31-37 76-50 118-43l-36 51ZM278 249c30 35 78 50 124 37l-42-48Z" fill="#e9cd88" opacity="0.75" />
  <circle cx="161" cy="182" r="10" fill="#f4eddf" />
  <circle cx="164" cy="181" r="4" fill="#071018" />
  <path d="M138 210c19 14 39 15 57 3" fill="none" stroke="#351f2b" stroke-width="5" stroke-linecap="round" />
  <path d="M226 166c-5 21-5 44 0 66M270 150c-6 31-6 62 0 92M318 151c-5 29-5 60 0 89M366 164c-4 22-4 44 0 66" fill="none" stroke="#f8d990" stroke-width="3" opacity="0.45" />
</svg>`;

const FIXTURE_DATE = "2026-01-01T12:00:00.000Z";

export function normalizeGameState(rawState) {
  const state = JSON.parse(JSON.stringify(rawState));
  const boat = state.catalog.boats[0];
  const rod = state.catalog.rods[0];
  const lure = state.catalog.lures[0];
  const bait = state.catalog.baits[0];
  state.coins = 999_999;
  state.activeEquipment = {
    boatId: boat.id,
    rodId: rod.id,
    lureId: lure.id,
    baitId: bait.id,
  };
  state.inventory = {
    ...state.inventory,
    boats: [{ id: boat.id, quantity: 1, durability: null }],
    rods: [{ id: rod.id, quantity: 1, durability: null }],
    lures: [{ id: lure.id, quantity: 1, durability: lure.maximumDurability }],
    baits: [{ id: bait.id, quantity: 12, durability: null }],
  };
  return state;
}

export function specimenFromState(state, { id, speciesIndex = 0, saleValueCoins = 184, weightMultiplier = 1.35, quality = "trophy" }) {
  const species = state.catalog.fish[speciesIndex % state.catalog.fish.length];
  const location = state.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]) ?? state.catalog.locations[0];
  return {
    id,
    speciesId: species.id,
    species,
    weightKg: Number((species.typicalWeightKg * weightMultiplier).toFixed(2)),
    lengthCm: Math.round(species.typicalLengthCm * 1.2),
    quality,
    saleValueCoins,
    caughtAt: FIXTURE_DATE,
    locationId: location.id,
    locationName: location.name,
  };
}

export function collectionFromState(state, { count = 3 } = {}) {
  return {
    fish: Array.from({ length: Math.min(count, state.catalog.fish.length) }, (_, index) => specimenFromState(state, {
      id: `phase0-collection-${index + 1}`,
      speciesIndex: index,
      saleValueCoins: [42, 81, 127][index] ?? 184,
      weightMultiplier: 1 + index * 0.12,
      quality: index === 0 ? "good" : index === 1 ? "large" : "trophy",
    })),
  };
}

export function journalFromState(state) {
  return {
    entries: state.catalog.fish.map((species, index) => ({
      speciesId: species.id,
      species,
      discovered: index === 0,
      timesCaught: index === 0 ? 2 : 0,
      heaviestWeightKg: index === 0 ? species.typicalWeightKg * 1.2 : null,
      longestLengthCm: index === 0 ? Math.round(species.typicalLengthCm * 1.1) : null,
      bestSaleValueCoins: index === 0 ? 184 : null,
      firstCaughtAt: index === 0 ? FIXTURE_DATE : null,
      lastCaughtAt: index === 0 ? FIXTURE_DATE : null,
    })),
  };
}

export function leaderboardFixture() {
  return {
    metric: "kept",
    metricDescription: "Ranked by kept fish. Sold fish do not count.",
    viewer: {
      playerId: "phase0-viewer",
      displayName: "Phase 0 Angler",
      rank: 2,
      keptFishCount: 3,
      heaviestKeptFishKg: 4.2,
    },
    entries: [
      { rank: 1, playerId: "phase0-leader", displayName: "Lake Captain", keptFishCount: 5, heaviestKeptFishKg: 6.1, catchCount: 5, heaviestCatchKg: 6.1 },
      { rank: 2, playerId: "phase0-viewer", displayName: "Phase 0 Angler", keptFishCount: 3, heaviestKeptFishKg: 4.2, catchCount: 3, heaviestCatchKg: 4.2 },
      { rank: 3, playerId: "phase0-third", displayName: "Dockside Scout", keptFishCount: 1, heaviestKeptFishKg: 2.7, catchCount: 1, heaviestCatchKg: 2.7 },
    ],
  };
}

export function completionResultFromState(state, { outcome = "caught", rodBroke = false, id = "phase0-catch", saleValueCoins = 184 } = {}) {
  const specimen = specimenFromState(state, { id, saleValueCoins });
  return {
    outcome,
    message: outcome === "caught" ? "A clean fight and a beautiful fish." : "One last run shook the hook free.",
    species: specimen.species,
    rodId: state.activeEquipment.rodId,
    rodRiskBand: rodBroke ? "high" : "low",
    rodBreakChancePercent: rodBroke ? 27.5 : 0.25,
    catch: outcome === "caught" ? specimen : null,
    rodBroke,
    replacementRodId: rodBroke ? state.catalog.rods[1]?.id ?? null : null,
  };
}

export function decisionResultFromState(state, decision, { id = `phase0-${decision}`, saleValueCoins = 184 } = {}) {
  return {
    decision,
    coins: decision === "sell" ? state.coins + saleValueCoins : state.coins,
    catch: specimenFromState(state, { id, saleValueCoins }),
  };
}

export async function installExternalFishFixtures(page) {
  await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ query: { pages: [{ thumbnail: { source: FISH_IMAGE_URL } }] } }),
    });
  });
  await page.route("https://upload.wikimedia.org/wikipedia/commons/fixture-fish.svg**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: FISH_IMAGE_SVG });
  });
}

export async function installDeterministicReadFixtures(page) {
  let normalizedState;
  await page.route("**/api/game/state", async (route) => {
    const response = await route.fetch();
    normalizedState = normalizeGameState(await response.json());
    await route.fulfill({
      status: response.status(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalizedState),
    });
  });
  await page.route("**/api/game/encounters/active", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ encounter: null, expired: false }) });
  });
  await page.route("**/api/game/collection", async (route) => {
    if (!normalizedState) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(collectionFromState(normalizedState)) });
  });
  await page.route("**/api/game/journal", async (route) => {
    if (!normalizedState) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(journalFromState(normalizedState)) });
  });
  await page.route("**/api/game/friends", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(leaderboardFixture()) });
  });
  await installExternalFishFixtures(page);
  return { getState: () => normalizedState };
}
