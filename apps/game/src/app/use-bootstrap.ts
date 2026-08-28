import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useState } from "react";
import type {
  ActiveFishingEncounterResponse,
  AuthResponse,
  CatchDecision,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishingEncounterResponse,
  GameStateResponse,
  LeaderboardResponse,
  MeResponse,
  PlayerProfile,
  PurchaseRequest,
  PurchaseResponse,
  RecoveryResponse,
  SelectEquipmentRequest,
  SelectEquipmentResponse,
  SellCatchResponse,
  StartFishingRequest,
} from "@fishing/shared/contracts";
import { queryKeys } from "../api/query-keys";
import { appReducer, initialAppState } from "./app-reducer";

export interface BootstrapApi {
  readonly hasSession: boolean;
  getMe(signal?: AbortSignal): Promise<MeResponse>;
  authenticateWithTelegram(initData: string): Promise<AuthResponse>;
  authenticateForDevelopment(): Promise<AuthResponse>;
  getGameState(signal?: AbortSignal): Promise<GameStateResponse>;
  getActiveEncounter(signal?: AbortSignal): Promise<ActiveFishingEncounterResponse>;
  getJournal(signal?: AbortSignal): Promise<FishJournalResponse>;
  getLeaderboard(signal?: AbortSignal): Promise<LeaderboardResponse>;
  getCollection(signal?: AbortSignal): Promise<CollectionResponse>;
  completeFishing(encounterId: string, performance: number): Promise<CompleteFishingResponse>;
  decideCatch(catchId: string, decision: CatchDecision): Promise<CatchDecisionResponse>;
  purchase(input: PurchaseRequest): Promise<PurchaseResponse>;
  sellCatch(catchId: string): Promise<SellCatchResponse>;
  selectEquipment(input: SelectEquipmentRequest): Promise<SelectEquipmentResponse>;
  digForWorms(): Promise<RecoveryResponse>;
  startFishing(input: StartFishingRequest): Promise<FishingEncounterResponse>;
}

export interface BootstrapOptions {
  api: BootstrapApi;
  initData: string;
  isDevelopment: boolean;
}

export interface BootstrapState {
  phase: "booting" | "ready" | "recoverable-error";
  player?: PlayerProfile;
  gameState?: GameStateResponse;
  activeEncounter?: ActiveFishingEncounterResponse;
  error?: Error;
  retry(): void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unable to connect to the fishing service.");
}

async function authenticate(api: BootstrapApi, initData: string, isDevelopment: boolean, signal: AbortSignal): Promise<PlayerProfile> {
  if (api.hasSession) return (await api.getMe(signal)).player;
  if (initData) return (await api.authenticateWithTelegram(initData)).player;
  if (isDevelopment) return (await api.authenticateForDevelopment()).player;
  throw new Error("Open this game from Telegram to sign in.");
}

export function useBootstrap({ api, initData, isDevelopment }: BootstrapOptions): BootstrapState {
  const [appState, dispatch] = useReducer(appReducer, initialAppState);
  const [attempt, setAttempt] = useState(0);
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [player, setPlayer] = useState<PlayerProfile>();
  const [authError, setAuthError] = useState<Error>();

  const authenticateForAttempt = useCallback(
    async (signal: AbortSignal): Promise<PlayerProfile> => authenticate(api, initData, isDevelopment, signal),
    [api, initData, isDevelopment],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setAuthStatus("loading");
    setAuthError(undefined);
    setPlayer(undefined);

    void authenticateForAttempt(controller.signal)
      .then((nextPlayer) => {
        if (!active || controller.signal.aborted) return;
        setPlayer(nextPlayer);
        setAuthStatus("success");
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(error)) return;
        setAuthError(asError(error));
        setAuthStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, authenticateForAttempt]);

  const gameStateQuery = useQuery({
    queryKey: queryKeys.gameState,
    queryFn: ({ signal }) => api.getGameState(signal),
    enabled: authStatus === "success",
  });
  const activeEncounterQuery = useQuery({
    queryKey: queryKeys.activeEncounter,
    queryFn: ({ signal }) => api.getActiveEncounter(signal),
    enabled: authStatus === "success",
  });

  const queryError = authStatus === "success" ? gameStateQuery.error ?? activeEncounterQuery.error : undefined;
  const error = authError ?? (queryError ? asError(queryError) : undefined);
  const ready = authStatus === "success" && gameStateQuery.isSuccess && activeEncounterQuery.isSuccess;

  useEffect(() => {
    if (appState.phase === "booting" && ready) {
      dispatch({ type: "BOOT_SUCCEEDED" });
      return;
    }
    if (appState.phase === "booting" && error) {
      dispatch({ type: "BOOT_FAILED", message: error.message });
    }
  }, [appState.phase, error, ready]);

  const retry = useCallback(() => {
    dispatch({ type: "BOOT_RETRY" });
    setAuthStatus("idle");
    setAuthError(undefined);
    setPlayer(undefined);
    setAttempt((current) => current + 1);
  }, []);

  return {
    phase: appState.phase,
    player,
    gameState: gameStateQuery.data,
    activeEncounter: activeEncounterQuery.data,
    error,
    retry,
  };
}
