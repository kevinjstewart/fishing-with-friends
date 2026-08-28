import type { LeaderboardResponse } from "@fishing/shared/contracts";
import { Icon } from "../../shared-ui/icons";
import { formatWeight } from "../../shared-ui/presenters";

export interface FriendsScreenProps {
  leaderboard: LeaderboardResponse;
  actionPending?: boolean;
  onShare: () => void;
  onGoFishing: () => void;
}

export function FriendsScreen({ leaderboard, actionPending = false, onShare, onGoFishing }: FriendsScreenProps) {
  const viewer = leaderboard.viewer;
  return (
    <section className="screen friends-screen" data-testid="friends-screen">
      <div className="dashboard-header" title={leaderboard.metricDescription || "Ranked by kept fish. Sold fish do not count."}>
        <div><span className="eyebrow">Your crew</span><h1>Catch board</h1></div>
        <p className="sr-only">Ranked by kept fish. Sold fish do not count.</p>
      </div>
      <button className="primary-action invite-action" type="button" disabled={actionPending} onClick={onShare}>
        <Icon name="friend" /><span>Invite crew</span>
      </button>
      {viewer ? (
        <aside className="crew-self">
          <div className="crew-self-copy"><span className="eyebrow">Your standing</span><strong className="crew-self-name">{viewer.displayName === "You" ? "You" : `${viewer.displayName} · You`}</strong></div>
          <strong className="crew-self-rank">{viewer.rank === null ? "Unranked" : `#${viewer.rank}`}</strong>
          <span className="muted">{viewer.rank === null ? "Keep one to rank" : `${viewer.keptFishCount} kept · ${formatWeight(viewer.heaviestKeptFishKg)} best`}</span>
        </aside>
      ) : null}
      {leaderboard.entries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-message">No kept fish on the board yet. Keep your next catch to claim the first spot.</p>
          <button className="primary-action empty-state-action" type="button" disabled={actionPending} onClick={onGoFishing}><Icon name="waves" /><span>Go fishing</span></button>
        </div>
      ) : (
        <ol className="crew-board">
          {leaderboard.entries.slice(0, 10).map((entry) => {
            const isViewer = Boolean(viewer && entry.playerId === viewer.playerId);
            return (
              <li key={entry.playerId} className={`crew-row ${entry.rank === 1 ? "is-leader" : ""} ${isViewer ? "is-self" : ""}`}>
                <span className="crew-rank">{entry.rank}</span>
                <div className="crew-name">
                  {entry.displayName}
                  {isViewer ? <span className="crew-you">You</span> : null}
                  <small className="muted">{entry.keptFishCount} kept · {formatWeight(entry.heaviestKeptFishKg)} heaviest</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
