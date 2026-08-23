import type {
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishSpecimen,
  GameStateResponse,
  LeaderboardResponse,
  LocationAvailability,
  OwnedEquipment,
  RodDefinition,
} from "@fishing/shared";
import { createElement } from "./create-element";
import { createFishImage } from "./fish-images";

export type ScreenId = "lakes" | "friends" | "shop" | "collection" | "journal";

export interface EquipmentSelectionRequest {
  rodId?: string;
  lureId?: string;
  baitId?: string;
}

type IconName = "anchor" | "bait" | "book" | "coin" | "friend" | "lure" | "rod" | "shop" | "trophy" | "waves";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const ICON_PATHS: Record<IconName, string[]> = {
  waves: [
    "M3 9.5c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0",
    "M3 15c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0",
  ],
  shop: [
    "M6.5 8.5h11l-.9 11a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8l-.9-11Z",
    "M9 10.5V7a3 3 0 0 1 6 0v3.5",
  ],
  trophy: [
    "M8 21h8",
    "M12 17v4",
    "M7 4h10v5a5 5 0 0 1-10 0V4Z",
    "M7 6H4.5A2.5 2.5 0 0 0 7 10",
    "M17 6h2.5A2.5 2.5 0 0 1 17 10",
  ],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"],
  coin: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  friend: [
    "M10 11a3.25 3.25 0 1 0-3.2-4",
    "M3.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5",
    "M16.5 7.5A3 3 0 1 0 16 1.6",
    "M18.5 12.8c1.85.95 3 2.75 3 4.95",
  ],
  anchor: ["M12 7.5A2.25 2.25 0 1 0 12 3a2.25 2.25 0 0 0 0 4.5Z", "M12 7.5V21", "M4.5 13.5a7.5 7.5 0 0 0 15 0", "M8.5 10.5h7"],
  rod: [
    "M4 20C10.5 18.5 17.5 12 20 4",
    "M20 4c.8 3.2-.3 6.4-3 8.6",
    "M10.3 16.5a1.8 1.8 0 1 0-3.6 0 1.8 1.8 0 0 0 3.6 0Z",
  ],
  lure: [
    "M12 3v2",
    "M12 5c3 3.8 5 6 5 9a5 5 0 1 1-10 0c0-3 2-5.2 5-9Z",
    "M13.2 16.2a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 0 0 2.4 0Z",
  ],
  bait: ["M4 14.5c2-5 5-5 7 0s5 5 7 0"],
};

function createIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const SCREEN_ICONS: Record<ScreenId, IconName> = {
  lakes: "waves",
  friends: "friend",
  shop: "shop",
  collection: "trophy",
  journal: "book",
};

