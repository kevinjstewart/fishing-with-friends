import { useQueryClient } from "@tanstack/react-query";
import type {
  ActiveFishingEncounterResponse,
  CatchDecision,
  FishingEncounterResponse,
} from "@fishing/shared/contracts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { FishingRuntime } from "../../game/phaser-runtime";
import { ApiClientError } from "../../api/client";
import { createMutationLock, type MutationLock } from "../../api/mutation-lock";
import { queryKeys } from "../../api/query-keys";
import type { BootstrapApi, BootstrapState } from "../../app/use-bootstrap";
import {
  clearEncounterRecovery,
  readEncounterRecovery,
  writeEncounterDecision,
  writeEncounterRecovery,
  type EncounterRecoverySnapshot,
} from "./encounter-persistence";
import { encounterReducer, initialEncounterState, type EncounterState } from "./encounter-reducer";

export interface EncounterStatus {
  message: string;
  state: "loading" | "ready" | "error";
}

export interface UseEncounterOptions {
  api: BootstrapApi;
  runtime: FishingRuntime;
  bootstrapPhase: BootstrapState["phase"];
  bootstrapError?: Error;
  activeEncounter?: ActiveFishingEncounterResponse;
  isDevelopment: boolean;
  telegramAvailable: boolean;
}

export interface EncounterController {
  state: EncounterState;
  status?: EncounterStatus;
  requestStart(): void;
  startSucceeded(encounter: FishingEncounterResponse, message?: string): void;
  startFailed(message: string): void;
  chooseDecision(decision: CatchDecision): void;
  retry(): void;
  returnToLakes(): Promise<void>;
}

interface ReconciledReads {
  active?: ActiveFishingEncounterResponse;
  activeError?: unknown;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiClientError ? error.status : typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
}

function alreadyResolved(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 404 || status === 409;
}

/**
 * Owns the encounter lifecycle. Phaser only reports gameplay events; the
 * reducer and Worker responses decide which DOM state is allowed to render.
 */
