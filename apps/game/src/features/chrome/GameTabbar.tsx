import type { ScreenId } from "../../app/app-types";
import { Icon, type IconName } from "../../shared-ui/icons";

const TABS: Array<{ id: ScreenId; label: string; icon: IconName }> = [
  { id: "lakes", label: "Lakes", icon: "waves" },
  { id: "friends", label: "Friends", icon: "friend" },
  { id: "shop", label: "Shop", icon: "shop" },
  { id: "collection", label: "Collection", icon: "trophy" },
  { id: "journal", label: "Journal", icon: "book" },
];

export interface GameTabbarProps {
  activeScreen: ScreenId;
  navEnabled: boolean;
  pendingNavigation?: ScreenId;
  onNavigate: (screen: ScreenId) => void;
}

export function GameTabbar({ activeScreen, navEnabled, pendingNavigation, onNavigate }: GameTabbarProps) {
  return (
    <nav className="tabbar" aria-label="Game screens" data-disabled={String(!navEnabled)} data-pending={String(Boolean(pendingNavigation))}>
      {TABS.map((tab) => {
        const active = tab.id === activeScreen;
        const pending = tab.id === pendingNavigation;
        return (
          <button
            key={tab.id}
            className={`tab-button ${active ? "is-active" : ""}`}
            type="button"
            disabled={!navEnabled}
            aria-disabled={!navEnabled}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            data-loading={pending ? "true" : undefined}
            aria-busy={pending ? "true" : undefined}
            onClick={() => onNavigate(tab.id)}
          >
            <Icon name={tab.icon} /><span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