function formatCoins(coins: number): string {
  return `${coins.toLocaleString()}`;
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function riskLabel(location: LocationAvailability): string {
  return capitalize(location.riskBand);
}

function statChip(value: string | number, unit: string): HTMLElement {
  const chip = createElement("span", "stat-chip");
  chip.append(createElement("b", undefined, String(value)), createElement("small", undefined, unit));
  return chip;
}

function loadoutSlot(icon: IconName, label: string, name: string, detail: string): HTMLElement {
  const slot = createElement("article", "loadout-item");
  const chip = createElement("span", "equipment-icon");
  chip.append(createIcon(icon));
  const text = createElement("div", "equipment-text");
  text.append(createElement("span", "eyebrow", label), createElement("strong", undefined, name), createElement("span", "muted", detail));
  slot.append(chip, text);
  return slot;
}

function equipmentCard(icon: IconName, label: string, name: string, detail: string): HTMLElement {
  const card = loadoutSlot(icon, label, name, detail);
  card.classList.add("is-interactive");
  return card;
}

type CollectionSortMode = "newest" | "heaviest" | "value" | "species";

const collectionSorters: Record<CollectionSortMode, (a: FishSpecimen, b: FishSpecimen) => number> = {
  newest: (a, b) => b.caughtAt.localeCompare(a.caughtAt),
  heaviest: (a, b) => b.weightKg - a.weightKg,
  value: (a, b) => b.saleValueCoins - a.saleValueCoins,
  species: (a, b) => a.species.commonName.localeCompare(b.species.commonName) || b.weightKg - a.weightKg,
};

const BAIT_QUANTITY_CHOICES = [1, 5, 10, 25];

interface ToastHandle {
  root: HTMLElement;
  dismissTimer?: number;
}

export class AppShell {
  private readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly topbar: HTMLElement;
  private readonly walletChip: HTMLButtonElement;
  private readonly walletAmount: HTMLElement;
  private readonly content: HTMLElement;
  private readonly tabbar: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private gameState?: GameStateResponse;
  private activeScreen: ScreenId = "lakes";
  private selectedLocationId?: string;
  private collectionSort: CollectionSortMode = "newest";
  private latestCollection?: CollectionResponse;
  private latestJournal?: FishJournalResponse;
  private latestLeaderboard?: LeaderboardResponse;
  private stickyToast?: ToastHandle;
  private startFishingHandler?: (locationId: string) => void;
  private navigationHandler?: (screen: ScreenId) => void;
  private purchaseHandler?: (itemId: string, quantity?: number) => void;
  private sellCatchHandler?: (catchId: string) => void;
  private sellAllHandler?: () => void;
  private selectEquipmentHandler?: (request: EquipmentSelectionRequest) => void;
  private recoveryHandler?: () => void;
  private shareHandler?: () => void;
  private baitQuantities = new Map<string, number>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.topbar = createElement("header", "app-topbar");
    this.content = createElement("main", "app-content");
    this.tabbar = createElement("nav", "tabbar");
    this.tabbar.setAttribute("aria-label", "Game screens");
    this.toastLayer = createElement("div", "toast-layer");

    const brand = createElement("div", "app-brand");
    const mark = createElement("span", "brand-mark");
    mark.append(createIcon("rod"));
    brand.append(mark, createElement("span", undefined, "Fishing with Friends"));

    this.walletChip = createElement("button", "wallet-chip");
    this.walletChip.type = "button";
    this.walletChip.setAttribute("aria-label", "Open the tackle shop");
    this.walletAmount = createElement("strong", undefined, formatCoins(0));
    this.walletChip.append(createIcon("coin"), this.walletAmount);
    this.walletChip.addEventListener("click", () => this.navigationHandler?.("shop"));

    this.topbar.append(brand, this.walletChip);
    this.frame = createElement("div", "app-frame");
    this.frame.append(this.topbar, this.content, this.tabbar, this.toastLayer);
    this.root.replaceChildren(this.frame);
    this.renderTabs();
  }

  setStatus(message: string, state: "loading" | "ready" | "error" = "loading"): void {
    if (state === "loading") {
      if (this.stickyToast && this.stickyToast.root.isConnected) {
        this.stickyToast.root.querySelector("span")!.textContent = message;
        return;
      }
    } else {
      if (this.stickyToast) this.dismissToast(this.stickyToast);
    }
    this.stickyToast = this.makeToast(message, state, state === "loading" ? 15000 : 3200);
  }

  private makeToast(message: string, state: "loading" | "ready" | "error", lifetimeMs: number): ToastHandle {
    while (this.toastLayer.children.length >= 3) this.toastLayer.firstElementChild?.remove();
    const toast = createElement("div", "toast");
    toast.dataset.state = state;
    toast.setAttribute("role", "status");
    toast.append(createElement("span", undefined, message));
    this.toastLayer.append(toast);
    requestAnimationFrame(() => toast.classList.add("is-shown"));
    const handle: ToastHandle = { root: toast };
    handle.dismissTimer = window.setTimeout(() => this.dismissToast(handle), lifetimeMs);
    return handle;
  }

  private dismissToast(handle: ToastHandle): void {
    if (handle.dismissTimer) window.clearTimeout(handle.dismissTimer);
    handle.root.classList.remove("is-shown");
    handle.root.classList.add("is-leaving");
    window.setTimeout(() => handle.root.remove(), 260);
  }

  updateWallet(coins: number): void {
    if (this.gameState) this.gameState = { ...this.gameState, coins };
    this.walletAmount.textContent = formatCoins(coins);
    this.walletChip.classList.remove("did-update");
    void this.walletChip.offsetWidth;
    this.walletChip.classList.add("did-update");
  }

  getActiveScreen(): ScreenId {
    return this.activeScreen;
  }

  setNavEnabled(enabled: boolean): void {
    this.tabbar.dataset.disabled = enabled ? "false" : "true";
  }

  setActiveScreen(screen: ScreenId): void {
    this.activeScreen = screen;
    this.renderTabs();
  }

  private renderTabs(): void {
    const tabs: Array<{ id: ScreenId; label: string }> = [
      { id: "lakes", label: "Lakes" },
      { id: "friends", label: "Friends" },
      { id: "shop", label: "Shop" },
      { id: "collection", label: "Collection" },
      { id: "journal", label: "Journal" },
    ];
    this.tabbar.replaceChildren();
    for (const tab of tabs) {
      const button = createElement("button", "tab-button");
      button.type = "button";
      button.append(createIcon(SCREEN_ICONS[tab.id]), createElement("span", undefined, tab.label));
      if (this.activeScreen === tab.id) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => this.navigationHandler?.(tab.id));
      this.tabbar.append(button);
    }
  }

  setStartFishingHandler(handler: (locationId: string) => void): void {
    this.startFishingHandler = handler;
  }

  setNavigationHandler(handler: (screen: ScreenId) => void): void {
    this.navigationHandler = handler;
  }

  setPurchaseHandler(handler: (itemId: string, quantity?: number) => void): void {
    this.purchaseHandler = handler;
  }

  setSellCatchHandler(handler: (catchId: string) => void): void {
    this.sellCatchHandler = handler;
  }

  setSellAllHandler(handler: () => void): void {
    this.sellAllHandler = handler;
  }

  setSelectEquipmentHandler(handler: (request: EquipmentSelectionRequest) => void): void {
    this.selectEquipmentHandler = handler;
  }

  setRecoveryHandler(handler: () => void): void {
    this.recoveryHandler = handler;
  }

  setShareHandler(handler: () => void): void {
    this.shareHandler = handler;
  }

  showLeaderboard(leaderboard?: LeaderboardResponse): void {
    if (leaderboard) this.latestLeaderboard = leaderboard;
    if (!this.latestLeaderboard) {
      this.showLoadingScreen("Casting the net…");
      return;
    }

    const panel = createElement("section", "screen friends-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(createElement("span", "eyebrow", "Fishing crew"), createElement("h1", undefined, "Catch board"));
    intro.append(heading);
    panel.append(intro);

    const invite = createElement("button", "primary-action invite-action");
    invite.type = "button";
    invite.append(createIcon("friend"), "Invite anglers");
    invite.addEventListener("click", () => this.shareHandler?.());
    panel.append(invite);

    if (this.latestLeaderboard.entries.length === 0) {
      panel.append(createElement("p", "empty-message", "No catches yet. Be first on the board."));
      this.replaceScreen(panel);
      return;
    }

    const list = createElement("ol", "crew-board");
    for (const entry of this.latestLeaderboard.entries.slice(0, 10)) {
      const row = createElement("li", `crew-row${entry.rank === 1 ? " is-leader" : ""}`);
      row.append(
        createElement("span", "crew-rank", `${entry.rank}`),
        (() => {
          const name = createElement("div", "crew-name", entry.displayName);
          name.append(createElement("small", "muted", `${entry.catchCount} caught · ${entry.heaviestCatchKg.toFixed(1)} kg`));
          return name;
        })(),
      );
      list.append(row);
    }
    panel.append(list);
    this.replaceScreen(panel);
  }

  setGameState(state: GameStateResponse): void {
    this.gameState = state;
    if (!this.selectedLocationId || !state.locations.some((location) => location.id === this.selectedLocationId)) {
      this.selectedLocationId = (state.locations.find((location) => location.unlocked) ?? state.locations[0]).id;
    }
    this.updateWallet(state.coins);
    if (this.activeScreen === "lakes") this.renderLakes();
  }

  private renderLakes(): void {
    const state = this.gameState;
    if (!state) return;
    const selectedLocation = state.locations.find((location) => location.id === this.selectedLocationId) ?? state.locations[0];
    let selectedLocationId = selectedLocation.id;

    const screen = createElement("div", "screen");
    const header = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(createElement("span", "eyebrow", "Where to next"), createElement("h1", undefined, "Choose your water"));
    header.append(heading);

    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const rod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
    const loadout = createElement("section", "dashboard-section");
    loadout.append(createElement("div", "section-heading", "Current loadout"));
    const loadoutDock = createElement("div", "loadout-dock");
    loadoutDock.append(
      loadoutSlot("anchor", "Boat", boat?.name ?? state.activeEquipment.boatId, boat ? `Tier ${boat.tier}` : "Permanent"),
      loadoutSlot("rod", "Rod", rod?.name ?? state.activeEquipment.rodId, rod ? `${rod.maxFishWeightKg}kg max` : "Ready"),
      loadoutSlot("lure", "Lure", lure ? state.catalog.lures.find((item) => item.id === lure.id)?.name ?? lure.id : "None equipped", lure ? `${lure.durability ?? 0} uses${lure.quantity > 1 ? ` · ${lure.quantity - 1} spare` : ""}` : "Buy one"),
      loadoutSlot("bait", "Bait", bait ? state.catalog.baits.find((item) => item.id === bait.id)?.name ?? bait.id : "None selected", `${bait?.quantity ?? 0} portions`),
    );
    loadout.append(loadoutDock, this.buildLoadoutSwitcher(state, rod, lure, bait));

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
        ? `Fish reach ${heaviest}kg · rod limit ${rod.maxFishWeightKg}kg`
        : `Safe up to ${heaviest}kg`;
    };
    describeRisk();

    for (const location of state.locations) {
      const card = createElement("article", `location-card${location.id === selectedLocation.id ? " is-selected" : ""}${location.unlocked ? "" : " is-locked"}`);
      const cardTop = createElement("div", "location-card-top");
      cardTop.append(createElement("h2", undefined, location.name), createElement("span", `risk-badge risk-${location.riskBand}`, riskLabel(location)));
      const fishNames = location.fishIds
        .map((fishId) => state.catalog.fish.find((species) => species.id === fishId)?.commonName ?? fishId)
        .slice(0, 3);
      const fishChips = createElement("div", "fish-chips");
      for (const fishName of fishNames) fishChips.append(createElement("span", "fish-chip", fishName));
      const locationValue = createElement("p", "location-value muted");
      locationValue.append(createIcon("coin"), document.createTextNode(`${location.expectedValueMinCoins.toLocaleString()}–${location.expectedValueMaxCoins.toLocaleString()}`));
      card.append(cardTop, fishChips, locationValue);

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
          applyStartButtonState(location);
          describeRisk();
        });
        card.append(button);
      } else {
        const requiredBoat = state.catalog.boats.find((boat) => boat.id === location.requiredBoatId);
        const lockHint = createElement("p", "lock-hint", `Requires ${requiredBoat?.name ?? "a better boat"}`);
        card.append(lockHint);
      }
      locationsGrid.append(card);
    }
    startButton.type = "button";
    const applyStartButtonState = (location: LocationAvailability): void => {
      const baitAvailable = (bait?.quantity ?? 0) > 0;
      const lureUsable = Boolean(lure && lure.quantity > 0 && (lure.durability ?? 0) >= 1);
      const tackleMissing = !baitAvailable || !lureUsable;
      startButton.disabled = !location.unlocked || !this.startFishingHandler || tackleMissing;
      startButton.textContent =
        location.unlocked && tackleMissing
          ? baitAvailable
            ? "Lure worn out — buy a new one"
            : "No bait — visit shop"
          : `Start fishing at ${location.name}`;
    };
    applyStartButtonState(selectedLocation);
    startButton.addEventListener("click", () => this.startFishingHandler?.(selectedLocationId));

    const castBar = createElement("div", "cast-bar");
    castBar.append(selection, riskPreview, startButton);
    locationsSection.append(locationsGrid);

    screen.append(header, loadout, locationsSection);
    const recoveryBanner = this.buildRecoveryBanner(state);
    if (recoveryBanner) screen.append(recoveryBanner);

    this.content.replaceChildren(screen, castBar);
    this.content.scrollTop = 0;
  }

  private buildLoadoutSwitcher(
    state: GameStateResponse,
    rod: RodDefinition | undefined,
    lure: OwnedEquipment | undefined,
    bait: OwnedEquipment | undefined,
  ): HTMLElement {
    const container = createElement("div", "equipment-grid");
    const slots: Array<{ slot: "rod" | "lure" | "bait"; label: string; icon: IconName; name: string; detail: string }> = [
      {
        slot: "rod",
        label: "Rod",
        icon: "rod",
        name: rod?.name ?? state.activeEquipment.rodId,
        detail: rod ? `Supports up to ${rod.maxFishWeightKg} kg` : "Ready to cast",
      },
      {
        slot: "lure",
        label: "Lure",
        icon: "lure",
        name: lure ? state.catalog.lures.find((item) => item.id === lure.id)?.name ?? lure.id : "No lure equipped",
        detail: lure ? `${lure.durability ?? 0} uses left${lure.quantity > 1 ? ` · ${lure.quantity - 1} spare` : ""}` : "No lure equipped",
      },
      {
        slot: "bait",
        label: "Bait",
        icon: "bait",
        name: bait ? state.catalog.baits.find((item) => item.id === bait.id)?.name ?? bait.id : "No bait selected",
        detail: `${bait?.quantity ?? 0} portions ready`,
      },
    ];
    const closeAllDropdowns = () => {
      for (const other of container.querySelectorAll<HTMLElement>(".equipment-options")) {
        other.hidden = true;
        other.style.left = "";
      }
    };
    for (const { slot, label, icon, name, detail } of slots) {
      const card = equipmentCard(icon, label, name, detail);
      card.classList.add("is-interactive", "has-switcher");

      const ownedIds = state.inventory[`${slot}s` as const].filter((item) => item.quantity > 0).map((item) => item.id);
      const catalog = slot === "rod" ? state.catalog.rods : slot === "lure" ? state.catalog.lures : state.catalog.baits;
      const ownedDefinitions = catalog.filter((definition) => ownedIds.includes(definition.id));

      if (ownedDefinitions.length > 1) {
        const options = createElement("div", "equipment-options");
        options.hidden = true;

        for (const definition of ownedDefinitions) {
          const ownership = state.inventory[`${slot}s` as const].find((item) => item.id === definition.id);
          const optionDetail =
            slot === "bait"
              ? `${ownership?.quantity ?? 0} portions`
              : slot === "lure"
                ? `${ownership?.durability ?? 0}/${(definition as (typeof state.catalog.lures)[number]).maximumDurability} uses`
                : `up to ${(definition as (typeof state.catalog.rods)[number]).maxFishWeightKg} kg`;
          const optionButton = createElement("button", "equipment-option", `${definition.name} · ${optionDetail}`);
          optionButton.type = "button";
          if (state.activeEquipment[`${slot}Id`] === definition.id) optionButton.classList.add("is-active");
          optionButton.addEventListener("click", () => {
            options.hidden = true;
            options.style.left = "";
            this.selectEquipmentHandler?.({ [`${slot}Id`]: definition.id });
          });
          options.append(optionButton);
        }

        card.addEventListener("click", () => {
          const show = options.hidden;
          closeAllDropdowns();
          if (!show) return;
          options.hidden = false;
          const margin = 8;
          const viewportWidth = document.documentElement.clientWidth;
          const bounds = options.getBoundingClientRect();
          if (bounds.right <= viewportWidth - margin && bounds.left >= margin) return;
          const targetLeft = Math.min(
            Math.max(margin, bounds.left - Math.max(0, bounds.right - (viewportWidth - margin))),
            viewportWidth - margin - bounds.width,
          );
          const slotLeft = (options.offsetParent as HTMLElement | null)?.getBoundingClientRect().left ?? 0;
          options.style.left = `${Math.round(targetLeft - slotLeft)}px`;
        });

        const group = createElement("div", "loadout-slot");
        group.append(card, options);
        container.append(group);
      } else {
        container.append(card);
      }
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
    const panel = createElement("section", "screen shop-screen");
    const intro = createElement("div", "dashboard-header");
    const shopHeading = createElement("div");
    shopHeading.append(
      createElement("span", "eyebrow", "Tackle shop"),
      createElement("h1", undefined, "Gear up for deeper water"),
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
            owned: Boolean(ownedItem && ownedItem.quantity > 0),
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
          owned: state.inventory.baits.some((owned) => owned.id === bait.id && owned.quantity > 0),
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
        const priceTag = createElement("span", "price-tag");
        if (item.priceCoins === 0) {
          priceTag.textContent = "Free";
        } else {
          priceTag.append(createIcon("coin"), document.createTextNode(item.priceCoins.toLocaleString()));
        }
        top.append(createElement("h2", undefined, item.name), priceTag);
        card.append(top, createElement("p", "muted", item.description), createElement("p", "shop-detail", item.detail));

        const isPermanentItem = section.title === "Boats" || section.title === "Rods";
        const isLure = section.title === "Lures";
        const isBait = section.title === "Bait";
        if (isPermanentItem && item.owned) {
          card.append(createElement("span", "owned-badge", "Owned"));
          grid.append(card);
          continue;
        }
        if (isLure && item.owned) {
          const ownedBadge = createElement("span", "owned-badge", `Owned (${state.inventory.lures.find((o) => o.id === item.id)?.quantity ?? 0})`);
          card.append(ownedBadge);
          grid.append(card);
          continue;
        }

        let quantity = 1;
        let totalCost = item.priceCoins;
        if (isBait) {
          quantity = this.baitQuantities.get(item.id) ?? 1;
          totalCost = item.priceCoins * quantity;
          const pickerRow = createElement("div", "quantity-row");
          const pickerLabel = createElement("label", "muted", "Amount");
          pickerLabel.htmlFor = `quantity-${item.id}`;
          const picker = document.createElement("select");
          picker.className = "quantity-select";
          picker.id = `quantity-${item.id}`;
          for (const choice of BAIT_QUANTITY_CHOICES) {
            const option = document.createElement("option");
            option.value = String(choice);
            option.textContent = `×${choice}`;
            if (choice === quantity) option.selected = true;
            picker.append(option);
          }
          picker.addEventListener("change", () => {
            this.baitQuantities.set(item.id, Number(picker.value));
            this.renderShop();
          });
          pickerRow.append(pickerLabel, picker);
          card.append(pickerRow);
        }

        const button = createElement("button", "primary-action shop-buy");
        button.type = "button";
        if (state.coins < totalCost) {
          button.disabled = true;
          button.textContent = `Need ${formatCoins(totalCost - state.coins)} more`;
        } else {
          button.textContent = isBait ? `Buy ×${quantity} · ${formatCoins(totalCost)}` : item.priceCoins === 0 ? "Claim free" : "Buy";
          button.addEventListener("click", () => this.purchaseHandler?.(item.id, isBait ? quantity : undefined));
        }
        card.append(button);
        grid.append(card);
      }
      sectionEl.append(grid);
      panel.append(sectionEl);
    }
    this.replaceScreen(panel);
  }

  showCollection(collection?: CollectionResponse): void {
    if (collection) this.latestCollection = collection;
    if (!this.latestCollection) {
      this.showLoadingScreen("Opening your collection…");
      return;
    }
    const specimens = [...this.latestCollection.fish];

    const panel = createElement("section", "screen collection-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(
      createElement("span", "eyebrow", "Your collection"),
      createElement("h1", undefined, `Kept fish${specimens.length ? ` (${specimens.length})` : ""}`),
    );
    intro.append(heading);
    panel.append(intro);

    if (specimens.length === 0) {
      panel.append(createElement("p", "empty-message", "No kept fish yet. Land a catch and choose “Keep fish” to start your collection."));
      this.replaceScreen(panel);
      return;
    }

    const totalValue = specimens.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0);
    const actionsBar = createElement("div", "collection-actions");
    const sellAll = createElement("button", "secondary-action", `Sell all for ${formatCoins(totalValue)}`);
    sellAll.type = "button";
    sellAll.addEventListener("click", () => this.sellAllHandler?.());
    actionsBar.append(sellAll);
    panel.append(actionsBar);

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
    this.replaceScreen(panel);
  }

  private rerenderCollectionGrid(grid: HTMLElement, specimens: FishSpecimen[]): void {
    const sorter = collectionSorters[this.collectionSort];
    const sorted = [...specimens].sort(sorter);
    grid.replaceChildren();
    for (const specimen of sorted) {
      const card = createElement("article", "collection-card");
      card.append(createFishImage(specimen.species));
      const top = createElement("div", "collection-card-top");
      top.append(createElement("h2", undefined, specimen.species.commonName), createElement("span", `rarity-badge rarity-${specimen.species.rarity}`, capitalize(specimen.species.rarity)));
      const sell = createElement("button", "secondary-action sell-action");
      sell.append(createIcon("coin"), `Sell ${formatCoins(specimen.saleValueCoins)}`);
      sell.type = "button";
      sell.addEventListener("click", () => this.sellCatchHandler?.(specimen.id));
      card.append(top, sell, this.specimenDetails(specimen));
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

    const panel = createElement("section", "screen journal-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(
      createElement("span", "eyebrow", "Fish journal"),
      createElement("h1", undefined, `${discovered.length} of ${this.latestJournal.entries.length} species discovered`),
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
        card.append(createFishImage(species));
        card.append(createElement("em", "muted", species.scientificName));
        const stats = createElement("ul", "journal-stats");
        const statLine = (label: string, value: string): HTMLElement => {
          const li = createElement("li");
          li.append(createElement("span", "muted", label), createElement("strong", undefined, value));
          return li;
        };
        stats.append(
          statLine("Caught", entry.timesCaught.toLocaleString()),
          statLine("Max kg", entry.heaviestWeightKg !== null ? entry.heaviestWeightKg.toFixed(2) : "—"),
          statLine("Max cm", entry.longestLengthCm !== null ? `${entry.longestLengthCm}` : "—"),
          statLine("Best", entry.bestSaleValueCoins !== null ? formatCoins(entry.bestSaleValueCoins) : "—"),
        );
        card.append(stats);
      } else {
        card.append(createElement("p", "empty-message", `A ${species.rarity} fish of these waters. Catch one to reveal its page.`));
      }
      grid.append(card);
    }
    panel.append(grid);
    this.replaceScreen(panel);
  }

  showLoadingScreen(message: string): void {
    const panel = createElement("section", "fishing-status is-loading");
    panel.append(createElement("span", "eyebrow", "One moment"), createElement("p", "muted", message));
    this.replaceScreen(panel);
  }

  showRetryPanel(eyebrow: string, message: string, retryLabel: string, onRetry: () => void, onBack?: () => void): void {
    const panel = createElement("section", "fishing-status");
    panel.append(createElement("span", "eyebrow", eyebrow), createElement("p", "muted", message));
    const actions = createElement("div", onBack ? "result-actions" : "");
    const retry = createElement("button", "primary-action", retryLabel);
    retry.type = "button";
    retry.addEventListener("click", onRetry);
    actions.append(retry);
    if (onBack) {
      const back = createElement("button", "secondary-action", "Back to lakes");
      back.type = "button";
      back.addEventListener("click", onBack);
      actions.append(back);
    }
    panel.append(actions);
    this.replaceScreen(panel);
  }

  showFishingResult(result: CompleteFishingResponse, onDecision: (decision: "keep" | "sell") => void, onBack: () => void): void {
    const panel = createElement("section", "fishing-status");
    panel.append(
      createElement("span", "eyebrow", result.outcome === "caught" ? "Fish landed" : "The line went slack"),
      createElement("h1", undefined, result.outcome === "caught" && result.catch ? result.catch.species.commonName : "It got away"),
      ...(result.outcome !== "caught" || !result.catch ? [createElement("p", "muted", result.message)] : []),
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
      panel.append(createFishImage(result.catch.species));
      panel.append(this.specimenDetails(result.catch));
      const actions = createElement("div", "result-actions");
      const keep = createElement("button", "secondary-action keep-action");
      keep.append(createIcon("trophy"), "Keep");
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
    this.replaceScreen(panel);
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
    this.replaceScreen(panel);
  }

  private replaceScreen(panel: HTMLElement): void {
    this.content.replaceChildren(panel);
    this.content.scrollTop = 0;
  }

  private specimenDetails(specimen: FishSpecimen): HTMLElement {
    const details = createElement("div", "specimen-details");
    details.append(
      createElement("strong", undefined, capitalize(specimen.quality)),
      statChip(specimen.weightKg.toFixed(1), "KG"),
      statChip(`${specimen.lengthCm}`, "CM"),
      statChip(specimen.saleValueCoins.toLocaleString(), "COINS"),
    );
    return details;
  }
}
