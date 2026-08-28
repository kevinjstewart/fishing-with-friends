import { Icon } from "../../shared-ui/icons";
import { formatCoins } from "../../shared-ui/presenters";

export interface GameTopbarProps {
  coins: number;
  disabled?: boolean;
  onShop: () => void;
}

export function GameTopbar({ coins, disabled = false, onShop }: GameTopbarProps) {
  return (
    <header className="app-topbar">
      <div className="app-brand" aria-label="Fishing with Friends">
        <span className="brand-mark"><Icon name="rod" /></span>
        <span>ANGLER'S CLUB</span>
      </div>
      <button className="wallet-chip" type="button" aria-label="Open the tackle shop" disabled={disabled} onClick={onShop}>
        <Icon name="coin" /><strong>{formatCoins(coins)}</strong>
      </button>
    </header>
  );
}
