import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import type { ScreenId } from "./app-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactAppServices } from "./react-services";
import { useBootstrap, type BootstrapState } from "./use-bootstrap";
import { useScreenNavigation } from "./use-screen-navigation";
import { GameTabbar } from "../features/chrome/GameTabbar";
import { GameTopbar } from "../features/chrome/GameTopbar";
import { LoadingPanel, RetryPanel } from "../features/chrome/ScreenStatus";
import { StatusToast } from "../features/chrome/StatusToast";
import { FriendsRoute } from "../features/friends/FriendsRoute";
import { JournalRoute } from "../features/journal/JournalRoute";
import { CollectionRoute } from "../features/collection/CollectionRoute";
import { ShopRoute } from "../features/shop/ShopRoute";
import { LakesScreen } from "../features/lakes/LakesScreen";
import { CatchResult, DecisionResult } from "../features/encounter/CatchResult";
import { useEncounter } from "../features/encounter/use-encounter";
import type { ShopCategory } from "../ui/types";

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

interface ScreenRouterProps {
  screen: ScreenId;
  api: ReactAppServices["api"];
  gameState: NonNullable<BootstrapState["gameState"]>;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
  onShare: () => void;
  onGoFishing: () => void;
  shopCategory: ShopCategory;
  onOpenShop: (category: ShopCategory) => void;
  onEncounterStarted: (encounter: FishingEncounterResponse) => void;
  onEncounterStartRequested: () => void;
  onEncounterStartFailed: (message: string) => void;
}

function ScreenRouter({ screen, api, gameState, navigationRequestId, onLoaded, onFailed, onShare, onGoFishing, shopCategory, onOpenShop, onEncounterStarted, onEncounterStartRequested, onEncounterStartFailed }: ScreenRouterProps) {
  if (screen === "friends") {
    return <FriendsRoute api={api} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} onShare={onShare} onGoFishing={onGoFishing} />;
  }
  if (screen === "journal") {
    return <JournalRoute api={api} state={gameState} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} onGoFishing={onGoFishing} />;
  }
  if (screen === "shop") {
    return <ShopRoute api={api} initialCategory={shopCategory} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} />;
  }
  if (screen === "collection") {
    return <CollectionRoute api={api} navigationRequestId={navigationRequestId} onLoaded={onLoaded} onFailed={onFailed} onGoFishing={onGoFishing} />;
  }
  return <LakesScreen state={gameState} api={api} onOpenShop={onOpenShop} onEncounterStarted={onEncounterStarted} onEncounterStartRequested={onEncounterStartRequested} onEncounterStartFailed={onEncounterStartFailed} />;
}

