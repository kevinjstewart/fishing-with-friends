import type { LeaderboardResponse } from "@fishing/shared/contracts";
import { LitElement, html, css } from "lit";
import { icon } from "../icons";
import { emitUiEvent } from "../types";
import { formatWeight } from "../presenters";
import { uiFoundationStyles, screenSurfaceStyles } from "../component-styles";

export class FriendsScreenElement extends LitElement {
  static properties = {
    leaderboard: { attribute: false },
    actionPending: { type: Boolean },
  };

  static styles = [
    uiFoundationStyles,
    screenSurfaceStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .screen {
        gap: 14px;
      }

      .invite-action {
        width: 100%;
        min-height: 50px;
      }

      .crew-board {
        display: grid;
        margin: 0;
        padding: 6px;
        list-style: none;
        border: 1px solid rgba(214, 184, 106, 0.19);
        border-radius: 9px;
        background: linear-gradient(145deg, rgba(19, 22, 17, 0.96), rgba(9, 10, 8, 0.98));
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
      }

      .crew-self {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 4px 12px;
        padding: 12px 14px;
        border: 1px solid rgba(214, 184, 106, 0.32);
        border-radius: 9px;
        background: rgba(214, 184, 106, 0.055);
      }

      .crew-self-copy {
        display: grid;
        min-width: 0;
      }

      .crew-self-copy .eyebrow {
        margin-bottom: 1px;
      }

      .crew-self-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .crew-self-rank {
        color: var(--gold);
        font-family: var(--font-display);
        font-size: 1.15rem;
      }

      .crew-self > .muted {
        grid-column: 1 / -1;
        font-size: 0.74rem;
      }

      .crew-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 52px;
        padding: 7px 10px;
      }

      .crew-row + .crew-row {
        border-top: 1px solid rgba(214, 184, 106, 0.09);
      }

      .crew-row.is-self {
        border-radius: 6px;
        background: rgba(214, 184, 106, 0.055);
        box-shadow: inset 2px 0 var(--gold);
      }

      .crew-rank {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        color: var(--ink-faint);
        background: rgba(214, 184, 106, 0.08);
        font-size: 0.78rem;
        font-weight: 650;
      }

      .crew-row.is-leader .crew-rank {
        color: #15120a;
        background: linear-gradient(135deg, #e1c97f, #ad8d3e);
      }

      .crew-name {
        display: grid;
        min-width: 0;
        font-weight: 700;
      }

      .crew-name small {
        overflow: hidden;
        color: var(--ink-dim);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .crew-you {
        width: fit-content;
        margin-top: 1px;
        padding: 1px 6px;
        border-radius: 2px;
        color: #15120a;
        background: var(--gold);
        font-size: 0.56rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      @media (forced-colors: active) {
        .crew-board,
        .crew-self {
          forced-color-adjust: none;
          border-color: ButtonText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ];

  declare leaderboard?: LeaderboardResponse;
  declare actionPending: boolean;

  constructor() {
    super();
    this.actionPending = false;
  }

  render() {
    const board = this.leaderboard;
    if (!board) return html``;
    const viewer = board.viewer;
    return html`
      <section class="screen friends-screen" data-testid="friends-screen">
        <div class="dashboard-header" title=${board.metricDescription || "Ranked by kept fish. Sold fish do not count."}><div><span class="eyebrow">Your crew</span><h1>Catch board</h1></div><p class="sr-only">Ranked by kept fish. Sold fish do not count.</p></div>
        <button class="primary-action invite-action" type="button" ?disabled=${this.actionPending} @click=${() => emitUiEvent(this, "ui:share", undefined)}>${icon("friend")}<span>Invite crew</span></button>
        ${viewer
          ? html`<aside class="crew-self"><div class="crew-self-copy"><span class="eyebrow">Your standing</span><strong class="crew-self-name">${viewer.displayName === "You" ? "You" : `${viewer.displayName} · You`}</strong></div><strong class="crew-self-rank">${viewer.rank === null ? "Unranked" : `#${viewer.rank}`}</strong><span class="muted">${viewer.rank === null ? "Keep one to rank" : `${viewer.keptFishCount} kept · ${formatWeight(viewer.heaviestKeptFishKg)} best`}</span></aside>`
          : null}
        ${board.entries.length === 0
          ? html`<div class="empty-state"><p class="empty-message">No kept fish on the board yet. Keep your next catch to claim the first spot.</p><button class="primary-action empty-state-action" type="button" @click=${() => emitUiEvent(this, "ui:go-fishing", undefined)}>${icon("waves")}<span>Go fishing</span></button></div>`
          : html`<ol class="crew-board">${board.entries.slice(0, 10).map((entry) => { const isViewer = Boolean(viewer && entry.playerId === viewer.playerId); return html`<li class="crew-row ${entry.rank === 1 ? "is-leader" : ""} ${isViewer ? "is-self" : ""}"><span class="crew-rank">${entry.rank}</span><div class="crew-name">${entry.displayName}${isViewer ? html`<span class="crew-you">You</span>` : null}<small class="muted">${entry.keptFishCount} kept · ${formatWeight(entry.heaviestKeptFishKg)} heaviest</small></div></li>`; })}</ol>`}
      </section>
    `;
  }
}

customElements.define("friends-screen", FriendsScreenElement);
