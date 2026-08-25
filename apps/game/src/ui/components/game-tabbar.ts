import { LitElement, html, css } from "lit";
import type { ScreenId } from "../types";
import { emitUiEvent } from "../types";
import { icon, type IconName } from "../icons";
import { uiFoundationStyles } from "../component-styles";

const TABS: Array<{ id: ScreenId; label: string; icon: IconName }> = [
  { id: "lakes", label: "Lakes", icon: "waves" },
  { id: "friends", label: "Friends", icon: "friend" },
  { id: "shop", label: "Shop", icon: "shop" },
  { id: "collection", label: "Collection", icon: "trophy" },
  { id: "journal", label: "Journal", icon: "book" },
];

export class GameTabbarElement extends LitElement {
  static properties = {
    activeScreen: { type: String },
    navEnabled: { type: Boolean },
    pendingNavigation: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        display: block;
        pointer-events: auto;
      }

      .tabbar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        min-height: calc(var(--tabbar-h) + var(--app-safe-bottom));
        padding: 0 var(--app-safe-right) var(--app-safe-bottom) var(--app-safe-left);
        border-top: 1px solid rgba(214, 184, 106, 0.2);
        background: rgba(7, 8, 6, 0.97);
        box-shadow: 0 -16px 36px rgba(0, 0, 0, 0.34);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        backdrop-filter: blur(20px) saturate(150%);
        pointer-events: auto;
      }

      .tabbar[data-disabled="true"] {
        pointer-events: none;
        filter: saturate(0.55);
        opacity: 0.5;
      }

      .tabbar[data-pending="true"] {
        filter: saturate(0.82);
      }

      .tab-button {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 56px;
        padding: 6px 4px;
        border: 0;
        color: #7d7b70;
        background: none;
        font-size: 0.57rem;
        font-weight: 550;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: color 0.2s ease, transform 0.2s var(--ease-spring);
      }

      .tab-button .icon {
        width: 22px;
        height: 22px;
        transition: transform 0.25s var(--ease-spring);
      }

      .tab-button:active .icon {
        transform: scale(0.88);
      }

      .tab-button.is-active {
        color: #e4cc8c;
      }

      .tab-button.is-active::after {
        content: "";
        position: absolute;
        right: auto;
        bottom: 0;
        left: auto;
        z-index: 0;
        width: 28px;
        height: 1px;
        border-radius: 0;
        background: var(--gold);
        box-shadow: 0 0 12px rgba(214, 184, 106, 0.42);
      }

      .tab-button.is-active .icon {
        stroke-width: 2.1;
        filter: drop-shadow(0 0 8px rgba(214, 184, 106, 0.18));
      }

      .tab-button[data-loading]::before {
        content: "";
        position: absolute;
        top: 5px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--gold);
        animation: pulse-dot 1.1s ease-in-out infinite;
      }

      @keyframes pulse-dot {
        0%, 100% { transform: scale(0.75); opacity: 0.55; }
        50% { transform: scale(1.15); opacity: 1; }
      }

      @media (orientation: landscape) and (max-height: 560px) {
        .tab-button {
          min-height: 48px;
          padding: 4px 2px;
          font-size: 0.6rem;
        }

        .tab-button .icon {
          width: 19px;
          height: 19px;
        }
      }
    `,
  ];

  declare activeScreen: ScreenId;
  declare navEnabled: boolean;
  declare pendingNavigation?: ScreenId;

  constructor() {
    super();
    this.activeScreen = "lakes";
    this.navEnabled = true;
  }

  render() {
    return html`
      <nav class="tabbar" aria-label="Game screens" data-disabled=${String(!this.navEnabled)} data-pending=${String(Boolean(this.pendingNavigation))}>
        ${TABS.map((tab) => {
          const active = tab.id === this.activeScreen;
          const pending = tab.id === this.pendingNavigation;
          return html`
            <button
              class="tab-button ${active ? "is-active" : ""}"
              type="button"
              ?disabled=${!this.navEnabled}
              aria-disabled=${String(!this.navEnabled)}
              ?aria-current=${active}
              aria-label=${tab.label}
              ?data-loading=${pending}
              ?aria-busy=${pending}
              @click=${() => emitUiEvent(this, "ui:navigate", { screen: tab.id })}
            >
              ${icon(tab.icon)}<span>${tab.label}</span>
            </button>
          `;
        })}
      </nav>
    `;
  }
}

customElements.define("game-tabbar", GameTabbarElement);
