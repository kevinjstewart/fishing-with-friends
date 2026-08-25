import { css } from "lit";

export const uiFoundationStyles = css`
  :host {
    box-sizing: border-box;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  select {
    color: inherit;
    font: inherit;
    touch-action: manipulation;
  }

  button:disabled,
  select:disabled {
    cursor: not-allowed;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  :focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .sr-only {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }

  .icon {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1,
  h2 {
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: 700;
  }

  h1 {
    font-size: clamp(1.38rem, 5.5vw, 1.95rem);
    line-height: 1.02;
    background: linear-gradient(105deg, #f8f1e4 12%, #e4cf97 92%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  h2 {
    font-size: 1.02rem;
    line-height: 1.2;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    color: var(--gold);
    font-size: 0.58rem;
    font-weight: 650;
    letter-spacing: 0.24em;
    text-transform: uppercase;
  }

  .muted {
    color: var(--ink-dim);
  }

  .primary-action,
  .secondary-action {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    padding: 12px 18px;
    border: 1px solid rgba(244, 219, 151, 0.5);
    border-radius: 6px;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
    transition: transform 0.18s var(--ease-spring), box-shadow 0.2s ease, filter 0.2s ease;
  }

  .primary-action {
    width: 100%;
    overflow: hidden;
    color: #fff4e5;
    background: linear-gradient(180deg, #a53449, #721a2d);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.14), 0 9px 22px rgba(79, 10, 27, 0.35);
  }

  .primary-action::after {
    content: "";
    position: absolute;
    top: -60%;
    bottom: -60%;
    left: -30%;
    width: 34%;
    background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    transform: skewX(-20deg) translateX(-160%);
    transition: transform 0.7s ease;
    pointer-events: none;
  }

  .secondary-action {
    color: #e8dfd1;
    background: rgba(214, 184, 106, 0.06);
  }

  .primary-action:disabled,
  .secondary-action:disabled {
    border-color: var(--line);
    color: var(--ink-faint);
    background: rgba(151, 201, 227, 0.08);
    box-shadow: none;
  }

  .result-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (hover: hover) {
    .primary-action:not(:disabled):hover {
      transform: translateY(-1px);
      filter: brightness(1.06);
    }

    .primary-action:not(:disabled):hover::after {
      transform: skewX(-20deg) translateX(420%);
    }
  }

  .primary-action:not(:disabled):active,
  .secondary-action:not(:disabled):active {
    transform: translateY(1px);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }

  @media (forced-colors: active) {
    .primary-action,
    .secondary-action {
      forced-color-adjust: none;
      border-color: ButtonText;
      color: ButtonText;
      background: Canvas;
      box-shadow: none;
    }

    .primary-action:disabled,
    .secondary-action:disabled {
      border-color: GrayText;
      color: GrayText;
      background: Canvas;
    }
  }
`;

export const screenSurfaceStyles = css`
  @keyframes screen-pop {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .screen {
      animation: none !important;
    }
  }

  .screen {
    display: grid;
    gap: 9px;
    min-width: 0;
    animation: screen-pop 0.28s ease-out both;
  }

  .dashboard-header,
  .fishing-status {
    position: relative;
    overflow: hidden;
    padding: 16px 17px;
    border: 1px solid rgba(214, 184, 106, 0.24);
    border-radius: 10px;
    background:
      linear-gradient(90deg, rgba(214, 184, 106, 0.07) 0 1px, transparent 1px calc(100% - 1px), rgba(214, 184, 106, 0.07) calc(100% - 1px)),
      linear-gradient(145deg, rgba(24, 31, 24, 0.97), rgba(11, 13, 10, 0.97));
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 18px 38px rgba(0, 0, 0, 0.34);
  }

  .dashboard-header::before,
  .fishing-status::before {
    content: "";
    position: absolute;
    right: 16px;
    bottom: 12px;
    width: 32px;
    height: 32px;
    border: 1px solid rgba(214, 184, 106, 0.18);
    border-radius: 50%;
    pointer-events: none;
  }

  .dashboard-header::after,
  .fishing-status::after {
    content: "";
    position: absolute;
    right: 31px;
    bottom: 27px;
    width: 38px;
    height: 1px;
    background: rgba(214, 184, 106, 0.18);
    pointer-events: none;
  }

  .dashboard-header p {
    margin-top: 6px;
    max-width: 46ch;
    font-size: 0.8rem;
  }

  .empty-state {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(214, 184, 106, 0.19);
    border-radius: 9px;
    background: linear-gradient(145deg, rgba(19, 22, 17, 0.96), rgba(9, 10, 8, 0.98));
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
  }

  .empty-message {
    width: 100%;
    padding: 26px 20px;
    border: 1px dashed rgba(214, 184, 106, 0.34);
    border-radius: var(--radius-md);
    color: var(--ink-dim);
    background: rgba(214, 184, 106, 0.03);
    font-size: 0.85rem;
    line-height: 1.6;
    text-align: center;
  }

  .empty-state-action {
    width: min(100%, 220px);
  }

  .sort-select {
    min-height: 42px;
    padding: 8px 34px 8px 12px;
    border: 1px solid rgba(214, 184, 106, 0.34);
    border-radius: 6px;
    color: var(--ink);
    background: rgba(8, 10, 7, 0.96);
    appearance: none;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .sort-select:hover {
    border-color: rgba(214, 184, 106, 0.55);
  }

  @media (forced-colors: active) {
    .dashboard-header,
    .fishing-status,
    .empty-state,
    .sort-select {
      forced-color-adjust: none;
      border-color: ButtonText;
      color: ButtonText;
      background: Canvas;
      box-shadow: none;
    }
  }
`;
