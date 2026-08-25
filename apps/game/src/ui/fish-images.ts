import type { FishSpecies } from "@fishing/shared";
import { LitElement, html, css, nothing } from "lit";
import { uiFoundationStyles } from "./component-styles";

interface PageImagesResponse {
  query?: {
    pages?: Array<{
      thumbnail?: { source: string };
    }>;
  };
}

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";
const THUMBNAIL_WIDTH = 640;
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 6_000;
const IMAGE_TIMEOUT_MS = 7_000;
const RETRY_DELAY_MS = 180;

const FISH_ARTICLE_TITLES = new Map<string, string>([
  ["yellow-perch", "Yellow perch"],
  ["pumpkinseed", "Pumpkinseed"],
  ["rock-bass", "Rock bass"],
  ["bluegill", "Bluegill"],
  ["black-crappie", "Black crappie"],
  ["common-carp", "Common carp"],
  ["bowfin", "Bowfin"],
  ["freshwater-drum", "Freshwater drum"],
  ["smallmouth-bass", "Smallmouth bass"],
  ["largemouth-bass", "Largemouth bass"],
  ["walleye", "Walleye"],
  ["northern-pike", "Northern pike"],
  ["channel-catfish", "Channel catfish"],
  ["lake-trout", "Lake trout"],
  ["chinook-salmon", "Chinook salmon"],
  ["coho-salmon", "Coho salmon"],
  ["muskellunge", "Muskellunge"],
  ["creek-chub", "Creek chub"],
  ["golden-shiner", "Golden shiner"],
  ["yellow-bullhead", "Yellow bullhead"],
  ["white-sucker", "White sucker"],
  ["brown-bullhead", "Brown bullhead"],
  ["brook-trout", "Brook trout"],
  ["white-crappie", "White crappie"],
  ["longnose-gar", "Longnose gar"],
  ["shorthead-redhorse", "Shorthead redhorse"],
  ["sauger", "Sauger"],
  ["splake", "Splake"],
  ["burbot", "Burbot"],
  ["lake-whitefish", "Lake whitefish"],
  ["rainbow-trout", "Rainbow trout"],
  ["brown-trout", "Brown trout"],
  ["mooneye", "Mooneye"],
  ["cisco", "Cisco (fish)"],
  ["rainbow-smelt", "Rainbow smelt"],
  ["atlantic-salmon", "Atlantic salmon"],
  ["pink-salmon", "Pink salmon"],
  ["american-eel", "American eel"],
  ["lake-sturgeon", "Lake sturgeon"],
  ["quillback", "Quillback"],
]);

const imageCache = new Map<string, Promise<string | null>>();

function articleUrl(articleTitle: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replaceAll(" ", "_"))}`;
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
}

function retryUrl(url: string, attempt: number): string {
  if (attempt === 0) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("fishing-with-friends-retry", String(attempt));
    return parsed.toString();
  } catch {
    return url;
  }
}

async function requestFishImage(articleTitle: string): Promise<string | null> {
  const parameters = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: String(THUMBNAIL_WIDTH),
    titles: articleTitle,
  });
  const url = `${WIKIPEDIA_API_URL}?${parameters}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) return null;
        throw new Error(`Fish image request failed with ${response.status}`);
      }
      const payload = (await response.json()) as PageImagesResponse;
      return payload.query?.pages?.[0]?.thumbnail?.source ?? null;
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) return null;
      await waitForRetry(attempt);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return null;
}

export function loadFishImage(species: FishSpecies): Promise<string | null> {
  const articleTitle = FISH_ARTICLE_TITLES.get(species.id);
  if (!articleTitle) return Promise.resolve(null);

  let imageUrl = imageCache.get(species.id);
  if (!imageUrl) {
    imageUrl = requestFishImage(articleTitle).catch(() => null);
    imageCache.set(species.id, imageUrl);
    void imageUrl.then((url) => {
      if (!url && imageCache.get(species.id) === imageUrl) imageCache.delete(species.id);
    });
  }
  return imageUrl;
}

async function loadImageWithRetries(imageUrl: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    const loaded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
      const finish = (success: boolean): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        resolve(success);
      };
      const onLoad = (): void => finish(true);
      const onError = (): void => finish(false);
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
      image.src = retryUrl(imageUrl, attempt);
    });
    if (loaded) return retryUrl(imageUrl, attempt);
    if (attempt < MAX_ATTEMPTS - 1) await waitForRetry(attempt);
  }
  return null;
}

