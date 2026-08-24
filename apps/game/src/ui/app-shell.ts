import type {
  BaitDefinition,
  BoatDefinition,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishSpecimen,
  GameStateResponse,
  LeaderboardResponse,
  LocationAvailability,
  LureDefinition,
  RodDefinition,
  RiskBand,
} from "@fishing/shared";
import { rodRiskBandForWeight } from "@fishing/shared";
import { createElement } from "./create-element";
import { createFishImage } from "./fish-images";
import { getSpeciesSizeComparison } from "./specimen-size";

export type ScreenId = "lakes" | "friends" | "shop" | "collection" | "journal";

export interface EquipmentSelectionRequest {
  rodId?: string;
  lureId?: string;
  baitId?: string;
}

type IconName = "alert" | "anchor" | "bait" | "book" | "check" | "coin" | "friend" | "lock" | "lure" | "rod" | "shop" | "trophy" | "waves";

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
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  lock: ["M8 10.5V7.8a4 4 0 0 1 8 0v2.7", "M6.2 10.5h11.6a1.2 1.2 0 0 1 1.2 1.2v7.1a1.2 1.2 0 0 1-1.2 1.2H6.2a1.2 1.2 0 0 1-1.2-1.2v-7.1a1.2 1.2 0 0 1 1.2-1.2Z"],
  alert: ["M12 3.5 2.8 19.5h18.4L12 3.5Z", "M12 9.5v4.2", "M12 16.6v.01"],
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatWeight(weightKg: number): string {
  return weightKg > 0 ? `${weightKg.toFixed(1)} kg` : "—";
}

function createExternalLink(label: string, url: string, className = "external-link"): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = className;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function speciesFact(label: string, value: string): HTMLElement {
  const fact = createElement("div", "species-fact");
  fact.append(createElement("span", "muted", label), createElement("p", undefined, value));
  return fact;
}