export function useEncounter({ api, runtime, bootstrapPhase, bootstrapError, activeEncounter, isDevelopment, telegramAvailable }: UseEncounterOptions): EncounterController {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(encounterReducer, initialEncounterState);
  const [status, setStatus] = useState<EncounterStatus>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(true);
  const sessionRef = useRef(0);
  const activeRuntimeEncounterId = useRef<string | undefined>(undefined);
  const ambientGateRef = useRef<{ encounterId: string; session: number } | undefined>(undefined);
  const ambientEncounterRef = useRef<{ encounterId: string; session: number } | undefined>(undefined);
  const recoverySnapshotRef = useRef<EncounterRecoverySnapshot | undefined>(undefined);
  const completionLockRef = useRef<MutationLock>(createMutationLock());
  const decisionLockRef = useRef<MutationLock>(createMutationLock());

  const reconcileReads = useCallback(async (): Promise<ReconciledReads> => {
    const [gameState, active, journal, leaderboard, collection] = await Promise.allSettled([
      api.getGameState(),
      api.getActiveEncounter(),
      api.getJournal(),
      api.getLeaderboard(),
      api.getCollection(),
    ]);
    if (gameState.status === "fulfilled") queryClient.setQueryData(queryKeys.gameState, gameState.value);
    if (active.status === "fulfilled") queryClient.setQueryData(queryKeys.activeEncounter, active.value);
    if (journal.status === "fulfilled") queryClient.setQueryData(queryKeys.journal, journal.value);
    if (leaderboard.status === "fulfilled") queryClient.setQueryData(queryKeys.leaderboard, leaderboard.value);
    if (collection.status === "fulfilled") queryClient.setQueryData(queryKeys.collection, collection.value);
    return {
      active: active.status === "fulfilled" ? active.value : undefined,
      activeError: active.status === "rejected" ? active.reason : undefined,
    };
  }, [api, queryClient]);

  const setEncounterStatus = useCallback((message: string, nextState: EncounterStatus["state"]): void => {
    if (mountedRef.current) setStatus({ message, state: nextState });
  }, []);

  const activateRuntimeEncounter = useCallback((encounter: FishingEncounterResponse, message: string): void => {
    if (!mountedRef.current) return;
    if (activeRuntimeEncounterId.current === encounter.encounterId && document.body.classList.contains("is-fighting")) return;
    activeRuntimeEncounterId.current = encounter.encounterId;
    document.body.classList.add("is-fighting");
    setEncounterStatus(message, "ready");
    runtime.startFight(encounter);
  }, [runtime, setEncounterStatus]);

  const runCompletionRequest = useCallback((event: { encounterId: string; performance: number }, retrying: boolean): void => {
    const current = stateRef.current;
    const expectedPhase = retrying ? "resolving" : "fighting";
    if (current.phase !== expectedPhase || current.encounter?.encounterId !== event.encounterId) return;
    if (!completionLockRef.current.tryAcquire()) return;

    const encounter = current.encounter;
    if (!encounter) {
      completionLockRef.current.release();
      return;
    }
    const session = sessionRef.current;
    ambientGateRef.current = { encounterId: event.encounterId, session };
    if (!retrying) dispatch({ type: "COMPLETE_REQUESTED", encounterId: event.encounterId, performance: event.performance });
    const ambientAlreadySeen = ambientEncounterRef.current?.encounterId === event.encounterId && ambientEncounterRef.current.session === session;
    if (ambientAlreadySeen) {
      window.setTimeout(() => {
        if (!mountedRef.current || session !== sessionRef.current) return;
        setStatus(undefined);
        dispatch({ type: "PHASER_AMBIENT", encounterId: event.encounterId });
      }, 0);
    }
    if (ambientAlreadySeen) setStatus(undefined);
    else setEncounterStatus("Checking the catch…", "loading");

    void (async () => {
      try {
        const result = await api.completeFishing(event.encounterId, event.performance);
        if (!mountedRef.current || session !== sessionRef.current) return;
        const snapshot = { encounter, result } satisfies EncounterRecoverySnapshot;
        recoverySnapshotRef.current = snapshot;
        writeEncounterRecovery(snapshot);
        await reconcileReads();
        if (!mountedRef.current || session !== sessionRef.current) return;
        dispatch({ type: "COMPLETE_SUCCEEDED", encounterId: event.encounterId, result });
      } catch (error) {
        if (!mountedRef.current || session !== sessionRef.current) return;
        const reconciled = await reconcileReads();
        if (!mountedRef.current || session !== sessionRef.current) return;
        ambientGateRef.current = undefined;
        if (reconciled.active?.encounter) {
          recoverySnapshotRef.current = undefined;
          clearEncounterRecovery();
          activeRuntimeEncounterId.current = undefined;
          ambientEncounterRef.current = undefined;
          dispatch({ type: "ACTIVE_ENCOUNTER_RECONCILED_LIVE", encounter: reconciled.active.encounter });
          activateRuntimeEncounter(reconciled.active.encounter, "Your encounter is still live. Fish on…");
          return;
        }
        if (reconciled.active?.expired || alreadyResolved(error)) {
          clearEncounterRecovery();
          dispatch({ type: "RETURN_TO_LOBBY" });
          activeRuntimeEncounterId.current = undefined;
          ambientEncounterRef.current = undefined;
          document.body.classList.remove("is-fighting");
          setEncounterStatus(reconciled.active?.expired ? "That fishing attempt expired. Your tackle is ready for a new cast." : "That fishing attempt was already resolved.", "error");
          return;
        }
        document.body.classList.remove("is-fighting");
        setStatus(undefined);
        dispatch({ type: "COMPLETE_FAILED", encounterId: event.encounterId, message: errorMessage(error, "The catch could not be confirmed.") });
      } finally {
        completionLockRef.current.release();
      }
    })();
  }, [activateRuntimeEncounter, api, reconcileReads, setEncounterStatus]);

  const runDecisionRequest = useCallback((catchId: string, decision: CatchDecision, retrying: boolean): void => {
    const current = stateRef.current;
    const expectedPhase = retrying ? "deciding" : "result";
    if (current.phase !== expectedPhase || current.result?.catch?.id !== catchId) return;
    if (!decisionLockRef.current.tryAcquire()) return;
    const encounter = current.encounter;
    const result = current.result;
    if (!encounter || !result?.catch) {
      decisionLockRef.current.release();
      return;
    }
    const session = sessionRef.current;
    if (!retrying) dispatch({ type: "DECISION_REQUESTED", decision });
    setEncounterStatus(decision === "sell" ? "Selling the fish…" : "Recording the fish…", "loading");

    void (async () => {
      try {
        const decisionResult = await api.decideCatch(catchId, decision);
        if (!mountedRef.current || session !== sessionRef.current) return;
        const snapshot = recoverySnapshotRef.current ?? readEncounterRecovery() ?? { encounter, result };
        recoverySnapshotRef.current = { ...snapshot, encounter, result };
        writeEncounterDecision(recoverySnapshotRef.current, decisionResult);
        await reconcileReads();
        if (!mountedRef.current || session !== sessionRef.current) return;
        dispatch({ type: "DECISION_SUCCEEDED", catchId, result: decisionResult });
        setEncounterStatus(decision === "sell" ? "Fish sold" : "Fish kept", "ready");
      } catch (error) {
        if (!mountedRef.current || session !== sessionRef.current) return;
        const reconciled = await reconcileReads();
        if (!mountedRef.current || session !== sessionRef.current) return;
        if (reconciled.active?.expired || alreadyResolved(error)) {
          clearEncounterRecovery();
          dispatch({ type: "RETURN_TO_LOBBY" });
          activeRuntimeEncounterId.current = undefined;
          document.body.classList.remove("is-fighting");
          setEncounterStatus("That catch was already recorded.", "error");
          return;
        }
        setStatus(undefined);
        dispatch({ type: "DECISION_FAILED", catchId, message: errorMessage(error, "The catch choice could not be saved.") });
      } finally {
        decisionLockRef.current.release();
      }
    })();
  }, [api, reconcileReads, setEncounterStatus]);

  useEffect(() => {
    mountedRef.current = true;
    const removeCompleteListener = runtime.onComplete((event) => {
      const current = stateRef.current;
      if (current.phase !== "fighting" || current.encounter?.encounterId !== event.encounterId) return;
      runCompletionRequest(event, false);
    });
    const removeAmbientListener = runtime.onAmbient((encounterId) => {
      const gate = ambientGateRef.current;
      const current = stateRef.current;
      if (encounterId && current.phase === "recoverable-error" && current.error?.operation === "completion" && current.encounter?.encounterId === encounterId) {
        document.body.classList.remove("is-fighting");
      }
      if (!encounterId || current.encounter?.encounterId !== encounterId) return;
      if (current.phase === "resolving" || (current.phase === "recoverable-error" && current.error?.operation === "completion")) {
        ambientEncounterRef.current = { encounterId, session: sessionRef.current };
      }
      if (!gate || gate.session !== sessionRef.current || current.phase !== "resolving") return;
      if (encounterId !== gate.encounterId) return;
      document.body.classList.remove("is-fighting");
      setStatus(undefined);
      dispatch({ type: "PHASER_AMBIENT", encounterId: encounterId ?? gate.encounterId });
    });
    return () => {
      mountedRef.current = false;
      removeCompleteListener();
      removeAmbientListener();
    };
  }, [runCompletionRequest, runtime]);

  useEffect(() => {
    if (bootstrapPhase === "recoverable-error" && stateRef.current.phase === "booting") {
      dispatch({ type: "BOOT_FAILED", message: bootstrapError?.message ?? "The fishing service is unavailable." });
      return;
    }
    if (bootstrapPhase === "booting" && stateRef.current.error?.operation === "bootstrap") {
      dispatch({ type: "BOOT_RETRY" });
      return;
    }
    if (bootstrapPhase !== "ready" || stateRef.current.phase !== "booting" || !activeEncounter) return;

    const active = activeEncounter;
    if (active.encounter) {
      sessionRef.current += 1;
      activeRuntimeEncounterId.current = active.encounter.encounterId;
      ambientEncounterRef.current = undefined;
      dispatch({ type: "ACTIVE_ENCOUNTER_LIVE", encounter: active.encounter });
      activateRuntimeEncounter(active.encounter, "Resuming your active encounter…");
      return;
    }
    if (active.expired) {
      clearEncounterRecovery();
      dispatch({ type: "ACTIVE_ENCOUNTER_EXPIRED" });
      setEncounterStatus("Your previous fishing encounter expired. Your tackle is ready for a safe new cast.", "error");
      return;
    }
    const snapshot = readEncounterRecovery();
    if (snapshot) {
      recoverySnapshotRef.current = snapshot;
      if (snapshot.decision) {
        dispatch({ type: "DECISION_RESULT_RESTORED", encounter: snapshot.encounter, result: snapshot.result, decision: snapshot.decision });
        setEncounterStatus("Your catch choice was recovered.", "ready");
      } else {
        dispatch({ type: "RESULT_RESTORED", encounter: snapshot.encounter, result: snapshot.result });
        setEncounterStatus(snapshot.result.catch ? "Your catch is waiting for a Keep or Sell choice." : "Your catch result was recovered.", "ready");
      }
      return;
    }
    dispatch({ type: "ACTIVE_ENCOUNTER_EMPTY" });
    if (isDevelopment && !telegramAvailable) setEncounterStatus("Local development mode", "ready");
  }, [activateRuntimeEncounter, activeEncounter, bootstrapError, bootstrapPhase, isDevelopment, setEncounterStatus, telegramAvailable]);

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(undefined), status.state === "loading" ? 15_000 : 3_200);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => () => {
    sessionRef.current += 1;
    ambientGateRef.current = undefined;
    ambientEncounterRef.current = undefined;
    activeRuntimeEncounterId.current = undefined;
    document.body.classList.remove("is-fighting");
  }, []);

  const requestStart = useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase !== "lobby" && !(phase === "recoverable-error" && stateRef.current.error?.operation === "start")) return;
    dispatch({ type: "START_REQUESTED" });
    setEncounterStatus("Starting your fishing attempt…", "loading");
  }, [setEncounterStatus]);

  const startSucceeded = useCallback((encounter: FishingEncounterResponse, message = "Your line is ready. Fish on…") => {
    const current = stateRef.current;
    if (activeRuntimeEncounterId.current === encounter.encounterId && document.body.classList.contains("is-fighting")) return;
    if (current.phase !== "starting" && !(current.phase === "recoverable-error" && current.error?.operation === "start") && current.phase !== "lobby") return;
    dispatch({ type: "START_SUCCEEDED", encounter });
    sessionRef.current += 1;
    ambientGateRef.current = undefined;
    ambientEncounterRef.current = undefined;
    recoverySnapshotRef.current = undefined;
    clearEncounterRecovery();
    activateRuntimeEncounter(encounter, message);
  }, [activateRuntimeEncounter]);

  const startFailed = useCallback((message: string) => {
    dispatch({ type: "START_FAILED", message });
    setEncounterStatus(message, "error");
  }, [setEncounterStatus]);

  const chooseDecision = useCallback((decision: CatchDecision) => {
    const current = stateRef.current;
    const catchId = current.result?.catch?.id;
    if (current.phase !== "result" || !catchId) return;
    runDecisionRequest(catchId, decision, false);
  }, [runDecisionRequest]);

  const retry = useCallback(() => {
    const current = stateRef.current;
    const operation = current.error?.operation;
    if (operation === "completion" && current.encounter && typeof current.completionPerformance === "number") {
      const event = { encounterId: current.encounter.encounterId, performance: current.completionPerformance };
      const ambientReady = ambientEncounterRef.current?.encounterId === event.encounterId && ambientEncounterRef.current.session === sessionRef.current;
      dispatch({ type: "RETRY", ambientReady });
      window.setTimeout(() => runCompletionRequest(event, true), 0);
      return;
    }
    if (operation === "decision" && current.result?.catch && current.pendingDecision) {
      const { id: catchId } = current.result.catch;
      const decision = current.pendingDecision;
      dispatch({ type: "RETRY" });
      window.setTimeout(() => runDecisionRequest(catchId, decision, true), 0);
    }
  }, [runCompletionRequest, runDecisionRequest]);

  const returnToLakes = useCallback(async () => {
    sessionRef.current += 1;
    ambientGateRef.current = undefined;
    ambientEncounterRef.current = undefined;
    activeRuntimeEncounterId.current = undefined;
    recoverySnapshotRef.current = undefined;
    clearEncounterRecovery();
    dispatch({ type: "RETURN_TO_LOBBY" });
    document.body.classList.remove("is-fighting");
    await runtime.returnToLobby();
    queryClient.setQueryData<ActiveFishingEncounterResponse>(queryKeys.activeEncounter, { encounter: null, expired: false });
  }, [queryClient, runtime]);

  return { state, status, requestStart, startSucceeded, startFailed, chooseDecision, retry, returnToLakes };
}