export class FishImageElement extends LitElement {
  static properties = {
    species: { attribute: false },
    variant: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
      }

      figure.fish-image {
        position: relative;
        display: block;
        min-height: 168px;
        margin: 0;
        overflow: hidden;
        border-bottom: 1px solid rgba(214, 184, 106, 0.16);
        background: rgba(5, 16, 28, 0.5);
      }

      .fish-image-placeholder {
        display: grid;
        min-height: 168px;
        align-content: center;
        padding: 12px;
        color: var(--ink-faint);
        font-size: 0.78rem;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }

      .fish-image img {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 168px;
        object-fit: cover;
        object-position: center;
        opacity: 0;
        transition: opacity 0.25s ease;
      }

      .fish-image.is-loaded .fish-image-placeholder {
        visibility: hidden;
        opacity: 0;
      }

      .fish-image.is-loaded img {
        opacity: 1;
      }

      figcaption {
        position: absolute;
        right: 10px;
        bottom: 0;
        z-index: 1;
        display: block;
        max-width: calc(100% - 20px);
        padding: 12px 0 7px 18px;
        background: linear-gradient(90deg, transparent, rgba(4, 18, 32, 0.78) 32%);
        text-align: right;
        font-size: 0.68rem;
      }

      figcaption a {
        color: var(--aqua);
      }

      :host([variant="catch"]) figure.fish-image,
      figure.fish-image.catch-hero-image {
        min-height: 220px;
        height: 220px;
        border: 0;
      }

      :host([variant="catch"]) .fish-image img,
      figure.fish-image.catch-hero-image img {
        height: 220px;
        filter: saturate(1.08) contrast(1.04);
      }

      :host([variant="catch"]) figure.fish-image::after,
      figure.fish-image.catch-hero-image::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        background: linear-gradient(180deg, transparent 50%, rgba(3, 17, 22, 0.88));
        pointer-events: none;
      }

      @media (max-height: 700px) {
        :host([variant="catch"]) figure.fish-image,
        :host([variant="catch"]) .fish-image img {
          min-height: 176px;
          height: 176px;
        }
      }

      @media (forced-colors: active) {
        figure.fish-image {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
        }

        .fish-image img {
          forced-color-adjust: none;
        }
      }
    `,
  ];

  declare species?: FishSpecies;
  declare variant: string;
  private imageState: "loading" | "unavailable" | "loaded" = "loading";
  private imageUrl?: string;
  private loadSequence = 0;

  constructor() {
    super();
    this.variant = "card";
  }

  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("species") || !this.species) return;
    const sequence = ++this.loadSequence;
    this.imageState = "loading";
    this.imageUrl = undefined;
    void this.loadSpeciesImage(this.species, sequence);
  }

  private async loadSpeciesImage(species: FishSpecies, sequence: number): Promise<void> {
    const imageUrl = await loadFishImage(species);
    if (sequence !== this.loadSequence || !this.isConnected) return;
    if (!imageUrl) {
      this.imageState = "unavailable";
      this.requestUpdate();
      return;
    }
    const loadedUrl = await loadImageWithRetries(imageUrl);
    if (sequence !== this.loadSequence || !this.isConnected) return;
    this.imageUrl = loadedUrl ?? undefined;
    this.imageState = loadedUrl ? "loaded" : "unavailable";
    this.requestUpdate();
  }

  render() {
    const species = this.species;
    if (!species) return nothing;
    const catchClass = this.variant === "catch" ? "catch-hero-image" : "";
    return html`
      <figure class="fish-image ${catchClass} is-${this.imageState}" data-image-state=${this.imageState}>
        ${this.imageUrl
          ? html`<img src=${this.imageUrl} alt="${species.commonName} photograph from Wikipedia" />
              <figcaption>Photo via <a href=${articleUrl(FISH_ARTICLE_TITLES.get(species.id) ?? "")} target="_blank" rel="noopener noreferrer">Wikipedia</a></figcaption>`
          : html`<span class="fish-image-placeholder muted">${this.imageState === "unavailable" ? "Photo unavailable" : "Loading photo…"}</span>`}
      </figure>
    `;
  }
}

if (!customElements.get("fish-image")) customElements.define("fish-image", FishImageElement);

export function createFishImage(species: FishSpecies): FishImageElement {
  const image = document.createElement("fish-image") as FishImageElement;
  image.species = species;
  return image;
}
