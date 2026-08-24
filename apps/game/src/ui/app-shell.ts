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
} from "@fishing/shared";
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
  return dots;
}

type CollectionSortMode = "newest" | "heaviest" | "value" | "species";

type ShopCategory = "boats" | "rods" | "lures" | "bait";

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
  private navEnabled = true;
  private pendingNavigation?: ScreenId;
  private actionPending = false;
  private selectedLocationId?: string;
  private collectionSort: CollectionSortMode = "newest";
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

    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const rod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);

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
      const weights = location.fishIds.map((fishId) => state.catalog.fish.find((species) => species.id === fishId)?.maximumWeightKg ?? 0);
      const heaviest = Math.max(0, ...weights);
      const baitQuantity = bait?.quantity ?? 0;
      const lureUsesLeft = lure?.durability ?? 0;
      const lureUsable = Boolean(lure && lure.quantity > 0 && lureUsesLeft >= 1);
      const rodReady = !rod || heaviest <= rod.maxFishWeightKg;

      castChips.replaceChildren(
        readinessChip(
          "rod",
          `${heaviest}kg`,
          rodReady ? "ok" : "warn",
          rodReady
            ? `Biggest fish here weighs ${heaviest}kg — your rod can handle it`
            : `Fish here reach ${heaviest}kg but your rod tops out at ${rod?.maxFishWeightKg ?? 0}kg`,
        ),
        readinessChip("lure", `${Math.max(0, lureUsesLeft)}`, lureUsable ? "ok" : "bad", lureUsable ? `${lureUsesLeft} lure uses left` : "Your lure is worn out"),
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
      if (!lureUsable) {
        castButton.disabled = false;
        castButton.classList.add("is-restock");
        castButton.append(createIcon("lure"), "Replace lure");
        castButton.onclick = () => this.openShop("lures");
        return;
      }
      castButton.disabled = !location.unlocked || !this.startFishingHandler;
      castButton.append(createIcon("waves"), `Cast at ${location.name}`);
      castButton.onclick = () => this.startFishingHandler?.(selectedLocationId);
    };

    for (const location of state.locations) {
      const isSelected = location.id === selectedLocationId;
      const card = createElement("article", `location-card risk-${location.riskBand}${isSelected ? " is-selected" : ""}${location.unlocked ? "" : " is-locked"}`);

      const top = createElement("div", "location-top");
      top.append(createElement("h2", undefined, location.name), riskDots(location));

      const fishNames = location.fishIds.map((fishId) => state.catalog.fish.find((species) => species.id === fishId)?.commonName ?? fishId);
      const fishChips = createElement("div", "fish-chips");
      for (const fishName of fishNames.slice(0, 3)) fishChips.append(createElement("span", "fish-chip", fishName));
      if (fishNames.length > 3) fishChips.append(createElement("span", "fish-chip is-more", `+${fishNames.length - 3}`));

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
        lock.append(createIcon("lock"), document.createTextNode(requiredBoat?.name ?? "Better boat"));
        foot.append(lock);
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `${location.name}, locked. Requires ${requiredBoat?.name ?? "a better boat"} — open the shop`);
        const openBoats = (): void => this.openShop("boats");
        card.addEventListener("click", openBoats);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openBoats();
          }
        });
      }

      card.append(top, fishChips, foot);
      locationsList.append(card);
    }

    screen.append(hero, this.buildGearDock(state), locationsList);
    const recoveryBanner = this.buildRecoveryBanner(state);
    if (recoveryBanner) screen.append(recoveryBanner);

    const castBar = createElement("div", "cast-bar");
    castBar.append(castChips, castButton);
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

  private buildGearDock(state: GameStateResponse): HTMLElement {
    const dock = createElement("section", "gear-dock");
    dock.setAttribute("aria-label", "Current tackle");

    const boat = state.catalog.boats.find((item) => item.id === state.activeEquipment.boatId);
    const rod = state.catalog.rods.find((item) => item.id === state.activeEquipment.rodId);
    const lure = state.inventory.lures.find((item) => item.id === state.activeEquipment.lureId);
    const bait = state.inventory.baits.find((item) => item.id === state.activeEquipment.baitId);
    const lureDefinition = lure ? state.catalog.lures.find((item) => item.id === lure.id) : undefined;

    const closeAllDropdowns = (): void => {
      for (const options of dock.querySelectorAll<HTMLElement>(".equipment-options")) {
        options.hidden = true;
        options.style.left = "";
      }
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

      tile.addEventListener("click", () => {
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

  private shopItemShell(options: { tone: string; icon: IconName; name: string; stat: string; owned?: boolean }): { card: HTMLElement; body: HTMLElement; side: HTMLElement } {
    const card = createElement("article", `shop-item tone-${options.tone}${options.owned ? " is-owned" : ""}`);
    const icon = createElement("span", "shop-icon");
    icon.append(createIcon(options.icon));
    const body = createElement("div", "shop-body");
    body.append(createElement("h2", undefined, options.name), createElement("p", "shop-stat", options.stat));
    const side = createElement("div", "shop-side");
    card.append(icon, body, side);
    return { card, body, side };
  }

  private appendBuyControls(side: HTMLElement, itemId: string, totalCost: number, quantity?: number): void {
    const coins = this.gameState?.coins ?? 0;
    const button = createElement("button", "buy-btn");
    button.type = "button";
    if (totalCost === 0) {
      button.append("Claim");
    } else {
      button.append(createIcon("coin"), document.createTextNode(formatCoins(totalCost)));
    }
    if (coins < totalCost) {
      button.disabled = true;
      side.append(button, createElement("span", "short-note", `Need ${formatCoins(totalCost - coins)} more`));
      return;
    }
    button.addEventListener("click", () => this.purchaseHandler?.(itemId, quantity));
    side.append(button);
  }

  private ownedCheck(): HTMLElement {
    const check = createElement("span", "owned-check");
    check.append(createIcon("check"), "Owned");
    return check;
  }

  private boatCard(state: GameStateResponse, boat: BoatDefinition): HTMLElement {
    const owned = state.inventory.boats.some((item) => item.id === boat.id && item.quantity > 0);
    const unlocks = boat.unlocksLocationIds.map((id) => state.catalog.locations.find((location) => location.id === id)?.name ?? id).join(" · ");
    const { card, side } = this.shopItemShell({
      tone: "boat",
      icon: "anchor",
      name: boat.name,
      stat: unlocks ? `Tier ${boat.tier} · ${unlocks}` : `Tier ${boat.tier} · starter craft`,
      owned,
    });
    if (owned) side.append(this.ownedCheck());
    else this.appendBuyControls(side, boat.id, boat.priceCoins);
    return card;
  }

  private rodCard(state: GameStateResponse, rod: RodDefinition): HTMLElement {
    const owned = state.inventory.rods.some((item) => item.id === rod.id && item.quantity > 0);
    const { card, side } = this.shopItemShell({
      tone: "rod",
      icon: "rod",
      name: rod.name,
      stat: `Lands ≤${rod.maxFishWeightKg}kg · +${Math.round(rod.catchZoneBonus * 100)}% catch zone`,
      owned,
    });
    if (owned) side.append(this.ownedCheck());
    else this.appendBuyControls(side, rod.id, rod.priceCoins);
    return card;
  }

  private lureCard(state: GameStateResponse, lure: LureDefinition): HTMLElement {
    const ownedItem = state.inventory.lures.find((item) => item.id === lure.id && item.quantity > 0);
    const { card, side } = this.shopItemShell({
      tone: "lure",
      icon: "lure",
      name: lure.name,
      stat: `${lure.maximumDurability} uses · +${Math.round(lure.catchZoneBonus * 100)}% catch zone${ownedItem ? ` · own ${ownedItem.quantity}` : ""}`,
    });
    this.appendBuyControls(side, lure.id, lure.priceCoins);
    return card;
  }

  private baitCard(state: GameStateResponse, bait: BaitDefinition): HTMLElement {
    const ownedQuantity = state.inventory.baits.find((item) => item.id === bait.id)?.quantity ?? 0;
    const quantity = this.baitQuantities.get(bait.id) ?? 1;
    const { card, body, side } = this.shopItemShell({
      tone: "bait",
      icon: "bait",
      name: bait.name,
      stat: `${bait.fishIds.length} species · ${formatCoins(bait.priceCoins)} each${ownedQuantity > 0 ? ` · own ${ownedQuantity}` : ""}`,
    });
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
    this.appendBuyControls(side, bait.id, bait.priceCoins * quantity, quantity);
    return card;
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
      size,
    );
    return details;
  }
}
