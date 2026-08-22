import type {
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishingEncounterResponse,
  FishSpecimen,
  GameStateResponse,
  LocationAvailability,
  PlayerProfile,
} from "@fishing/shared";

export type ScreenId = "lakes" | "shop" | "collection" | "journal";

export interface EquipmentSelectionRequest {
  rodId?: string;
  lureId?: string;
  baitId?: string;
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatCoins(coins: number): string {
  return `${coins.toLocaleString()} coins`;
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function riskLabel(location: LocationAvailability): string {
  return `${capitalize(location.riskBand)} risk`;
}

function equipmentCard(label: string, name: string, detail: string): HTMLElement {
  const card = createElement("article", "equipment-card");
  card.append(createElement("span", "eyebrow", label), createElement("strong", undefined, name), createElement("span", "muted", detail));
  return card;
}

type CollectionSortMode = "newest" | "heaviest" | "value" | "species";

const collectionSorters: Record<CollectionSortMode, (a: FishSpecimen, b: FishSpecimen) => number> = {
  newest: (a, b) => b.caughtAt.localeCompare(a.caughtAt),
  heaviest: (a, b) => b.weightKg - a.weightKg,
  value: (a, b) => b.saleValueCoins - a.saleValueCoins,
  species: (a, b) => a.species.commonName.localeCompare(b.species.commonName) || b.weightKg - a.weightKg,
};

export class AppShell {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly player: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly game: HTMLElement;
  private gameState?: GameStateResponse;
  private activeScreen: ScreenId = "lakes";
  private selectedLocationId?: string;
  private collectionSort: CollectionSortMode = "newest";
  private latestCollection?: CollectionResponse;
  private latestJournal?: FishJournalResponse;
  private startFishingHandler?: (locationId: string) => void;
  private navigationHandler?: (screen: ScreenId) => void;
  private purchaseHandler?: (itemId: string) => void;
  private sellCatchHandler?: (catchId: string) => void;
  private selectEquipmentHandler?: (request: EquipmentSelectionRequest) => void;
  private recoveryHandler?: () => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.status = createElement("p", "status-message");
    this.player = createElement("p", "player-message");
    this.nav = createElement("nav", "screen-nav");
    this.nav.setAttribute("aria-label", "Game screens");
    this.game = createElement("div", "game-dashboard");
    this.root.replaceChildren(this.status, this.player, this.nav, this.game);
    this.renderNav();
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

  setNavigationHandler(handler: (screen: ScreenId) => void): void {
    this.navigationHandler = handler;
  }

  setPurchaseHandler(handler: (itemId: string) => void): void {
    this.purchaseHandler = handler;
  }

  setSellCatchHandler(handler: (catchId: string) => void): void {
    this.sellCatchHandler = handler;
  }

  setSelectEquipmentHandler(handler: (request: EquipmentSelectionRequest) => void): void {
    this.selectEquipmentHandler = handler;
  }

  setRecoveryHandler(handler: () => void): void {
    this.recoveryHandler = handler;
  }

  getActiveScreen(): ScreenId {
    return this.activeScreen;
  }

  setNavEnabled(enabled: boolean): void {
    this.nav.dataset.disabled = enabled ? "false" : "true";
  }

  updateWallet(coins: number): void {
    const wallet = this.nav.querySelector<HTMLElement>(".wallet strong");
    if (wallet && this.gameState) {
      this.gameState = { ...this.gameState, coins };
      wallet.textContent = formatCoins(coins);
    }
  }

  setActiveScreen(screen: ScreenId): void {
    this.activeScreen = screen;
    this.renderNav();
  }

  private renderNav(): void {
    const tabs: Array<{ id: ScreenId; label: string }> = [
      { id: "lakes", label: "Lakes" },
      { id: "shop", label: "Shop" },
      { id: "collection", label: "Collection" },
      { id: "journal", label: "Journal" },
    ];
    this.nav.replaceChildren();
    for (const tab of tabs) {
      const button = createElement("button", "screen-tab", tab.label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(this.activeScreen === tab.id));
      button.classList.toggle("is-active", this.activeScreen === tab.id);
      button.addEventListener("click", () => this.navigationHandler?.(tab.id));
      this.nav.append(button);
    }
    const wallet = createElement("div", "wallet");
    wallet.append(createElement("span", "eyebrow", "Wallet"), createElement("strong", undefined, formatCoins(this.gameState?.coins ?? 0)));
    this.nav.append(wallet);
  }

  setGameState(state: GameStateResponse): void {
    this.gameState = state;
    if (!this.selectedLocationId || !state.locations.some((location) => location.id === this.selectedLocationId)) {
      this.selectedLocationId = (state.locations.find((location) => location.unlocked) ?? state.locations[0]).id;
    }
    this.renderNav();
    if (this.activeScreen === "lakes") this.renderLakes();
  }

  private renderLakes(): void {
    const state = this.gameState;
    if (!state) return;
    const selectedLocation = state.locations.find((location) => location.id === this.selectedLocationId) ?? state.locations[0];
    let selectedLocationId = selectedLocation.id;

    const header = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(createElement("span", "eyebrow", "Where to next"), createElement("h1", undefined, "Choose your water"), createElement("p", "muted", "Pick a lake, check your tackle, and spend the next cast."));
    header.append(heading);

    const loadout = createElement("section", "dashboard-section");
    loadout.append(createElement("div", "section-heading", "Current loadout"));
    const equipmentGrid = createElement("div", "equipment-grid");
    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const rod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
    equipmentGrid.append(
      equipmentCard("Boat", boat?.name ?? state.activeEquipment.boatId, boat ? `Tier ${boat.tier} access gear` : "Permanent access gear"),
      equipmentCard("Rod", rod?.name ?? state.activeEquipment.rodId, rod ? `Supports up to ${rod.maxFishWeightKg} kg` : "Ready to cast"),
      equipmentCard("Lure", lure ? state.catalog.lures.find((item) => item.id === lure.id)?.name ?? lure.id : "No lure equipped", lure ? `${lure.durability ?? 0} uses left${lure.quantity > 1 ? ` · ${lure.quantity - 1} spare` : ""}` : "No lure equipped"),
      equipmentCard("Bait", bait ? state.catalog.baits.find((item) => item.id === bait.id)?.name ?? bait.id : "No bait selected", `${bait?.quantity ?? 0} portions ready`),
    );
    loadout.append(equipmentGrid);
    loadout.append(this.buildLoadoutSwitcher(state));

    const locationsSection = createElement("section", "dashboard-section");
    const locationHeading = createElement("div", "section-heading");
    locationHeading.append(createElement("span", undefined, "Fishing locations"), createElement("span", "section-note", "Access follows your boat"));
    locationsSection.append(locationHeading);
    const locationsGrid = createElement("div", "locations-grid");
    const selection = createElement("p", "selection-message", `Selected: ${selectedLocation.name}`);
    const startButton = createElement("button", "primary-action", `Start fishing at ${selectedLocation.name}`);
    const riskPreview = createElement("p", "risk-preview");

    const describeRisk = (): void => {
      const location = state.locations.find((candidate) => candidate.id === selectedLocationId);
      if (!location || !rod) return;
      const weights = location.fishIds.map((fishId) => state.catalog.fish.find((species) => species.id === fishId)?.maximumWeightKg ?? 0);
      const heaviest = Math.max(0, ...weights);
      const mismatch = heaviest > rod.maxFishWeightKg;
      riskPreview.className = mismatch ? "risk-preview is-warning" : "risk-preview";
      riskPreview.textContent = mismatch
        ? `Warning: fish here can reach ${heaviest} kg but your ${rod.name} supports up to ${rod.maxFishWeightKg} kg. A big fish could snap it.`
        : `Your ${rod.name} can handle every fish here (up to ${heaviest} kg). Typical catch value: ${formatCoins(location.expectedValueMinCoins)}–${formatCoins(location.expectedValueMaxCoins)}.`;
    };
    describeRisk();

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
          this.selectedLocationId = location.id;
          selection.textContent = `Selected: ${location.name}`;
          startButton.textContent = `Start fishing at ${location.name}`;
          describeRisk();
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
    locationsSection.append(locationsGrid, selection, riskPreview, startButton);

    const children: Element[] = [header, loadout, locationsSection];
    const recoveryBanner = this.buildRecoveryBanner(state);
    if (recoveryBanner) children.push(recoveryBanner);

    this.game.replaceChildren(...children);
  }

  private buildLoadoutSwitcher(state: GameStateResponse): HTMLElement {
    const container = createElement("div", "loadout-switcher");
    const slots: Array<{ slot: "rod" | "lure" | "bait"; label: string }> = [
      { slot: "rod", label: "rod" },
      { slot: "lure", label: "lure" },
      { slot: "bait", label: "bait" },
    ];
    for (const { slot, label } of slots) {
      const toggle = createElement("button", "change-equipment", `Change ${label}`);
      toggle.type = "button";
      const options = createElement("div", "equipment-options");
      options.hidden = true;

      const ownedIds = state.inventory[`${slot}s` as const].filter((item) => item.quantity > 0).map((item) => item.id);
      const catalog = slot === "rod" ? state.catalog.rods : slot === "lure" ? state.catalog.lures : state.catalog.baits;
      const ownedDefinitions = catalog.filter((definition) => ownedIds.includes(definition.id));

      for (const definition of ownedDefinitions) {
        const ownership = state.inventory[`${slot}s` as const].find((item) => item.id === definition.id);
        const detail =
          slot === "bait"
            ? `${ownership?.quantity ?? 0} portions`
            : slot === "lure"
              ? `${ownership?.durability ?? 0}/${(definition as (typeof state.catalog.lures)[number]).maximumDurability} uses`
              : `up to ${(definition as (typeof state.catalog.rods)[number]).maxFishWeightKg} kg`;
        const optionButton = createElement("button", "equipment-option", `${definition.name} · ${detail}`);
        optionButton.type = "button";
        if (state.activeEquipment[`${slot}Id`] === definition.id) optionButton.classList.add("is-active");
        optionButton.addEventListener("click", () => {
          options.hidden = true;
          this.selectEquipmentHandler?.({ [`${slot}Id`]: definition.id });
        });
        options.append(optionButton);
      }

      toggle.addEventListener("click", () => {
        for (const other of container.querySelectorAll<HTMLElement>(".equipment-options")) {
          if (other !== options) other.hidden = true;
        }
        options.hidden = !options.hidden;
      });

      const group = createElement("div", "loadout-slot");
      group.append(toggle, options);
      container.append(group);
    }
    return container;
  }

  private buildRecoveryBanner(state: GameStateResponse): HTMLElement | null {
    const totalUsableBait = state.inventory.baits.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
    const hasUsableLure = state.inventory.lures.some((item) => item.quantity > 0 && (item.durability ?? 0) >= 1);
    const wormPrice = state.catalog.baits.find((bait) => bait.id === "worm")?.priceCoins ?? 8;
    const stuck = state.coins < wormPrice && (totalUsableBait === 0 || !hasUsableLure);
    if (!stuck) return null;
    const banner = createElement("aside", "recovery-banner");
    const text = createElement("div");
    text.append(
      createElement("strong", undefined, "Out of tackle?"),
      createElement("p", "muted", "You can dig the shallows for worms and untangle your old spinner to keep fishing."),
    );
    const dig = createElement("button", "secondary-action", "Dig for worms");
    dig.type = "button";
    dig.addEventListener("click", () => this.recoveryHandler?.());
    banner.append(text, dig);
    return banner;
  }

  renderShop(): void {
    const state = this.gameState;
    if (!state) return;
    const panel = createElement("section", "shop-screen");
    const intro = createElement("div", "dashboard-header");
    const shopHeading = createElement("div");
    shopHeading.append(
      createElement("span", "eyebrow", "Tackle shop"),
      createElement("h1", undefined, "Gear up for deeper water"),
      createElement("p", "muted", "Better tackle opens harder water and bigger fish. Boats and rods are one-time buys."),
    );
    intro.append(shopHeading);

    const sections: Array<{ title: string; note: string; items: Array<{ id: string; name: string; description: string; priceCoins: number; detail: string; owned: boolean }> }> = [
      {
        title: "Boats",
        note: "Boats unlock new lakes permanently",
        items: state.catalog.boats.map((boat) => ({
          id: boat.id,
          name: boat.name,
          description: boat.description,
          priceCoins: boat.priceCoins,
          detail: `Tier ${boat.tier} · unlocks ${boat.unlocksLocationIds.map((id) => state.catalog.locations.find((location) => location.id === id)?.name ?? id).join(", ")}`,
          owned: state.inventory.boats.some((owned) => owned.id === boat.id && owned.quantity > 0),
        })),
      },
      {
        title: "Rods",
        note: "Stronger rods fight heavier fish",
        items: state.catalog.rods.map((rod) => ({
          id: rod.id,
          name: rod.name,
          description: rod.description,
          priceCoins: rod.priceCoins,
          detail: `Supports up to ${rod.maxFishWeightKg} kg · control ${rod.control.toFixed(2)} · catch zone +${Math.round(rod.catchZoneBonus * 100)}%`,
          owned: state.inventory.rods.some((owned) => owned.id === rod.id && owned.quantity > 0),
        })),
      },
      {
        title: "Lures",
        note: "Each lure lasts several fights before wearing out",
        items: state.catalog.lures.map((lure) => {
          const ownedItem = state.inventory.lures.find((owned) => owned.id === lure.id);
          return {
            id: lure.id,
            name: lure.name,
            description: lure.description,
            priceCoins: lure.priceCoins,
            detail: `${lure.maximumDurability} uses each · catch zone +${Math.round(lure.catchZoneBonus * 100)}%${ownedItem ? ` · own ${ownedItem.quantity} (${ownedItem.durability ?? 0} uses left)` : ""}`,
            owned: false,
          };
        }),
      },
      {
        title: "Bait",
        note: "Every cast consumes one portion",
        items: state.catalog.baits.map((bait) => ({
          id: bait.id,
          name: bait.name,
          description: bait.description,
          priceCoins: bait.priceCoins,
          detail: `Attracts ${bait.fishIds.length} species${state.inventory.baits.some((owned) => owned.id === bait.id) ? ` · own ${state.inventory.baits.find((owned) => owned.id === bait.id)?.quantity ?? 0}` : ""}`,
          owned: false,
        })),
      },
    ];

    panel.append(intro);
    for (const section of sections) {
      const sectionEl = createElement("section", "dashboard-section");
      sectionEl.append(createElement("div", "section-heading", section.title));
      const grid = createElement("div", "shop-grid");
      for (const item of section.items) {
        const card = createElement("article", "shop-card");
        const top = createElement("div", "shop-card-top");
        top.append(createElement("h2", undefined, item.name), createElement("span", "price-tag", item.priceCoins === 0 ? "Free" : formatCoins(item.priceCoins)));
        card.append(top, createElement("p", "muted", item.description), createElement("p", "shop-detail", item.detail));
        if ((section.title === "Boats" || section.title === "Rods") && item.owned && item.priceCoins > 0) {
          const ownedBadge = createElement("span", "owned-badge", "Owned");
          card.append(ownedBadge);
        } else {
          const button = createElement("button", "primary-action shop-buy");
          button.type = "button";
          if (state.coins < item.priceCoins) {
            button.disabled = true;
            button.textContent = `Need ${formatCoins(item.priceCoins - state.coins)} more`;
          } else {
            button.textContent = item.priceCoins === 0 ? "Claim free" : "Buy";
            button.addEventListener("click", () => this.purchaseHandler?.(item.id));
          }
          card.append(button);
        }
        grid.append(card);
      }
      sectionEl.append(grid);
      panel.append(sectionEl);
    }
    this.game.replaceChildren(panel);
  }

  showCollection(collection?: CollectionResponse): void {
    if (collection) this.latestCollection = collection;
    if (!this.latestCollection) {
      this.showLoadingScreen("Opening your collection…");
      return;
    }
    const specimens = [...this.latestCollection.fish];

    const panel = createElement("section", "collection-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(
      createElement("span", "eyebrow", "Your collection"),
      createElement("h1", undefined, `Kept fish${specimens.length ? ` (${specimens.length})` : ""}`),
      createElement("p", "muted", "Kept fish are individual trophies you can inspect now and sell later."),
    );
    intro.append(heading);
    panel.append(intro);

    if (specimens.length === 0) {
      panel.append(createElement("p", "empty-message", "No kept fish yet. Land a catch and choose “Keep fish” to start your collection."));
      this.game.replaceChildren(panel);
      return;
    }

    const sortRow = createElement("div", "sort-row");
    sortRow.append(createElement("label", "muted", "Sort"));
    const sortSelect = document.createElement("select");
    sortSelect.className = "sort-select";
    for (const [mode, label] of [
      ["newest", "Newest"],
      ["heaviest", "Heaviest"],
      ["value", "Most valuable"],
      ["species", "Species"],
    ] as Array<[CollectionSortMode, string]>) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = label;
      if (mode === this.collectionSort) option.selected = true;
      sortSelect.append(option);
    }
    sortSelect.addEventListener("change", () => {
      this.collectionSort = sortSelect.value as CollectionSortMode;
      this.rerenderCollectionGrid(grid, specimens);
    });
    sortRow.append(sortSelect);
    panel.append(sortRow);

    const grid = createElement("div", "collection-grid");
    panel.append(grid);
    this.rerenderCollectionGrid(grid, specimens);
    this.game.replaceChildren(panel);
  }

  private rerenderCollectionGrid(grid: HTMLElement, specimens: FishSpecimen[]): void {
    const sorter = collectionSorters[this.collectionSort];
    const sorted = [...specimens].sort(sorter);
    grid.replaceChildren();
    for (const specimen of sorted) {
      const card = createElement("article", "collection-card");
      const top = createElement("div", "collection-card-top");
      top.append(createElement("h2", undefined, specimen.species.commonName), createElement("span", `rarity-badge rarity-${specimen.species.rarity}`, capitalize(specimen.species.rarity)));
      card.append(top, this.specimenDetails(specimen));
      const sell = createElement("button", "secondary-action", `Sell for ${formatCoins(specimen.saleValueCoins)}`);
      sell.type = "button";
      sell.addEventListener("click", () => this.sellCatchHandler?.(specimen.id));
      card.append(sell);
      grid.append(card);
    }
  }

  renderJournal(journal?: FishJournalResponse): void {
    if (journal) this.latestJournal = journal;
    if (!this.latestJournal || !this.gameState) {
      this.showLoadingScreen("Opening your fish journal…");
      return;
    }
    const state = this.gameState;
    const discovered = this.latestJournal.entries.filter((entry) => entry.discovered);

    const panel = createElement("section", "journal-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(
      createElement("span", "eyebrow", "Fish journal"),
      createElement("h1", undefined, `${discovered.length} of ${this.latestJournal.entries.length} species discovered`),
      createElement("p", "muted", "Every species you land unlocks its page with your personal records."),
    );
    intro.append(heading);
    panel.append(intro);

    const grid = createElement("div", "journal-grid");
    for (const entry of this.latestJournal.entries) {
      const species = state.catalog.fish.find((candidate) => candidate.id === entry.speciesId);
      if (!species) continue;
      const card = createElement("article", `journal-card${entry.discovered ? "" : " is-undiscovered"}`);
      const top = createElement("div", "journal-card-top");
      top.append(
        createElement("h2", undefined, entry.discovered ? species.commonName : "Not yet discovered"),
        createElement("span", `rarity-badge rarity-${species.rarity}`, capitalize(species.rarity)),
      );
      card.append(top);
      if (entry.discovered) {
        card.append(createElement("em", "muted", species.scientificName));
        const stats = createElement("ul", "journal-stats");
        const statLine = (label: string, value: string): HTMLElement => {
          const li = createElement("li");
          li.append(createElement("span", "muted", label), createElement("strong", undefined, value));
          return li;
        };
        stats.append(
          statLine("Caught", `${entry.timesCaught.toLocaleString()} time${entry.timesCaught === 1 ? "" : "s"}`),
          statLine("Heaviest", entry.heaviestWeightKg !== null ? `${entry.heaviestWeightKg.toFixed(2)} kg` : "—"),
          statLine("Longest", entry.longestLengthCm !== null ? `${entry.longestLengthCm} cm` : "—"),
          statLine("Best sale", entry.bestSaleValueCoins !== null ? formatCoins(entry.bestSaleValueCoins) : "—"),
        );
        card.append(stats, createElement("p", "journal-bio", species.description), createElement("p", "journal-habitat muted", `Habitat: ${species.habitat}`));
      } else {
        card.append(createElement("p", "empty-message", `A ${species.rarity} fish of these waters. Catch one to reveal its page.`));
      }
      grid.append(card);
    }
    panel.append(grid);
    this.game.replaceChildren(panel);
  }

  showLoadingScreen(message: string): void {
    const panel = createElement("section", "fishing-status");
    panel.append(createElement("span", "eyebrow", "One moment"), createElement("p", "muted", message));
    this.game.replaceChildren(panel);
  }

  showEncounter(encounter: FishingEncounterResponse): void {
    const panel = createElement("section", "fishing-status");
    panel.append(
      createElement("span", "eyebrow", "Line out"),
      createElement("h1", undefined, `${encounter.species.commonName} is on`),
      createElement("p", "muted", `${encounter.locationName} · ${capitalize(encounter.rodRiskBand)} rod risk`),
      createElement("p", "fishing-instruction", "Keep the fish inside the net until the control meter fills. Hold to lift; release to drop."),
    );
    this.game.replaceChildren(panel);
  }

  showFishingResult(result: CompleteFishingResponse, onDecision: (decision: "keep" | "sell") => void, onBack: () => void): void {
    const panel = createElement("section", "fishing-status");
    panel.append(
      createElement("span", "eyebrow", result.outcome === "caught" ? "Fish landed" : "The line went slack"),
      createElement("h1", undefined, result.outcome === "caught" && result.catch ? result.catch.species.commonName : "The fish got away"),
      createElement("p", "muted", result.message),
    );
    if (result.rodBroke) {
      const warning = createElement("aside", "rod-break-warning");
      warning.append(
        createElement("strong", undefined, "Your rod snapped!"),
        createElement("p", "muted", result.replacementRodId ? "You equipped your strongest remaining rod. Visit the shop to replace what you lost." : "You have no rods left. Visit the shop to claim a replacement."),
      );
      panel.append(warning);
    }
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
      createElement("strong", undefined, `${capitalize(specimen.quality)} specimen`),
      createElement("span", "muted", `${specimen.weightKg.toFixed(2)} kg · ${specimen.lengthCm} cm`),
      createElement("em", "muted", specimen.species.scientificName),
      createElement("span", "muted", `${specimen.locationName} · ${new Date(specimen.caughtAt).toLocaleDateString()}`),
    );
    return details;
  }
}