function journalDiscoveryHint(state: GameStateResponse, species: FishSpecimen["species"]): string {
  const locationCandidates = species.availableLocationIds
    .map((id) => state.locations.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is LocationAvailability => candidate !== undefined);
  const location = locationCandidates.find((candidate) => candidate.unlocked);
  const locationDefinition = location ?? locationCandidates[0] ?? state.catalog.locations.find((candidate) => candidate.id === species.availableLocationIds[0]);
  const boat = locationDefinition ? state.catalog.boats.find((candidate) => candidate.id === locationDefinition.requiredBoatId) : undefined;
  const locationHint = location
    ? `Try ${location.name}`
    : locationDefinition
      ? `Unlock ${locationDefinition.name}${boat ? ` with a ${boat.name}` : ""}`
      : "Explore the lakes";
  const baitNames = species.acceptedBaitIds
    .map((id) => state.catalog.baits.find((candidate) => candidate.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 2);
  const baitHint = baitNames.length > 0 ? ` using ${baitNames.join(" or ")}` : " with a patient cast";
  return `${locationHint}${baitHint}.`;
}

function statChip(value: string | number, unit: string): HTMLElement {
  const chip = createElement("span", "stat-chip");
  chip.append(createElement("b", undefined, String(value)), createElement("small", undefined, unit));
  return chip;
}

function riskDots(location: LocationAvailability): HTMLElement {
  const level = location.riskBand === "low" ? 1 : location.riskBand === "moderate" ? 2 : 3;
  const dots = createElement("span", "risk-dots");
  const label = `${capitalize(location.riskBand)} risk`;
  dots.setAttribute("role", "img");
  dots.setAttribute("aria-label", label);
  dots.title = label;
  for (let index = 0; index < 3; index += 1) {
    dots.append(createElement("i", index < level ? "on" : undefined));
  }
  dots.append(createElement("span", "risk-dot-label", `${capitalize(location.riskBand)} risk`));
  return dots;
}

type CollectionSortMode = "newest" | "heaviest" | "value" | "species";
type JournalFilterMode = "all" | "discovered" | "undiscovered";

type ShopCategory = "boats" | "rods" | "lures" | "bait";

const collectionSorters: Record<CollectionSortMode, (a: FishSpecimen, b: FishSpecimen) => number> = {
  newest: (a, b) => b.caughtAt.localeCompare(a.caughtAt),
  heaviest: (a, b) => b.weightKg - a.weightKg,
  value: (a, b) => b.saleValueCoins - a.saleValueCoins,
  species: (a, b) => a.species.commonName.localeCompare(b.species.commonName) || b.weightKg - a.weightKg,
};

const BAIT_QUANTITY_CHOICES = [1, 5, 10, 25];

const RISK_PRESENTATION: Record<RiskBand, { label: string; consequence: string }> = {
  low: {
    label: "Low rod risk",
    consequence: "A suitable rod should handle the fish here without a break roll.",
  },
  moderate: {
    label: "Moderate rod risk",
    consequence: "A poor fight against a heavy fish can damage or break your rod.",
  },
  high: {
    label: "High rod risk",
    consequence: "A heavy fish can snap this rod; if it breaks, it leaves your loadout.",
  },
};

function riskLabel(band: RiskBand): string {
  return RISK_PRESENTATION[band].label;
}

function eligibleFishForSetup(state: GameStateResponse, location: LocationAvailability, baitId?: string): FishSpecimen["species"][] {
  if (!baitId) return [];
  return state.catalog.fish.filter(
    (species) =>
      location.fishIds.includes(species.id) &&
      species.availableLocationIds.includes(location.id) &&
      species.acceptedBaitIds.includes(baitId),
  );
}

function speciesNamesForIds(state: GameStateResponse, ids: string[]): string[] {
  return ids
    .map((id) => state.catalog.fish.find((species) => species.id === id)?.commonName ?? id)
    .filter((name, index, names) => names.indexOf(name) === index);
}

function shopStatGrid(entries: Array<[label: string, value: string]>): HTMLElement {
  const grid = createElement("div", "shop-stats");
  for (const [label, value] of entries) {
    const stat = createElement("div", "shop-stat-cell");
    stat.append(createElement("strong", undefined, value), createElement("span", "muted", label));
    grid.append(stat);
  }
  return grid;
}

function shopSpeciesList(label: string, names: string[]): HTMLElement {
  const section = createElement("div", "shop-species");
  section.append(createElement("span", "shop-detail-label", label));
  const list = createElement("div", "fish-chips");
  for (const name of names) list.append(createElement("span", "fish-chip", name));
  section.append(list);
  return section;
}

function locationFishList(state: GameStateResponse, location: LocationAvailability): HTMLElement {
  const names = speciesNamesForIds(state, location.fishIds);
  const section = createElement("div", "location-fish");
  section.append(createElement("span", "location-detail-label", "Fish you can catch"));

  const visible = createElement("div", "fish-chips");
  for (const name of names.slice(0, 3)) visible.append(createElement("span", "fish-chip", name));
  section.append(visible);

  if (names.length > 3) {
    const details = document.createElement("details");
    details.className = "fish-list-details";
    const summary = document.createElement("summary");
    summary.className = "fish-list-summary";
    summary.textContent = `View all ${names.length} species`;
    const remaining = createElement("div", "fish-chips fish-chips-expanded");
    for (const name of names.slice(3)) remaining.append(createElement("span", "fish-chip", name));
    details.append(summary, remaining);
    section.append(details);
  }
  return section;
}

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
  private navEnabled = true;
  private pendingNavigation?: ScreenId;
  private actionPending = false;
  private selectedLocationId?: string;
  private collectionSort: CollectionSortMode = "newest";
  private journalFilter: JournalFilterMode = "all";
  private shopCategory: ShopCategory = "bait";
  private renderedShopCategory?: ShopCategory;
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
  private sellAllConfirming = false;

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
    this.frame.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".gear-slot")) this.closeEquipmentMenus();
    });
    this.frame.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = this.frame.querySelector<HTMLElement>(".equipment-options:not([hidden])");
      if (!open) return;
      const trigger = open.parentElement?.querySelector<HTMLElement>(".gear-tile");
      this.closeEquipmentMenus();
      trigger?.focus();
    });
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
      this.clearStatus();
    }
    this.stickyToast = this.makeToast(message, state, state === "loading" ? 15000 : 3200);
  }

  clearStatus(): void {
    const toast = this.stickyToast;
    if (!toast) return;
    if (toast.dismissTimer) window.clearTimeout(toast.dismissTimer);
    this.stickyToast = undefined;
    this.frame.dataset.toastVisible = "false";
    toast.root.remove();
  }

  private makeToast(message: string, state: "loading" | "ready" | "error", lifetimeMs: number): ToastHandle {
    while (this.toastLayer.children.length >= 3) this.toastLayer.firstElementChild?.remove();
    this.frame.dataset.toastVisible = "true";
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
    if (this.stickyToast === handle) {
      this.stickyToast = undefined;
      this.frame.dataset.toastVisible = "false";
    }
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
    this.navEnabled = enabled;
    this.tabbar.dataset.disabled = enabled ? "false" : "true";
    this.renderTabs();
  }

  setNavigationPending(screen?: ScreenId): void {
    this.pendingNavigation = screen;
    this.tabbar.dataset.pending = screen ? "true" : "false";
    this.renderTabs();
  }

  setActionPending(pending: boolean): void {
    this.actionPending = pending;
    this.syncActionState();
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
      button.disabled = !this.navEnabled;
      button.setAttribute("aria-disabled", String(!this.navEnabled));
      if (this.pendingNavigation === tab.id) {
        button.dataset.loading = "true";
        button.setAttribute("aria-busy", "true");
      }
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

  resetSellAllConfirmation(): void {
    this.sellAllConfirming = false;
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

  openShop(category: ShopCategory = "bait"): void {
    this.shopCategory = category;
    this.navigationHandler?.("shop");
  }

  private createGoFishingAction(): HTMLButtonElement {
    const action = createElement("button", "primary-action empty-state-action");
    action.type = "button";
    action.append(createIcon("waves"), "Go fishing");
    action.addEventListener("click", () => this.navigationHandler?.("lakes"));
    return action;
  }

  showLeaderboard(leaderboard?: LeaderboardResponse): void {
    if (leaderboard) this.latestLeaderboard = leaderboard;
    if (!this.latestLeaderboard) {
      this.showLoadingScreen("Casting the net…");
      return;
    }

    const board = this.latestLeaderboard;
    const panel = createElement("section", "screen friends-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(createElement("span", "eyebrow", "Fishing crew"), createElement("h1", undefined, "Catch board"));
    intro.append(heading, createElement("p", "friends-definition", board.metricDescription || "Ranked by kept fish. Sold fish do not count."));
    panel.append(intro);

    const invite = createElement("button", "primary-action invite-action");
    invite.type = "button";
    invite.append(createIcon("friend"), "Invite anglers");
    invite.addEventListener("click", () => this.shareHandler?.());
    panel.append(invite);

    const viewer = board.viewer;
    if (viewer) {
      const standing = createElement("aside", "crew-self");
      const standingCopy = createElement("div", "crew-self-copy");
      standingCopy.append(
        createElement("span", "eyebrow", "Your standing"),
        createElement("strong", "crew-self-name", viewer.displayName === "You" ? "You" : `${viewer.displayName} · You`),
      );
      const rank = createElement("strong", "crew-self-rank", viewer.rank === null ? "Unranked" : `#${viewer.rank}`);
      const standingNote = viewer.rank === null
        ? "Keep a fish to join the board. Sold fish do not count."
        : `${viewer.keptFishCount} kept fish · ${formatWeight(viewer.heaviestKeptFishKg)} heaviest kept`;
      standing.append(standingCopy, rank, createElement("span", "muted", standingNote));
      panel.append(standing);
    }

    if (board.entries.length === 0) {
      const empty = createElement("div", "empty-state");
      empty.append(
        createElement("p", "empty-message", "No kept fish on the board yet. Keep your next catch to claim the first spot."),
        this.createGoFishingAction(),
      );
      panel.append(empty);
      this.replaceScreen(panel);
      return;
    }

    const list = createElement("ol", "crew-board");
    for (const entry of board.entries.slice(0, 10)) {
      const isViewer = Boolean(viewer && entry.playerId === viewer.playerId);
      const row = createElement("li", `crew-row${entry.rank === 1 ? " is-leader" : ""}${isViewer ? " is-self" : ""}`);
      row.append(
        createElement("span", "crew-rank", `${entry.rank}`),
        (() => {
          const name = createElement("div", "crew-name", entry.displayName);
          if (isViewer) name.append(createElement("span", "crew-you", "You"));
          name.append(createElement("small", "muted", `${entry.keptFishCount} kept · ${formatWeight(entry.heaviestKeptFishKg)} heaviest`));
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

    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const equippedRod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const rod = equippedRod && state.inventory.rods.find((item) => item.id === equippedRod.id)?.quantity ? equippedRod : undefined;
    const lureDefinition = lure ? state.catalog.lures.find((item) => item.id === lure.id) : undefined;
    const baitDefinition = bait ? state.catalog.baits.find((item) => item.id === bait.id) : undefined;

    const screen = createElement("div", "screen");

    // Context hero: the water you have chosen and its payout band.
    const hero = createElement("header", "screen-hero");
    const heroText = createElement("div", "screen-hero-text");
    const heroName = createElement("h1", undefined, selectedLocation.name);
    heroText.append(createElement("span", "eyebrow", "Chosen water"), heroName);
    const heroValue = createElement("span", "hero-value");
    const heroValueText = createElement("span");
    heroValue.append(createIcon("coin"), heroValueText);
    const setHeroValue = (location: LocationAvailability): void => {
      heroValueText.textContent = `${location.expectedValueMinCoins.toLocaleString()}–${location.expectedValueMaxCoins.toLocaleString()}`;
      heroValue.setAttribute("aria-label", `Typical catch value: ${heroValueText.textContent} coins`);
    };
    setHeroValue(selectedLocation);
    hero.append(heroText, heroValue);

    const locationsList = createElement("div", "locations-list");
    locationsList.setAttribute("role", "radiogroup");
    locationsList.setAttribute("aria-label", "Fishing locations");

    const castDetails = createElement("div", "cast-details");
    const castDetailsCopy = createElement("div", "cast-details-copy");
    const castDetailsTitle = createElement("span", "cast-details-title", "Cost to cast");
    const castDetailsCost = createElement("strong");
    const castDetailsAfter = createElement("span", "cast-details-after");
    castDetailsCopy.append(castDetailsTitle, castDetailsCost, castDetailsAfter);
    const castRisk = createElement("div", "cast-risk");
    castDetails.append(castDetailsCopy, castRisk);

    const castChips = createElement("div", "cast-readiness");
    const castButton = createElement("button", "primary-action cast-cta");
    castButton.type = "button";

    const readinessChip = (icon: IconName, text: string, tone: "ok" | "warn" | "bad", label: string): HTMLElement => {
      const chip = createElement("span", `readiness-chip is-${tone}`);
      chip.setAttribute("role", "img");
      chip.setAttribute("aria-label", label);
      chip.title = label;
      chip.append(createIcon(icon), document.createTextNode(text));
      return chip;
    };

    const updateCastBar = (location: LocationAvailability): void => {
      const eligibleFish = eligibleFishForSetup(state, location, bait?.id);
      const heaviest = Math.max(0, ...eligibleFish.map((species) => species.maximumWeightKg));
      const baitQuantity = bait?.quantity ?? 0;
      const lureUsesLeft = lure?.durability ?? 0;
      const lureUsable = Boolean(lure && lure.quantity > 0 && (lureUsesLeft >= 1 || lure.quantity > 1));
      const castRiskBand: RiskBand = rod ? rodRiskBandForWeight(heaviest, rod.maxFishWeightKg) : "high";
      const lureName = lureDefinition?.name ?? "your lure";
      const baitName = baitDefinition?.name ?? "your bait";
      const lureWillUseSpare = Boolean(lure && lureUsesLeft < 1 && lure.quantity > 1);
      const lureAfter = lureDefinition
        ? lureWillUseSpare
          ? `${lureName} becomes ${Math.max(0, lureDefinition.maximumDurability - 1)}/${lureDefinition.maximumDurability}`
          : `${lureName} ${Math.max(0, lureUsesLeft - 1)}/${lureDefinition.maximumDurability}`
        : "lure unavailable";

      castDetailsCost.textContent = `1 ${baitName} + 1 lure use`;
      castDetailsAfter.textContent = lureWillUseSpare
        ? `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter} (spare used)`
        : `After casting: ${baitName} ×${Math.max(0, baitQuantity - 1)} · ${lureAfter}`;
      castRisk.className = `cast-risk risk-${castRiskBand}`;
      castRisk.replaceChildren(
        createElement("span", "cast-risk-label", riskLabel(castRiskBand)),
        createElement("strong", undefined, rod ? `${heaviest.toFixed(1)} kg max / ${rod.maxFishWeightKg.toFixed(1)} kg rod` : "No rod equipped"),
        createElement("span", "cast-risk-reason", location.riskReason),
      );
      castRisk.setAttribute(
        "aria-label",
        `${riskLabel(castRiskBand)}. ${location.riskReason} ${RISK_PRESENTATION[castRiskBand].consequence}`,
      );

      castChips.replaceChildren(
        readinessChip(
          "rod",
          `${heaviest.toFixed(1)}kg`,
          castRiskBand === "low" ? "ok" : castRiskBand === "moderate" ? "warn" : "bad",
          rod
            ? `${riskLabel(castRiskBand)}. Fish attracted by ${baitName} reach ${heaviest.toFixed(1)} kilograms; your rod is rated for ${rod.maxFishWeightKg.toFixed(1)} kilograms. ${RISK_PRESENTATION[castRiskBand].consequence}`
            : "No rod is equipped.",
        ),
        readinessChip(
          "lure",
          lureWillUseSpare ? "1 spare" : `${Math.max(0, lureUsesLeft)}`,
          lureUsable ? "ok" : "bad",
          lureUsable
            ? lureWillUseSpare
              ? `${lureName} will consume one spare lure`
              : `${lureUsesLeft} uses left on ${lureName}`
            : "Your lure has no usable copy left",
        ),
        readinessChip("bait", `×${baitQuantity}`, baitQuantity > 0 ? "ok" : "bad", baitQuantity > 0 ? `${baitQuantity} bait portions left` : "You are out of bait"),
      );

      castButton.replaceChildren();
      castButton.classList.remove("is-restock");
      castButton.onclick = null;
      if (baitQuantity === 0) {
        castButton.disabled = false;
        castButton.classList.add("is-restock");
        castButton.append(createIcon("bait"), "Restock bait");
        castButton.onclick = () => this.openShop("bait");
        return;
      }
      if (!rod) {
        castButton.disabled = false;
        castButton.classList.add("is-restock");
        castButton.append(createIcon("rod"), "Claim a rod");
        castButton.onclick = () => this.openShop("rods");
        return;
      }
      if (!lureUsable) {
        castButton.disabled = false;
        castButton.classList.add("is-restock");
        castButton.append(createIcon("lure"), "Replace lure");
        castButton.onclick = () => this.openShop("lures");
        return;
      }
      castButton.disabled = !location.unlocked || !this.startFishingHandler || eligibleFish.length === 0 || !rod;
      castButton.append(createIcon("waves"), `Cast at ${location.name}`);
      castButton.onclick = () => this.startFishingHandler?.(selectedLocationId);
    };

    for (const location of state.locations) {
      const isSelected = location.id === selectedLocationId;
      const card = createElement("article", `location-card risk-${location.riskBand}${isSelected ? " is-selected" : ""}${location.unlocked ? "" : " is-locked"}`);

      const top = createElement("div", "location-top");
      top.append(createElement("h2", undefined, location.name), riskDots(location));

      const description = createElement("p", "location-description", location.description);
      const riskReason = createElement("p", "location-risk-reason");
      riskReason.append(createIcon("alert"), document.createTextNode(location.riskReason));

      const fishList = locationFishList(state, location);

      const foot = createElement("div", "location-foot");
      const value = createElement("span", "value-tag");
      value.append(createIcon("coin"), document.createTextNode(`${location.expectedValueMinCoins.toLocaleString()}–${location.expectedValueMaxCoins.toLocaleString()}`));
      foot.append(value);

      if (location.unlocked) {
        card.setAttribute("role", "radio");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-checked", String(isSelected));
        const radio = createElement("span", "location-radio");
        radio.append(createIcon("check"));
        foot.append(radio);

        const choose = (): void => {
          if (selectedLocationId === location.id) return;
          selectedLocationId = location.id;
          this.selectedLocationId = location.id;
          for (const other of locationsList.querySelectorAll<HTMLElement>(".location-card")) {
            other.classList.remove("is-selected");
            other.setAttribute("aria-checked", "false");
          }
          card.classList.add("is-selected");
          card.setAttribute("aria-checked", "true");
          heroName.textContent = location.name;
          setHeroValue(location);
          updateCastBar(location);
        };
        card.addEventListener("click", choose);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose();
          }
        });
      } else {
        const requiredBoat = state.catalog.boats.find((candidate) => candidate.id === location.requiredBoatId);
        const lock = createElement("span", "lock-tag");
        const lockCopy = createElement("span", "lock-copy");
        const requiredBoatName = requiredBoat?.name ?? "a better boat";
        lockCopy.append(
          createElement("strong", undefined, `Locked · Requires ${requiredBoatName}`),
          createElement(
            "small",
            undefined,
            requiredBoat
              ? `Buy ${requiredBoatName} for ${formatCoins(requiredBoat.priceCoins)} coins to unlock this water.`
              : "Upgrade your boat to unlock this water.",
          ),
        );
        lock.append(createIcon("lock"), lockCopy);
        foot.append(lock);
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `${location.name}, locked. Requires ${requiredBoatName}. Open the Boats shop to unlock it.`);
        const openBoats = (): void => this.openShop("boats");
        card.addEventListener("click", openBoats);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openBoats();
          }
        });
      }

      card.append(top, description, riskReason, fishList, foot);
      locationsList.append(card);
    }

    screen.append(hero, this.buildGearDock(state), locationsList);
    const recoveryBanner = this.buildRecoveryBanner(state);
    if (recoveryBanner) screen.append(recoveryBanner);

    const castBar = createElement("div", "cast-bar");
    castBar.append(castDetails, castChips, castButton);
    updateCastBar(selectedLocation);

    this.content.replaceChildren(screen, castBar);
    this.content.scrollTop = 0;
    this.syncActionState();
  }

  private gearTile(options: {
    tone: string;
    icon: IconName;
    name: string;
    meta?: string;
    bar?: number;
    badge?: string;
    alert?: boolean;
    interactive?: boolean;
    label: string;
  }): HTMLElement {
    const tile = createElement(options.interactive ? "button" : "div", `gear-tile tone-${options.tone}${options.alert ? " is-alert" : ""}${options.interactive ? " is-interactive" : ""}`);
    if (tile instanceof HTMLButtonElement) tile.type = "button";
    tile.setAttribute("aria-label", options.label);
    tile.title = options.label;
    const icon = createElement("span", "gear-icon");
    icon.append(createIcon(options.icon));
    if (options.badge) icon.append(createElement("span", "gear-badge", options.badge));
    const text = createElement("span", "gear-text");
    text.append(createElement("span", "gear-name", options.name));
    if (options.bar !== undefined) {
      const bar = createElement("span", "gear-bar");
      const fill = createElement("span", "gear-bar-fill");
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, options.bar)) * 100)}%`;
      bar.append(fill);
      text.append(bar);
    } else {
      text.append(createElement("span", "gear-meta", options.meta ?? ""));
    }
    tile.append(icon, text);
    return tile;
  }

  private closeEquipmentMenus(): void {
    for (const options of this.frame.querySelectorAll<HTMLElement>(".equipment-options:not([hidden])")) {
      options.hidden = true;
      options.style.left = "";
      options.parentElement?.querySelector<HTMLElement>(".gear-tile")?.setAttribute("aria-expanded", "false");
    }
  }

  private buildGearDock(state: GameStateResponse): HTMLElement {
    const dock = createElement("section", "gear-dock");
    dock.setAttribute("aria-label", "Current tackle");

    const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
    const equippedRod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const rod = equippedRod && state.inventory.rods.find((item) => item.id === equippedRod.id)?.quantity ? equippedRod : undefined;
    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const lureDefinition = lure ? state.catalog.lures.find((item) => item.id === lure.id) : undefined;

    const closeAllDropdowns = (): void => {
      this.closeEquipmentMenus();
      for (const options of dock.querySelectorAll<HTMLElement>(".equipment-options")) options.hidden = true;
    };

    // The boat is permanent context, not a quick-swap slot.
    dock.append(
      this.gearTile({
        tone: "boat",
        icon: "anchor",
        name: boat?.name ?? "No boat",
        meta: boat ? `Tier ${boat.tier}` : "—",
        label: boat ? `Boat: ${boat.name}, tier ${boat.tier}` : "No boat",
      }),
    );

    const slots: Array<{
      slot: "rod" | "lure" | "bait";
      tone: string;
      icon: IconName;
      name: string;
      meta?: string;
      bar?: number;
      badge?: string;
      alert: boolean;
      label: string;
    }> = [
      {
        slot: "rod",
        tone: "rod",
        icon: "rod",
        name: rod?.name ?? "None",
        meta: rod ? `≤${rod.maxFishWeightKg}kg` : "—",
        alert: false,
        label: rod ? `Rod: ${rod.name}, lands fish up to ${rod.maxFishWeightKg} kilograms` : "No rod equipped",
      },
      {
        slot: "lure",
        tone: "lure",
        icon: "lure",
        name: lureDefinition?.name ?? "None",
        bar: lure && lureDefinition ? Math.max(0, (lure.durability ?? 0) / lureDefinition.maximumDurability) : 0,
        badge: lure && lure.quantity > 1 ? `+${lure.quantity - 1}` : undefined,
        alert: !lure || lure.quantity < 1 || (lure.durability ?? 0) < 1,
        label: lure && lureDefinition ? `Lure: ${lureDefinition.name}, ${lure.durability ?? 0} of ${lureDefinition.maximumDurability} uses left` : "No lure equipped",
      },
      {
        slot: "bait",
        tone: "bait",
        icon: "bait",
        name: bait ? state.catalog.baits.find((item) => item.id === bait.id)?.name ?? bait.id : "None",
        meta: `×${bait?.quantity ?? 0}`,
        alert: (bait?.quantity ?? 0) < 1,
        label: bait ? `Bait: ${state.catalog.baits.find((item) => item.id === bait.id)?.name ?? bait.id}, ${bait.quantity} portions left` : "No bait selected",
      },
    ];

    for (const { slot, tone, icon, name, meta, bar, badge, alert, label } of slots) {
      const ownedIds = state.inventory[`${slot}s` as const].filter((item) => item.quantity > 0).map((item) => item.id);
      const catalog = slot === "rod" ? state.catalog.rods : slot === "lure" ? state.catalog.lures : state.catalog.baits;
      const ownedDefinitions = catalog.filter((definition) => ownedIds.includes(definition.id));
      const interactive = ownedDefinitions.length > 1;
      const tile = this.gearTile({ tone, icon, name, meta, bar, badge, alert, interactive, label: interactive ? `${label}. Tap to switch` : label });

      if (!interactive) {
        dock.append(tile);
        continue;
      }

      const options = createElement("div", "equipment-options");
      options.hidden = true;
      options.id = `equipment-options-${slot}`;
      options.setAttribute("role", "menu");
      tile.setAttribute("aria-controls", options.id);
      tile.setAttribute("aria-expanded", "false");

      for (const definition of ownedDefinitions) {
        const ownership = state.inventory[`${slot}s` as const].find((item) => item.id === definition.id);
        const optionDetail =
          slot === "bait"
            ? `${ownership?.quantity ?? 0} portions`
            : slot === "lure"
              ? `${ownership?.durability ?? 0}/${(definition as (typeof state.catalog.lures)[number]).maximumDurability} uses`
              : `up to ${(definition as (typeof state.catalog.rods)[number]).maxFishWeightKg} kg`;
        const optionButton = createElement("button", "equipment-option");
        optionButton.type = "button";
        const active = state.activeEquipment[`${slot}Id`] === definition.id;
        optionButton.append(createElement("span", "equipment-option-name", definition.name), createElement("span", "equipment-option-detail", optionDetail));
        optionButton.setAttribute("role", "menuitemradio");
        optionButton.setAttribute("aria-checked", String(active));
        if (active) optionButton.classList.add("is-active");
        optionButton.addEventListener("click", () => {
          options.hidden = true;
          options.style.left = "";
          tile.setAttribute("aria-expanded", "false");
          this.selectEquipmentHandler?.({ [`${slot}Id`]: definition.id });
        });
        options.append(optionButton);
      }

      tile.addEventListener("click", () => {
        const show = options.hidden;
        closeAllDropdowns();
        if (!show) return;
        options.hidden = false;
        tile.setAttribute("aria-expanded", "true");
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

      const group = createElement("div", "gear-slot");
      group.append(tile, options);
      dock.append(group);
    }
    return dock;
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
    const preserveScroll = this.renderedShopCategory === this.shopCategory;
    this.renderedShopCategory = this.shopCategory;
    const panel = createElement("section", "screen shop-screen");

    const hero = createElement("header", "screen-hero");
    const heroText = createElement("div", "screen-hero-text");
    heroText.append(createElement("span", "eyebrow", "Tackle shop"), createElement("h1", undefined, "Gear up"));
    const walletNote = createElement("span", "hero-value");
    walletNote.setAttribute("aria-label", `Coins available: ${formatCoins(state.coins)}`);
    walletNote.append(createIcon("coin"), createElement("span", undefined, formatCoins(state.coins)));
    hero.append(heroText, walletNote);

    const tabs = createElement("div", "shop-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Shop categories");
    const categories: Array<{ id: ShopCategory; label: string; icon: IconName }> = [
      { id: "bait", label: "Bait", icon: "bait" },
      { id: "lures", label: "Lures", icon: "lure" },
      { id: "rods", label: "Rods", icon: "rod" },
      { id: "boats", label: "Boats", icon: "anchor" },
    ];
    for (const category of categories) {
      const tab = createElement("button", `shop-tab${this.shopCategory === category.id ? " is-active" : ""}`);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(this.shopCategory === category.id));
      tab.append(createIcon(category.icon), createElement("span", undefined, category.label));
      tab.addEventListener("click", () => {
        if (this.shopCategory === category.id) return;
        this.shopCategory = category.id;
        this.renderShop();
      });
      tabs.append(tab);
    }

    const list = createElement("div", "shop-list");
    list.setAttribute("role", "tabpanel");
    if (this.shopCategory === "bait") {
      for (const bait of state.catalog.baits) list.append(this.baitCard(state, bait));
    } else if (this.shopCategory === "lures") {
      for (const lure of state.catalog.lures) list.append(this.lureCard(state, lure));
    } else if (this.shopCategory === "rods") {
      for (const rod of state.catalog.rods) list.append(this.rodCard(state, rod));
    } else {
      for (const boat of state.catalog.boats) list.append(this.boatCard(state, boat));
    }

    panel.append(hero, tabs, list);
    this.replaceScreen(panel, { preserveScroll });
  }

  private shopItemShell(options: {
    tone: string;
    icon: IconName;
    name: string;
    description: string;
    status?: "owned" | "equipped";
  }): { card: HTMLElement; body: HTMLElement; details: HTMLElement; side: HTMLElement } {
    const card = createElement("article", `shop-item tone-${options.tone}${options.status ? ` is-${options.status}` : ""}`);
    const icon = createElement("span", "shop-icon");
    icon.append(createIcon(options.icon));
    const body = createElement("div", "shop-body");
    const heading = createElement("div", "shop-heading");
    heading.append(createElement("h2", undefined, options.name));
    if (options.status) {
      const state = createElement("span", `shop-state is-${options.status}`);
      state.append(createIcon("check"), options.status === "equipped" ? "Equipped" : "Owned");
      heading.append(state);
    }
    const details = createElement("div", "shop-details");
    body.append(heading, createElement("p", "shop-description", options.description), details);
    const side = createElement("div", "shop-side");
    card.append(icon, body, side);
    return { card, body, details, side };
  }

  private appendBuyControls(side: HTMLElement, itemId: string, itemName: string, itemKind: string, totalCost: number, quantity?: number): void {
    const coins = this.gameState?.coins ?? 0;
    const button = createElement("button", "buy-btn");
    button.type = "button";
    const actionLabel = totalCost === 0 ? `Claim ${itemKind}` : `Buy ${itemKind}`;
    const price = createElement("span", "buy-price");
    if (quantity && quantity > 1) price.append(createElement("small", undefined, `×${quantity}`));
    if (totalCost === 0) price.append(createElement("small", "buy-free", "Free"));
    else price.append(createIcon("coin"), document.createTextNode(formatCoins(totalCost)));
    button.append(createElement("span", "buy-label", actionLabel), price);
    button.setAttribute("aria-label", totalCost === 0 ? `${actionLabel} ${itemName}` : `${actionLabel} ${itemName} for ${formatCoins(totalCost)} coins`);
    if (coins < totalCost) {
      button.disabled = true;
      side.append(button, createElement("span", "short-note", `Need ${formatCoins(totalCost - coins)} more`));
      return;
    }
    button.addEventListener("click", () => this.purchaseHandler?.(itemId, quantity));
    side.append(button);
  }

  private boatCard(state: GameStateResponse, boat: BoatDefinition): HTMLElement {
    const owned = state.inventory.boats.some((item) => item.id === boat.id && item.quantity > 0);
    const equipped = owned && state.activeEquipment.boatId === boat.id;
    const unlocks = boat.unlocksLocationIds.map((id) => state.catalog.locations.find((location) => location.id === id)?.name ?? id);
    const { card, details, side } = this.shopItemShell({
      tone: "boat",
      icon: "anchor",
      name: boat.name,
      description: boat.description,
      status: equipped ? "equipped" : owned ? "owned" : undefined,
    });
    details.append(
      shopStatGrid([
        ["Tier", `${boat.tier}`],
        ["Price", boat.priceCoins === 0 ? "Free" : `${formatCoins(boat.priceCoins)} coins`],
        ["Spots", `${unlocks.length}`],
      ]),
      shopSpeciesList("Unlocks these waters", unlocks),
    );
    if (!owned) this.appendBuyControls(side, boat.id, boat.name, "boat", boat.priceCoins);
    return card;
  }

  private rodCard(state: GameStateResponse, rod: RodDefinition): HTMLElement {
    const owned = state.inventory.rods.some((item) => item.id === rod.id && item.quantity > 0);
    const equipped = owned && state.activeEquipment.rodId === rod.id;
    const { card, details, side } = this.shopItemShell({
      tone: "rod",
      icon: "rod",
      name: rod.name,
      description: rod.description,
      status: equipped ? "equipped" : owned ? "owned" : undefined,
    });
    details.append(
      shopStatGrid([
        ["Max fish", `${rod.maxFishWeightKg.toFixed(1)} kg`],
        ["Strength", `${rod.strength}/3`],
        ["Control", `×${rod.control.toFixed(2)}`],
        ["Break resist.", `${Math.round(rod.breakResistance * 100)}%`],
        ["Catch zone", `+${Math.round(rod.catchZoneBonus * 100)}%`],
      ]),
    );
    if (!owned) this.appendBuyControls(side, rod.id, rod.name, "rod", rod.priceCoins);
    return card;
  }

  private lureCard(state: GameStateResponse, lure: LureDefinition): HTMLElement {
    const ownedItem = state.inventory.lures.find((item) => item.id === lure.id && item.quantity > 0);
    const equipped = Boolean(ownedItem && state.activeEquipment.lureId === lure.id);
    const { card, details, side } = this.shopItemShell({
      tone: "lure",
      icon: "lure",
      name: lure.name,
      description: lure.description,
      status: equipped ? "equipped" : ownedItem ? "owned" : undefined,
    });
    details.append(
      shopStatGrid([
        ["Uses", `${lure.maximumDurability}`],
        ["Catch zone", `+${Math.round(lure.catchZoneBonus * 100)}%`],
        ["Difficulty", `+${Math.round(lure.difficultyModifier * 100)}%`],
        ["Owned", `${ownedItem?.quantity ?? 0}`],
      ]),
      shopSpeciesList("Best for", speciesNamesForIds(state, lure.preferredFishIds)),
    );
    this.appendBuyControls(side, lure.id, lure.name, "lure", lure.priceCoins);
    return card;
  }

  private baitCard(state: GameStateResponse, bait: BaitDefinition): HTMLElement {
    const ownedQuantity = state.inventory.baits.find((item) => item.id === bait.id)?.quantity ?? 0;
    const quantity = this.baitQuantities.get(bait.id) ?? 1;
    const equipped = ownedQuantity > 0 && state.activeEquipment.baitId === bait.id;
    const { card, body, details, side } = this.shopItemShell({
      tone: "bait",
      icon: "bait",
      name: bait.name,
      description: bait.description,
      status: equipped ? "equipped" : ownedQuantity > 0 ? "owned" : undefined,
    });
    details.append(
      shopStatGrid([
        ["Attraction", `×${bait.attraction.toFixed(2)}`],
        ["Price", `${formatCoins(bait.priceCoins)} / portion`],
        ["Owned", `${ownedQuantity}`],
      ]),
      shopSpeciesList("Attracts", speciesNamesForIds(state, bait.fishIds)),
    );
    const chips = createElement("div", "qty-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", `Amount of ${bait.name} to buy`);
    for (const choice of BAIT_QUANTITY_CHOICES) {
      const chip = createElement("button", `qty-chip${choice === quantity ? " is-active" : ""}`, `×${choice}`);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(choice === quantity));
      chip.addEventListener("click", () => {
        this.baitQuantities.set(bait.id, choice);
        this.renderShop();
      });
      chips.append(chip);
    }
    body.append(chips);
    this.appendBuyControls(side, bait.id, bait.name, "bait", bait.priceCoins * quantity, quantity);
    return card;
  }

  showCollection(collection?: CollectionResponse): void {
    if (collection) {
      this.latestCollection = collection;
      this.sellAllConfirming = false;
    }
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
      createElement("p", undefined, specimens.length ? "Individual fish you chose to keep. Sell them later when you need the coins." : "Keep a catch to give it a permanent place in your collection."),
    );
    intro.append(heading);
    panel.append(intro);

    if (specimens.length === 0) {
      const empty = createElement("div", "empty-state");
      empty.append(
        createElement("p", "empty-message", "No kept fish yet. Land a catch and choose “Keep fish” to start your collection."),
        this.createGoFishingAction(),
      );
      panel.append(empty);
      this.replaceScreen(panel);
      return;
    }

    const totalValue = specimens.reduce((sum, specimen) => sum + specimen.saleValueCoins, 0);
    const actionsBar = createElement("div", "collection-actions");
    const sellAllLabel = this.sellAllConfirming
      ? `Confirm: sell ${specimens.length} fish for ${formatCoins(totalValue)} coins`
      : `Sell all · ${formatCoins(totalValue)} coins`;
    const sellAll = createElement("button", `secondary-action${this.sellAllConfirming ? " is-confirming" : ""}`, sellAllLabel);
    sellAll.type = "button";
    sellAll.setAttribute(
      "aria-label",
      this.sellAllConfirming
        ? `Confirm selling all ${specimens.length} fish for ${formatCoins(totalValue)} coins`
        : `Sell all ${specimens.length} fish for ${formatCoins(totalValue)} coins`,
    );
    sellAll.addEventListener("click", () => {
      if (!this.sellAllConfirming) {
        this.sellAllConfirming = true;
        this.showCollection();
        return;
      }
      this.sellAllHandler?.();
    });
    actionsBar.append(sellAll);
    if (this.sellAllConfirming) {
      const cancel = createElement("button", "secondary-action collection-cancel", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.sellAllConfirming = false;
        this.showCollection();
      });
      actionsBar.append(cancel);
    }
    panel.append(actionsBar);

    const sortRow = createElement("div", "sort-row");
    const sortLabel = createElement("label", "muted", "Sort collection");
    const sortSelect = document.createElement("select");
    sortLabel.htmlFor = "collection-sort";
    sortSelect.id = "collection-sort";
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
    sortRow.append(sortLabel, sortSelect);
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
      card.dataset.speciesId = specimen.speciesId;
      card.append(createFishImage(specimen.species));
      const top = createElement("div", "collection-card-top");
      top.append(createElement("h2", undefined, specimen.species.commonName), createElement("span", `rarity-badge rarity-${specimen.species.rarity}`, capitalize(specimen.species.rarity)));
      const speciesNotes = document.createElement("details");
      speciesNotes.className = "collection-species-info";
      speciesNotes.append(createElement("summary", undefined, specimen.species.scientificName));
      const notes = createElement("div", "collection-species-notes");
      notes.append(
        createElement("p", "collection-description", specimen.species.description),
        speciesFact("Habitat", specimen.species.habitat),
        speciesFact("Native range", specimen.species.nativeRange),
      );
      const source = createElement("p", "journal-source");
      source.append("Source: ", createExternalLink(specimen.species.source.name, specimen.species.source.url));
      notes.append(source);
      speciesNotes.append(notes);
      const sell = createElement("button", "secondary-action sell-action");
      sell.append(createIcon("coin"), `Sell ${formatCoins(specimen.saleValueCoins)}`);
      sell.type = "button";
      sell.addEventListener("click", () => this.sellCatchHandler?.(specimen.id));
      card.append(top, speciesNotes, sell, this.specimenDetails(specimen));
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
    const entries = this.latestJournal.entries;
    const discovered = entries.filter((entry) => entry.discovered);
    const visibleEntries = entries.filter((entry) => {
      if (this.journalFilter === "discovered") return entry.discovered;
      if (this.journalFilter === "undiscovered") return !entry.discovered;
      return true;
    });

    const panel = createElement("section", "screen journal-screen");
    const intro = createElement("div", "dashboard-header");
    const heading = createElement("div");
    heading.append(
      createElement("span", "eyebrow", "Fish journal"),
      createElement("h1", undefined, `${discovered.length} of ${entries.length} species discovered`),
      createElement("p", undefined, "Discover a species to reveal its field notes, habitat, native range, and your personal records."),
    );
    intro.append(heading);
    panel.append(intro);

    const controls = createElement("div", "journal-controls");
    const filterLabel = createElement("label", "muted", "Show");
    const filter = document.createElement("select");
    filter.id = "journal-filter";
    filter.className = "sort-select";
    filterLabel.htmlFor = filter.id;
    const filterOptions: Array<[JournalFilterMode, string, number]> = [
      ["all", "All species", entries.length],
      ["discovered", "Discovered", discovered.length],
      ["undiscovered", "Undiscovered", entries.length - discovered.length],
    ];
    for (const [value, label, count] of filterOptions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `${label} (${count})`;
      option.selected = value === this.journalFilter;
      filter.append(option);
    }
    filter.addEventListener("change", () => {
      this.journalFilter = filter.value as JournalFilterMode;
      this.renderJournal();
    });
    controls.append(filterLabel, filter, createElement("span", "muted", `${visibleEntries.length} shown`));
    panel.append(controls);

    if (visibleEntries.length === 0) {
      const empty = createElement("div", "empty-state");
      empty.append(
        createElement("p", "empty-message", this.journalFilter === "discovered" ? "No species discovered yet. Start with the beginner water and make your first cast." : "Every species is already recorded in your journal."),
        this.journalFilter === "discovered" ? this.createGoFishingAction() : createElement("span", "muted", "Use the filter above to review every entry."),
      );
      panel.append(empty);
      this.replaceScreen(panel);
      return;
    }

    const grid = createElement("div", "journal-grid");
    for (const entry of visibleEntries) {
      const species = entry.species ?? state.catalog.fish.find((candidate) => candidate.id === entry.speciesId);
      if (!species) continue;
      const card = createElement("article", `journal-card${entry.discovered ? "" : " is-undiscovered"}`);
      card.dataset.speciesId = species.id;
      const top = createElement("div", "journal-card-top");
      top.append(
        createElement("h2", undefined, entry.discovered ? species.commonName : "Undiscovered species"),
        createElement("span", `rarity-badge rarity-${species.rarity}`, capitalize(species.rarity)),
      );
      card.append(top);
      if (entry.discovered) {
        card.append(createFishImage(species));
        card.append(createElement("em", "muted", species.scientificName));
        card.append(createElement("p", "journal-bio", species.description));
        const facts = createElement("div", "journal-facts");
        facts.append(speciesFact("Habitat", species.habitat), speciesFact("Native range", species.nativeRange));
        card.append(facts);
        const stats = createElement("ul", "journal-stats");
        const statLine = (label: string, value: string): HTMLElement => {
          const li = createElement("li");
          li.append(createElement("span", "muted", label), createElement("strong", undefined, value));
          return li;
        };
        stats.append(
          statLine("Caught", entry.timesCaught.toLocaleString()),
          statLine("Largest", entry.heaviestWeightKg !== null ? `${entry.heaviestWeightKg.toFixed(2)} kg` : "—"),
          statLine("Longest", entry.longestLengthCm !== null ? `${entry.longestLengthCm} cm` : "—"),
          statLine("Best sale", entry.bestSaleValueCoins !== null ? formatCoins(entry.bestSaleValueCoins) : "—"),
        );
        card.append(stats);
        const dates = createElement("div", "journal-record-dates");
        dates.append(
          speciesFact("Discovered", formatDate(entry.firstCaughtAt)),
          speciesFact("Last caught", formatDate(entry.lastCaughtAt)),
        );
        card.append(dates);
        const source = createElement("p", "journal-source");
        source.append("Source: ", createExternalLink(species.source.name, species.source.url));
        card.append(source);
      } else {
        card.append(createElement("span", "journal-unknown-mark", "?"));
        card.append(createElement("span", "journal-discovery-state", "Field notes locked"));
        card.append(createElement("p", "journal-hint", journalDiscoveryHint(state, species)));
        card.append(createElement("p", "muted", "Land one catch to reveal this species."));
      }
      grid.append(card);
    }
    panel.append(grid);
    this.replaceScreen(panel);
  }

  showLoadingScreen(message: string): void {
    this.clearStatus();
    const panel = createElement("section", "fishing-status is-loading");
    panel.setAttribute("aria-live", "polite");
    panel.append(createElement("span", "eyebrow", "One moment"), createElement("p", "muted", message));
    this.replaceScreen(panel);
  }

  showRetryPanel(eyebrow: string, message: string, retryLabel: string, onRetry: () => void, onBack?: () => void): void {
    this.clearStatus();
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
    this.clearStatus();
    const panel = createElement("section", "fishing-status");
    const species = result.species ?? result.catch?.species;
    const outcome = createElement("div", `outcome-banner outcome-${result.outcome}`);
    outcome.append(
      createElement("span", "outcome-kicker", result.outcome === "caught" ? "CATCH CONFIRMED" : "CATCH LOST"),
      createElement("strong", undefined, result.outcome === "caught" ? "The fish is yours to decide" : "The fish got away"),
    );
    panel.append(
      outcome,
      createElement("span", "eyebrow", result.outcome === "caught" ? "Fish landed" : "The line went slack"),
      createElement("h1", undefined, result.outcome === "caught" && result.catch ? result.catch.species.commonName : species?.commonName ?? "Unknown fish"),
      createElement("p", "result-message", result.message),
    );

    const risk = createElement("aside", `result-risk risk-${result.rodRiskBand}`);
    const rod = this.gameState?.catalog.rods.find((candidate) => candidate.id === result.rodId);
    const riskHeading = createElement("div", "result-risk-heading");
    riskHeading.append(createElement("strong", undefined, riskLabel(result.rodRiskBand)));
    risk.append(
      riskHeading,
      createElement("p", undefined, `${rod?.name ?? "Your rod"} had a ${result.rodBreakChancePercent.toFixed(2)}% break chance for this fish.`),
      createElement("span", "result-risk-consequence", result.rodBroke ? "The rod broke and is no longer usable." : RISK_PRESENTATION[result.rodRiskBand].consequence),
    );
    panel.append(risk);

    if (result.rodBroke) {
      const warning = createElement("aside", "rod-break-warning");
      const replacementName = result.replacementRodId
        ? this.gameState?.catalog.rods.find((candidate) => candidate.id === result.replacementRodId)?.name ?? "your strongest remaining rod"
        : undefined;
      warning.append(
        createElement("strong", undefined, `${rod?.name ?? "Your rod"} snapped.`),
        createElement(
          "p",
          "muted",
          replacementName
            ? `${replacementName} is equipped now. Replace the broken rod in the shop before taking another high-risk cast.`
            : "No usable rod remains. Open Shop → Rods to claim the free Starter Fiberglass replacement before casting again.",
        ),
      );
      panel.append(warning);
    }
    if (result.catch) {
      panel.append(createFishImage(result.catch.species));
      panel.append(this.specimenDetails(result.catch));
      const actions = createElement("div", "result-actions");
      const keep = createElement("button", "secondary-action keep-action");
      keep.append(createIcon("trophy"), "Keep fish");
      const sell = createElement("button", "primary-action", `Sell fish · ${formatCoins(result.catch.saleValueCoins)} coins`);
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
    this.clearStatus();
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

  private replaceScreen(panel: HTMLElement, options: { preserveScroll?: boolean } = {}): void {
    const scrollTop = options.preserveScroll ? this.content.scrollTop : 0;
    this.content.replaceChildren(panel);
    this.content.scrollTop = scrollTop;
    this.syncActionState();
  }

  private syncActionState(): void {
    this.content.dataset.pending = this.actionPending ? "true" : "false";
    this.content.setAttribute("aria-busy", String(this.actionPending));
    const controls = this.content.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select");
    for (const control of controls) {
      if (this.actionPending) {
        if (!control.disabled) control.dataset.pendingDisabled = "true";
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
      } else if (control.dataset.pendingDisabled === "true") {
        control.disabled = false;
        delete control.dataset.pendingDisabled;
        control.removeAttribute("aria-disabled");
      }
    }
  }

  private specimenDetails(specimen: FishSpecimen): HTMLElement {
    const details = createElement("div", "specimen-details");
    const comparison = getSpeciesSizeComparison(specimen);
    const size = createElement("div", "species-size");
    const sizeHeading = createElement("div", "species-size-heading");
    sizeHeading.append(
      createElement("span", "species-size-label", "Species size"),
      createElement("strong", "species-size-value", `${comparison.percentOfMaximum}% of max`),
    );

    const track = createElement("div", "species-size-track");
    track.setAttribute(
      "aria-label",
      `${specimen.weightKg.toFixed(1)} kilograms, ${comparison.label.toLowerCase()} for ${specimen.species.commonName}. Typical is ${specimen.species.typicalWeightKg.toFixed(1)} kilograms and the species maximum is ${specimen.species.maximumWeightKg.toFixed(1)} kilograms.`,
    );
    track.setAttribute("role", "img");
    const fill = createElement("span", "species-size-fill");
    fill.style.width = `${comparison.fillPercent}%`;
    const typicalMarker = createElement("span", "species-size-typical");
    typicalMarker.style.left = `${comparison.typicalMarkerPercent}%`;
    typicalMarker.setAttribute("aria-hidden", "true");
    typicalMarker.title = `Typical size: ${specimen.species.typicalWeightKg.toFixed(1)} kg`;
    track.append(fill, typicalMarker);

    const scale = createElement("div", "species-size-scale");
    scale.append(
      createElement("span", "species-size-status", comparison.label),
      createElement("span", "species-size-typical-label", `Typical ${specimen.species.typicalWeightKg.toFixed(1)} kg · Max ${specimen.species.maximumWeightKg.toFixed(1)} kg`),
    );
    size.append(sizeHeading, track, scale);
    details.append(
      createElement("strong", undefined, capitalize(specimen.quality)),
      statChip(specimen.weightKg.toFixed(1), "KG"),
      statChip(`${specimen.lengthCm}`, "CM"),
      statChip(specimen.saleValueCoins.toLocaleString(), "COINS"),
      (() => {
        const caughtMeta = createElement("div", "specimen-caught-meta");
        caughtMeta.append(
          createElement("span", "specimen-location", `Caught at ${specimen.locationName}`),
          createElement("span", "specimen-caught-date", `Caught ${formatDate(specimen.caughtAt)}`),
        );
        return caughtMeta;
      })(),
      size,
    );
    return details;
  }
}
