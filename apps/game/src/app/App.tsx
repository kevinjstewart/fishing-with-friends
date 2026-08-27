import { useEffect } from "react";
import type { ReactAppServices } from "./react-services";
import { useBootstrap, type BootstrapState } from "./use-bootstrap";

export interface AppProps {
  services: ReactAppServices;
}

function BootstrapContent({ bootstrap }: { bootstrap: BootstrapState }) {
  if (bootstrap.phase === "recoverable-error") {
    return (
      <section className="react-bootstrap-panel" data-testid="react-bootstrap-error" role="alert">
        <span className="eyebrow">Connection paused</span>
        <h1>Could not connect</h1>
        <p className="react-bootstrap-copy">{bootstrap.error?.message ?? "The fishing service is unavailable."}</p>
        <button className="react-bootstrap-action" type="button" onClick={bootstrap.retry}>
          Try again
        </button>
      </section>
    );
  }

  if (bootstrap.phase === "ready" && bootstrap.player && bootstrap.gameState && bootstrap.activeEncounter) {
    const encounterStatus = bootstrap.activeEncounter.expired
      ? "Expired encounter reported"
      : bootstrap.activeEncounter.encounter
        ? "Active encounter available"
        : "No active encounter";
    return (
      <section className="react-bootstrap-panel" data-testid="react-bootstrap-success" aria-live="polite">
        <span className="eyebrow">Authenticated success</span>
        <h1>React shell connected</h1>
        <p className="react-bootstrap-copy">Signed in as {bootstrap.player.displayName}.</p>
        <dl className="react-bootstrap-facts">
          <div>
            <dt>Wallet</dt>
            <dd>{bootstrap.gameState.coins.toLocaleString()} coins</dd>
          </div>
          <div>
            <dt>Encounter check</dt>
            <dd>{encounterStatus}</dd>
          </div>
        </dl>
        <p className="react-bootstrap-note">Feature screens remain on the Lit production entry during this migration phase.</p>
      </section>
    );
  }

  return (
    <section className="react-bootstrap-panel is-loading" data-testid="react-bootstrap-loading" aria-live="polite">
      <span className="eyebrow">One moment</span>
      <h1>Connecting to the lake…</h1>
      <p className="react-bootstrap-copy">Checking authentication, game state, and active encounter.</p>
      <span className="react-bootstrap-spinner" aria-hidden="true" />
    </section>
  );
}

export function App({ services }: AppProps) {
  const bootstrap = useBootstrap({
    api: services.api,
    initData: services.telegram.initData,
    isDevelopment: services.isDevelopment,
  });

  useEffect(() => {
    services.telegram.initialize();
    services.telegram.syncViewportInsets();
    return () => services.telegram.dispose();
  }, [services.telegram]);

  useEffect(() => {
    const runtime = services.runtime;
    const removeCompleteListener = runtime.onComplete(() => {});
    const removeAmbientListener = runtime.onAmbient(() => {});
    return () => {
      removeCompleteListener();
      removeAmbientListener();
      runtime.destroy();
    };
  }, [services.runtime]);

  return (
    <div className="react-scaffold" data-testid="react-scaffold">
      <header className="react-scaffold-header">
        <span className="react-scaffold-mark" aria-hidden="true">FWF</span>
        <div>
          <p className="react-scaffold-kicker">Fishing with Friends</p>
          <p className="react-scaffold-subtitle">React migration scaffold</p>
        </div>
      </header>
      <main className="react-scaffold-content" aria-busy={bootstrap.phase === "booting"}>
        <BootstrapContent bootstrap={bootstrap} />
      </main>
    </div>
  );
}
