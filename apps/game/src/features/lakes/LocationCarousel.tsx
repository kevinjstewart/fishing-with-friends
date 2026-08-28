import type { GameStateResponse, LocationAvailability } from "@fishing/shared/contracts";
import { LocationCard } from "./LocationCard";

export interface LocationCarouselProps {
  state: GameStateResponse;
  selectedLocationId: string;
  onSelect: (location: LocationAvailability) => void;
  onOpenShop: (location: LocationAvailability) => void;
}

export function LocationCarousel({ state, selectedLocationId, onSelect, onOpenShop }: LocationCarouselProps) {
  return (
    <div className="locations-list" role="radiogroup" aria-label="Fishing locations">
      {state.locations.map((location) => (
        <LocationCard
          key={location.id}
          state={state}
          location={location}
          selected={location.id === selectedLocationId}
          onSelect={onSelect}
          onOpenShop={() => onOpenShop(location)}
        />
      ))}
    </div>
  );
}
