import { LitElement, html, css, nothing } from "lit";
import type { ToastState } from "../types";
import { uiFoundationStyles } from "../component-styles";

export class StatusToastElement extends LitElement {
  static properties = {
    message: { type: String },
    state: { type: String },
  };

  static styles = [
    uiFoundationStyles,
    css`
      :host {
        position: fixed;
        top: calc(var(--app-safe-top) + var(--topbar-h) + 6px);
        left: calc(var(--app-safe-left) + 12px);
        right: calc(var(--app-safe-right) + 12px);
        z-index: 30;
        display: block;
        width: auto;
        max-width: 460px;
        max-height: min(30vh, 180px);
        margin-inline: auto;
        overflow: hidden;
        pointer-events: none;
      }

      :host([hidden]) {
        display: none;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding: 11px 15px;
        overflow: hidden;
        border: 1px solid rgba(214, 184, 106, 0.32);
        border-radius: 6px;
        color: var(--ink);
        background: rgba(9, 10, 8, 0.97);
        box-shadow: var(--shadow-card);
        font-size: 0.84rem;
        font-weight: 550;
        line-height: 1.4;
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
        transition: opacity 0.24s var(--ease-spring), transform 0.24s var(--ease-spring);
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
      }

      .toast.is-shown {
        opacity: 1;
        transform: none;
      }

      .toast::before {
        content: "";
        flex: 0 0 auto;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--cyan);
        box-shadow: 0 0 10px rgba(56, 205, 236, 0.8);
      }

      .toast[data-state="loading"]::before {
        animation: pulse-dot 1.2s ease-in-out infinite;
      }

      .toast[data-state="ready"]::before {
        background: #57e0a4;
        box-shadow: 0 0 10px rgba(87, 224, 164, 0.75);
      }

      .toast[data-state="error"]::before {
        background: var(--coral);
        box-shadow: 0 0 10px rgba(255, 143, 125, 0.8);
      }

      @keyframes pulse-dot {
        0%, 100% { transform: scale(0.75); opacity: 0.55; }
        50% { transform: scale(1.15); opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .toast {
          opacity: 1;
          transform: none;
        }
      }

      @media (max-height: 640px) {
        :host {
          top: calc(var(--app-safe-top) + var(--topbar-h) + 4px);
        }
      }

      @media (orientation: landscape) and (max-height: 560px) {
        :host {
          top: calc(var(--app-safe-top) + var(--topbar-h) + 4px);
        }
      }

      @media (forced-colors: active) {
        .toast {
          forced-color-adjust: none;
          border-color: ButtonText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }

        .toast::before {
          background: currentColor;
          box-shadow: none;
        }
      }
    `,
  ];

  declare message?: string;
  declare state: ToastState;

  constructor() {
    super();
    this.state = "loading";
  }

  render() {
    if (!this.message) return nothing;
    return html`<div class="toast is-shown" data-state=${this.state} role="status" aria-live="polite" aria-atomic="true"><span>${this.message}</span></div>`;
  }
}

customElements.define("status-toast", StatusToastElement);
