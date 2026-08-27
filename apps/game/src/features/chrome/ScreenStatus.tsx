export interface LoadingPanelProps {
  message: string;
}

export function LoadingPanel({ message }: LoadingPanelProps) {
  return (
    <section className="fishing-status is-loading" data-testid="screen-loading" aria-live="polite">
      <span className="eyebrow">One moment</span>
      <p className="muted">{message}</p>
    </section>
  );
}

export interface RetryPanelProps {
  eyebrow: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  onBack?: () => void;
}

export function RetryPanel({ eyebrow, message, retryLabel, onRetry, onBack }: RetryPanelProps) {
  return (
    <section className="fishing-status" data-testid="retry-panel" role="alert" aria-live="assertive">
      <span className="eyebrow">{eyebrow}</span>
      <p className="muted">{message}</p>
      <div className="retry-actions">
        <button className="primary-action" type="button" onClick={onRetry}>{retryLabel}</button>
        {onBack ? <button className="secondary-action" type="button" onClick={onBack}>Back to lakes</button> : null}
      </div>
    </section>
  );
}
