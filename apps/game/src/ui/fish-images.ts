import type { FishSpecies } from "@fishing/shared";
import { createElement } from "./create-element";

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
        // A missing article is a stable negative result. Rate limits and server
        // failures are transient and should get the same bounded retry as a
        // network failure.
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          return null;
        }
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
      // Do not permanently poison the cache after a transient outage. A
      // later screen render can make a fresh, bounded attempt.
      if (!url && imageCache.get(species.id) === imageUrl) imageCache.delete(species.id);
    });
  }
  return imageUrl;
}

async function loadImageWithRetries(imageUrl: string): Promise<HTMLImageElement | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const image = document.createElement("img");
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

    if (loaded) return image;
    if (attempt < MAX_ATTEMPTS - 1) await waitForRetry(attempt);
  }

  return null;
}

export function createFishImage(species: FishSpecies): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "fish-image";
  figure.dataset.imageState = "loading";
  const placeholder = createElement("span", "fish-image-placeholder muted", "Loading photo…");
  figure.append(placeholder);

  void loadFishImage(species).then((imageUrl) => {
    if (!figure.isConnected) return;
    if (!imageUrl) {
      placeholder.textContent = "Photo unavailable";
      figure.classList.add("is-unavailable");
      figure.dataset.imageState = "unavailable";
      return;
    }

    void loadImageWithRetries(imageUrl).then((image) => {
      if (!figure.isConnected) return;
      if (!image) {
        placeholder.textContent = "Photo unavailable";
        figure.classList.add("is-unavailable");
        figure.dataset.imageState = "unavailable";
        return;
      }

      image.alt = `${species.commonName} photograph from Wikipedia`;
      const attribution = document.createElement("a");
      attribution.href = articleUrl(FISH_ARTICLE_TITLES.get(species.id) ?? "");
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      attribution.textContent = "Wikipedia";

      const caption = document.createElement("figcaption");
      caption.append("Photo via ", attribution);
      figure.append(image, caption);
      figure.classList.add("is-loaded");
      figure.dataset.imageState = "loaded";
    });
  });

  return figure;
}
