import type { ScreenId } from "./app-types";
import { useCallback, useEffect, useState } from "react";
import type { ReactAppServices } from "./react-services";
import { useBootstrap, type BootstrapState } from "./use-bootstrap";
import { useScreenNavigation } from "./use-screen-navigation";
import { GameTabbar } from "../features/chrome/GameTabbar";
import { GameTopbar } from "../features/chrome/GameTopbar";
import { RetryPanel } from "../features/chrome/ScreenStatus";
import { StatusToast } from "../features/chrome/StatusToast";
import { FriendsRoute } from "../features/friends/FriendsRoute";
import { JournalRoute } from "../features/journal/JournalRoute";

export interface AppProps {
  services: ReactAppServices;
}

interface StatusSnapshot {
  message: string;
  state: "loading" | "ready" | "error";
}

function BootstrapContent({ bootstrap }: { bootstrap: BootstrapState }) {
  if (bootstrap.phase === "recoverable-error") {
    return (
      <section className="react-bootstrap-panel" data-testid="react-bootstrap-error" role="alert">
        <span className="eyebrow">Connection paused</span>
        <h1>Could not connect</h1>
        <p className="react-bootstrap-copy">{bootstrap.error?.message ?? "The fishing service is unavailable."}</p>
        <button className="react-bootstrap-action" type="button" onClick={bootstrap.retry}>Try again</button>
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

function UnmigratedScreen({ screen }: { screen: Exclude<ScreenId, "friends" | "journal"> }) {
  const heading = screen === "lakes" ? "Lakes" : screen === "shop" ? "Tackle shop" : "Your collection";
  return (
    <section className="screen migration-placeholder" data-testid={`${screen}-screen`}>
      <div className="dashboard-header">
        <div><span className="eyebrow">React migration</span><h1>{heading}</h1></div>
        <p className="muted">This read-only shell is ready. {heading} controls remain on the production entry until their migration phase.</p>
      </div>
    </section>
  );
}

interface ScreenRouterProps {
  screen: ScreenId;
  api: ReactAppServices["api"];
  gameState: NonNullable<BootstrapState["gameState"]>;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
  onShare: () => void;
  onGoFishing: () => void;
}

function ScreenRouter({ screen, api, gameState, navigationRequestId, onLoaded, onFailed, onShare, onGoFishing }: ScreenRouterProps) {
  if (screen === "friends") {
    return <FriendsRoute api={api} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} onShare={onShare} onGoFishing={onGoFishing} />;
  }
  if (screen === "journal") {
    return <JournalRoute api={api} state={gameState} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} onGoFishing={onGoFishing} />;
  }
  return <UnmigratedScreen screen={screen} />;
}

export function App({ services }: AppProps) {
  const bootstrap = useBootstrap({
    api: services.api,
    initData: services.telegram.initData,
    isDevelopment: services.isDevelopment,
  });
  const navigation = useScreenNavigation(bootstrap.phase === "ready");
  const [status, setStatus] = useState<StatusSnapshot>();

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

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(undefined), status.state === "loading" ? 15_000 : 3_200);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const navigate = useCallback((screen: ScreenId) => {
    setStatus(undefined);
    navigation.navigate(screen);
  }, [navigation.navigate]);

  const goFishing = useCallback(() => navigate("lakes"), [navigate]);

  const shareInvite = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    const url = `${window.location.origin}${window.location.pathname}`;
    const text = "Cast a line with me in Fishing with Friends!";
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return;
    }
    const fallback = (): void => {
      if (webApp?.openLink) webApp.openLink(url);
      else setStatus({ message: "Copy failed. Share the app link.", state: "error" });
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    void navigator.clipboard.writeText(`${text} ${url}`).then(
      () => setStatus({ message: "Invite copied", state: "ready" }),
      fallback,
    );
  }, []);

  if (bootstrap.phase !== "ready" || !bootstrap.gameState) {
    return (
      <div className="react-scaffold" data-testid="react-scaffold">
        <header className="react-scaffold-header">
          <span className="react-scaffold-mark" aria-hidden="true">FWF</span>
          <div><p className="react-scaffold-kicker">Fishing with Friends</p><p className="react-scaffold-subtitle">React migration entry</p></div>
        </header>
        <main className="react-scaffold-content" aria-busy={bootstrap.phase === "booting"}><BootstrapContent bootstrap={bootstrap} /></main>
      </div>
    );
  }

  const navigationError = navigation.state.error?.operation === "navigation" ? navigation.state.error : undefined;
  const isNavigationLoading = navigation.state.navigation.status === "loading";
  const renderedScreen = isNavigationLoading ? navigation.state.navigation.target ?? navigation.state.screen : navigation.state.screen;
  const requestId = navigation.state.navigation.requestId;
  const hasToast = Boolean(status?.message);
  const navEnabled = navigation.state.phase === "ready" || Boolean(navigationError);

  return (
    <div className="react-app-shell" data-testid="react-app-shell">
      <div className="app-frame" data-testid="app-frame" data-toast-visible={String(hasToast)} data-view="screen">
        <GameTopbar coins={bootstrap.gameState.coins} disabled={!navEnabled} onShop={() => navigate("shop")} />
        <main className="app-content" data-testid="app-content" aria-busy={isNavigationLoading} data-pending={String(isNavigationLoading)} data-view="screen">
          {navigationError ? (
            <RetryPanel
              eyebrow="Could not load that screen"
              message={navigationError.message}
              retryLabel="Try again"
              onRetry={navigation.retry}
              onBack={navigationError.target === "lakes" ? undefined : goFishing}
            />
          ) : (
            <ScreenRouter
              screen={renderedScreen}
              api={services.api}
              gameState={bootstrap.gameState}
              navigationRequestId={requestId}
              onLoaded={(nextRequestId) => navigation.markLoaded(renderedScreen, nextRequestId)}
              onFailed={(nextRequestId, message) => navigation.markFailed(renderedScreen, nextRequestId, message)}
              onShare={shareInvite}
              onGoFishing={goFishing}
            />
          )}
        </main>
        <GameTabbar activeScreen={navigation.state.screen} navEnabled={navEnabled} pendingNavigation={isNavigationLoading ? navigation.state.navigation.target : undefined} onNavigate={navigate} />
        <StatusToast message={status?.message} state={status?.state} />
      </div>
    </div>
  );
}
