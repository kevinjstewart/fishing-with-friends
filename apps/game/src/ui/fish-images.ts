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
]);

const imageCache = new Map<string, Promise<string | null>>();

function articleUrl(articleTitle: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replaceAll(" ", "_"))}`;
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
  const response = await fetch(`${WIKIPEDIA_API_URL}?${parameters}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as PageImagesResponse;
  return payload.query?.pages?.[0]?.thumbnail?.source ?? null;
}

export function loadFishImage(species: FishSpecies): Promise<string | null> {
  const articleTitle = FISH_ARTICLE_TITLES.get(species.id);
  if (!articleTitle) return Promise.resolve(null);

  let imageUrl = imageCache.get(species.id);
  if (!imageUrl) {
    imageUrl = requestFishImage(articleTitle).catch(() => null);
    imageCache.set(species.id, imageUrl);
  }
  return imageUrl;
}

export function createFishImage(species: FishSpecies): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "fish-image";
  const placeholder = createElement("span", "fish-image-placeholder muted", "Loading image…");
  figure.append(placeholder);

  void loadFishImage(species).then((imageUrl) => {
    if (!figure.isConnected || !imageUrl) {
      placeholder.textContent = "Image unavailable";
      figure.classList.add("is-unavailable");
      return;
    }

    const image = document.createElement("img");
    image.alt = `${species.commonName} photograph from Wikipedia`;
    image.decoding = "async";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.src = imageUrl;
    image.addEventListener("error", () => {
      image.remove();
      placeholder.textContent = "Image unavailable";
      figure.classList.add("is-unavailable");
    });
    image.addEventListener("load", () => figure.classList.add("is-loaded"));

    const attribution = document.createElement("a");
    attribution.href = articleUrl(FISH_ARTICLE_TITLES.get(species.id) ?? "");
    attribution.target = "_blank";
    attribution.rel = "noopener noreferrer";
    attribution.textContent = "Wikipedia";

    const caption = document.createElement("figcaption");
    caption.append("Photo via ", attribution);
    placeholder.remove();
    figure.append(image, caption);
  });

  return figure;
}
