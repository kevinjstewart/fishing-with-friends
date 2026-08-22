import type { CatchDecisionResponse, CompleteFishingResponse, FishingEncounterResponse, FishSpecimen, GameStateResponse, LocationAvailability, PlayerProfile } from "@fishing/shared";

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatCoins(coins: number): string {
  return `${coins.toLocaleString()} coins`;
}

function equipmentLabel(state: GameStateResponse, id: string, type: "boat" | "rod" | "lure" | "bait"): string {
  const collection = state.catalog[`${type}s`];
  return collection.find((item) => item.id === id)?.name ?? id;
}

function riskLabel(location: LocationAvailability): string {
  return `${location.riskBand[0].toUpperCase()}${location.riskBand.slice(1)} risk`;
}

function equipmentCard(label: string, name: string, detail: string): HTMLElement {
  const card = createElement("article", "equipment-card");
  card.append(createElement("span", "eyebrow", label), createElement("strong", undefined, name), createElement("span", "muted", detail));
  return card;
}

export class AppShell {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly player: HTMLElement;
  private readonly game: HTMLElement;
  private startFishingHandler?: (locationId: string) => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.status = createElement("p", "status-message");
    this.player = createElement("p", "player-message");
    this.game = createElement("div", "game-dashboard");
    this.root.replaceChildren(this.status, this.player, this.game);
  }

  setStatus(message: string, state: "loading" | "ready" | "error" = "loading"): void {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  setPlayer(player: PlayerProfile): void {
    this.player.textContent = `Signed in as ${player.displayName}`;
  }

  setStartFishingHandler(handler: (locationId: string) => void): void {
    this.startFishingHandler = handler;
  }

  setGameState(state: GameStateResponse): void {
    const selectedLocation = state.locations.find((location) => location.unlocked) ?? state.locations[0];
    let selectedLocationId = selectedLocation.id;
    const header = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(createElement("span", "eyebrow", "Willow Pond is waiting"), createElement("h1", undefined, "Choose your water"), createElement("p", "muted", "Your first decision is where to spend the next cast."));
    const wallet = createElement("div", "wallet");
    wallet.append(createElement("span", "eyebrow", "Wallet"), createElement("strong", undefined, formatCoins(state.coins)));
    header.append(heading, wallet);

    const loadout = createElement("section", "dashboard-section");
    loadout.append(createElement("div", "section-heading", "Current loadout"));
    const equipmentGrid = createElement("div", "equipment-grid");
    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const rod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    equipmentGrid.append(
      equipmentCard("Boat", equipmentLabel(state, state.activeEquipment.boatId, "boat"), "Permanent access gear"),
      equipmentCard("Rod", equipmentLabel(state, state.activeEquipment.rodId, "rod"), rod ? `Supports up to ${rod.maxFishWeightKg} kg` : "Ready to cast"),
      equipmentCard("Lure", equipmentLabel(state, state.activeEquipment.lureId, "lure"), lure ? `${lure.durability ?? 0} uses remaining` : "No lure equipped"),
      equipmentCard("Bait", equipmentLabel(state, state.activeEquipment.baitId, "bait"), `${bait?.quantity ?? 0} portions ready`),
    );
    loadout.append(equipmentGrid);

    const locationsSection = createElement("section", "dashboard-section");
    const locationHeading = createElement("div", "section-heading");
    locationHeading.append(createElement("span", undefined, "Fishing locations"), createElement("span", "section-note", "Access follows your boat"));
    locationsSection.append(locationHeading);
    const locationsGrid = createElement("div", "locations-grid");
    const selection = createElement("p", "selection-message", `Selected: ${selectedLocation.name}`);
    const startButton = createElement("button", "primary-action", `Start fishing at ${selectedLocation.name}`);

    for (const location of state.locations) {
      const card = createElement("article", `location-card${location.id === selectedLocation.id ? " is-selected" : ""}${location.unlocked ? "" : " is-locked"}`);
      const cardTop = createElement("div", "location-card-top");
      cardTop.append(createElement("h2", undefined, location.name), createElement("span", `risk-badge risk-${location.riskBand}`, riskLabel(location)));
      const fishNames = location.fishIds
        .map((fishId) => state.catalog.fish.find((species) => species.id === fishId)?.commonName ?? fishId)
        .slice(0, 4)
        .join(" · ");
      card.append(cardTop, createElement("p", "muted", location.description), createElement("p", "fish-preview", fishNames));

      if (location.unlocked) {
        const button = createElement("button", "select-location", location.id === selectedLocation.id ? "Selected" : "Select lake");
        button.type = "button";
        button.setAttribute("aria-pressed", String(location.id === selectedLocation.id));
        button.addEventListener("click", () => {
          for (const otherCard of locationsGrid.querySelectorAll<HTMLElement>(".location-card")) otherCard.classList.remove("is-selected");
          for (const otherButton of locationsGrid.querySelectorAll<HTMLButtonElement>(".select-location")) {
            otherButton.textContent = "Select lake";
            otherButton.setAttribute("aria-pressed", "false");
          }
          card.classList.add("is-selected");
          button.textContent = "Selected";
          button.setAttribute("aria-pressed", "true");
          selectedLocationId = location.id;
          selection.textContent = `Selected: ${location.name}`;
          startButton.textContent = `Start fishing at ${location.name}`;
        });
        card.append(button);
      } else {
        const requiredBoat = state.catalog.boats.find((boat) => boat.id === location.requiredBoatId);
        card.append(createElement("p", "locked-message", `Locked · Requires ${requiredBoat?.name ?? "a better boat"}`));
      }
      locationsGrid.append(card);
    }
    startButton.type = "button";
    startButton.disabled = !selectedLocation.unlocked || !this.startFishingHandler;
    startButton.addEventListener("click", () => this.startFishingHandler?.(selectedLocationId));
    locationsSection.append(locationsGrid, selection, startButton);

    const note = createElement("aside", "next-step");
    note.append(createElement("strong", undefined, "Ready for the next step"), createElement("p", "muted", "Your starter boat, rod, copper spinner, and 10 worms are persisted to your player account. Fishing encounters and the skill challenge build on this setup."));

    this.game.replaceChildren(header, loadout, locationsSection, note);
  }

  showEncounter(encounter: FishingEncounterResponse): void {
    const panel = createElement("section", "fishing-status");
    panel.append(
      createElement("span", "eyebrow", "Line out"),
      createElement("h1", undefined, `${encounter.species.commonName} is on`),
      createElement("p", "muted", `${encounter.locationName} · ${encounter.rodRiskBand[0].toUpperCase()}${encounter.rodRiskBand.slice(1)} rod risk`),
      createElement("p", "fishing-instruction", "Use the playfield above to keep the fish inside the teal net. Hold to move up; release to let it fall."),
    );
    this.game.replaceChildren(panel);
  }

  showFishingResult(result: CompleteFishingResponse, onDecision: (decision: "keep" | "sell") => void, onBack: () => void): void {
    const panel = createElement("section", "fishing-status");
    panel.append(createElement("span", "eyebrow", result.outcome === "caught" ? "Fish landed" : "The line went slack"), createElement("h1", undefined, result.outcome === "caught" && result.catch ? result.catch.species.commonName : "The fish got away"), createElement("p", "muted", result.message));
    if (result.catch) {
      panel.append(this.specimenDetails(result.catch));
      const actions = createElement("div", "result-actions");
      const keep = createElement("button", "secondary-action", "Keep fish");
      const sell = createElement("button", "primary-action", `Sell for ${formatCoins(result.catch.saleValueCoins)}`);
      keep.type = "button";
      sell.type = "button";
      keep.addEventListener("click", () => onDecision("keep"));
      sell.addEventListener("click", () => onDecision("sell"));
      actions.append(keep, sell);
      panel.append(actions);
    } else {
      const back = createElement("button", "secondary-action", "Back to lakes");
      back.type = "button";
      back.addEventListener("click", onBack);
      panel.append(back);
    }
    this.game.replaceChildren(panel);
  }

  showDecisionResult(result: CatchDecisionResponse, onBack: () => void): void {
    const panel = createElement("section", "fishing-status");
    panel.append(
      createElement("span", "eyebrow", result.decision === "sell" ? "Fish sold" : "Fish kept"),
      createElement("h1", undefined, result.decision === "sell" ? `+${formatCoins(result.catch.saleValueCoins)}` : "Added to your collection"),
      createElement("p", "muted", `${result.catch.species.commonName} · Wallet: ${formatCoins(result.coins)}`),
      this.specimenDetails(result.catch),
    );
    const back = createElement("button", "primary-action", "Back to lakes");
    back.type = "button";
    back.addEventListener("click", onBack);
    panel.append(back);
    this.game.replaceChildren(panel);
  }

  private specimenDetails(specimen: FishSpecimen): HTMLElement {
    const details = createElement("div", "specimen-details");
    details.append(
      createElement("strong", undefined, `${specimen.quality[0].toUpperCase()}${specimen.quality.slice(1)} specimen`),
      createElement("span", "muted", `${specimen.weightKg.toFixed(2)} kg · ${specimen.lengthCm} cm`),
      createElement("em", "muted", specimen.species.scientificName),
    );
    return details;
  }
}
