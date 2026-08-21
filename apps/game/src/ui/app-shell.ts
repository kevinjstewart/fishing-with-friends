import type { PlayerProfile } from "@fishing/shared";

export class AppShell {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly player: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.status = document.createElement("p");
    this.status.className = "status-message";
    this.player = document.createElement("p");
    this.player.className = "player-message";
    this.root.replaceChildren(this.status, this.player);
  }

  setStatus(message: string, state: "loading" | "ready" | "error" = "loading"): void {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  setPlayer(player: PlayerProfile): void {
    this.player.textContent = `Signed in as ${player.displayName}`;
  }
}
