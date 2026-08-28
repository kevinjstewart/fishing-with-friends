import type { FishSpecies } from "@fishing/shared/contracts";
import { useEffect, useRef, useState } from "react";
import { fishArticleUrl, loadFishImage, loadImageWithRetries } from "./fish-image-loader";

export interface FishImageProps {
  species: FishSpecies;
  variant?: "card" | "catch";
}

export function FishImage({ species, variant = "card" }: FishImageProps) {
  const [imageState, setImageState] = useState<"loading" | "unavailable" | "loaded">("loading");
  const [imageUrl, setImageUrl] = useState<string>();
  const loadSequence = useRef(0);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    let active = true;
    setImageState("loading");
    setImageUrl(undefined);

    void loadFishImage(species)
      .then(async (candidateUrl) => {
        if (!active || sequence !== loadSequence.current) return;
        if (!candidateUrl) {
          setImageState("unavailable");
          return;
        }
        const loadedUrl = await loadImageWithRetries(candidateUrl);
        if (!active || sequence !== loadSequence.current) return;
        setImageUrl(loadedUrl ?? undefined);
        setImageState(loadedUrl ? "loaded" : "unavailable");
      })
      .catch(() => {
        if (active && sequence === loadSequence.current) setImageState("unavailable");
      });

    return () => {
      active = false;
      loadSequence.current += 1;
    };
  }, [species]);

  const catchClass = variant === "catch" ? "catch-hero-image" : "";
  return (
    <figure className={`fish-image ${catchClass} is-${imageState}`} data-image-state={imageState} data-testid="fish-image">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={`${species.commonName} photograph from Wikipedia`} />
          <figcaption>
            Photo via <a href={fishArticleUrl(species)} target="_blank" rel="noopener noreferrer">Wikipedia</a>
          </figcaption>
        </>
      ) : (
        <span className="fish-image-placeholder muted">{imageState === "unavailable" ? "Photo unavailable" : "Loading photo…"}</span>
      )}
    </figure>
  );
}