export function App({ services }: AppProps) {
  const bootstrap = useBootstrap({
    api: services.api,
    initData: services.telegram.initData,
    isDevelopment: services.isDevelopment,
  });
  const navigation = useScreenNavigation(bootstrap.phase === "ready");
  const encounter = useEncounter({
    api: services.api,
    runtime: services.runtime,
    bootstrapPhase: bootstrap.phase,
    bootstrapError: bootstrap.error,
    activeEncounter: bootstrap.activeEncounter,
    isDevelopment: services.isDevelopment,
    telegramAvailable: services.telegram.isAvailable,
  });
  const [status, setStatus] = useState<StatusSnapshot>();
  const [shopCategory, setShopCategory] = useState<ShopCategory>("bait");
  const leavingEncounterRef = useRef(false);

  useEffect(() => {
    services.telegram.initialize();
    services.telegram.syncViewportInsets();
    return () => services.telegram.dispose();
  }, [services.telegram]);

  useEffect(() => () => services.runtime.destroy(), [services.runtime]);

  useEffect(() => () => {
    document.body.classList.remove("is-fighting");
  }, []);

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(undefined), status.state === "loading" ? 15_000 : 3_200);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const navigate = useCallback((screen: ScreenId) => {
    const phase = encounter.state.phase;
    const resultOwned = phase === "result" || phase === "decision-result" || (phase === "recoverable-error" && (encounter.state.error?.operation === "completion" || encounter.state.error?.operation === "decision"));
    const activeOwned = phase === "starting" || phase === "fighting" || phase === "resolving" || phase === "deciding";
    if (activeOwned) return;
    if (resultOwned) {
      if (leavingEncounterRef.current) return;
      leavingEncounterRef.current = true;
      void encounter.returnToLakes().then(() => {
        leavingEncounterRef.current = false;
        setStatus(undefined);
        navigation.navigate(screen);
      });
      return;
    }
    setStatus(undefined);
    navigation.navigate(screen);
  }, [encounter.returnToLakes, encounter.state.error?.operation, encounter.state.phase, navigation.navigate]);

  const goFishing = useCallback(() => navigate("lakes"), [navigate]);

  const openShop = useCallback((category: ShopCategory) => {
    setShopCategory(category);
    navigate("shop");
  }, [navigate]);

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
  const encounterStatus = encounter.status;
  const displayStatus = encounterStatus ?? status;
  const hasToast = Boolean(displayStatus?.message);
  const encounterBusy = encounter.state.phase === "starting" || encounter.state.phase === "fighting" || encounter.state.phase === "resolving" || encounter.state.phase === "deciding";
  const navEnabled = !encounterBusy && (navigation.state.phase === "ready" || Boolean(navigationError));
  const encounterView = encounter.state.phase === "resolving" || encounter.state.phase === "result" || encounter.state.phase === "deciding" || encounter.state.phase === "decision-result" || (encounter.state.phase === "recoverable-error" && (encounter.state.error?.operation === "completion" || encounter.state.error?.operation === "decision"));
  const encounterContent = encounter.state.phase === "result" || encounter.state.phase === "deciding"
    ? encounter.state.result
      ? <CatchResult result={encounter.state.result} gameState={bootstrap.gameState} actionPending={encounter.state.phase === "deciding"} onDecision={encounter.chooseDecision} onBack={() => navigate("lakes")} />
      : null
    : encounter.state.phase === "decision-result" && encounter.state.decision
      ? <DecisionResult decision={encounter.state.decision} onBack={() => navigate("lakes")} />
      : encounter.state.phase === "resolving"
        ? <LoadingPanel message="Checking the catch…" />
        : encounter.state.phase === "recoverable-error" && encounter.state.error?.operation === "completion"
          ? <RetryPanel eyebrow="Rough connection" message={`${encounter.state.error.message} Your catch is still waiting on the line — nothing is lost.`} retryLabel="Retry catch resolution" actionPending={encounter.status?.state === "loading"} onRetry={encounter.retry} onBack={() => navigate("lakes")} />
          : encounter.state.phase === "recoverable-error" && encounter.state.error?.operation === "decision"
            ? <RetryPanel eyebrow="Catch choice not saved" message={`${encounter.state.error.message} Your catch is still waiting for a Keep or Sell choice.`} retryLabel="Retry choice" actionPending={encounter.status?.state === "loading"} onRetry={encounter.retry} onBack={() => navigate("lakes")} />
            : null;

  return (
    <div className="react-app-shell" data-testid="react-app-shell">
      <div className="app-frame" data-testid="app-frame" data-toast-visible={String(hasToast)} data-view={encounterView ? "catch" : "screen"}>
        <GameTopbar coins={bootstrap.gameState.coins} disabled={!navEnabled} onShop={() => openShop("bait")} />
        <main className="app-content" data-testid="app-content" aria-busy={isNavigationLoading || encounter.state.phase === "resolving" || encounter.state.phase === "deciding"} data-pending={String(isNavigationLoading)} data-view={encounterView ? "catch" : "screen"}>
          {encounterView ? encounterContent : navigationError ? (
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
              shopCategory={shopCategory}
              onOpenShop={openShop}
              onEncounterStarted={encounter.startSucceeded}
              onEncounterStartRequested={encounter.requestStart}
              onEncounterStartFailed={encounter.startFailed}
            />
          )}
        </main>
        <GameTabbar activeScreen={navigation.state.screen} navEnabled={navEnabled} pendingNavigation={isNavigationLoading ? navigation.state.navigation.target : undefined} onNavigate={navigate} />
        <StatusToast message={displayStatus?.message} state={displayStatus?.state} />
      </div>
    </div>
  );
}
