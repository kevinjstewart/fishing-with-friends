import type {
  CollectionResponse,
  GameStateResponse,
  LeaderboardResponse,
  SellCatchResponse,
} from "@fishing/shared/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { queryKeys } from "../../api/query-keys";
import { createMutationLock, type MutationLock } from "../../api/mutation-lock";

export interface CollectionMutationApi {
  getCollection(signal?: AbortSignal): Promise<CollectionResponse>;
  getGameState(signal?: AbortSignal): Promise<GameStateResponse>;
  getLeaderboard(signal?: AbortSignal): Promise<LeaderboardResponse>;
  sellCatch(catchId: string): Promise<SellCatchResponse>;
}

export interface CollectionReconciliation {
  collection?: CollectionResponse;
  gameState?: GameStateResponse;
  leaderboard?: LeaderboardResponse;
  errors: unknown[];
}

export interface SellOneOutcome {
  before?: CollectionResponse;
  result?: SellCatchResponse;
  operationError?: unknown;
  reconciliation: CollectionReconciliation;
}

export interface SellAllOutcome {
  before?: CollectionResponse;
  operationError?: unknown;
  reconciliation: CollectionReconciliation;
}

export interface CollectionMutations {
  executeSellOne(catchId: string): Promise<SellOneOutcome> | undefined;
  executeSellAll(): Promise<SellAllOutcome> | undefined;
  refreshAuthoritativeState(): Promise<CollectionReconciliation>;
  pending: boolean;
}

export async function reconcileCollectionState(api: CollectionMutationApi, queryClient: ReturnType<typeof useQueryClient>): Promise<CollectionReconciliation> {
  const [collectionResult, gameStateResult, leaderboardResult] = await Promise.allSettled([
    api.getCollection(),
    api.getGameState(),
    api.getLeaderboard(),
  ]);
  const reconciliation: CollectionReconciliation = { errors: [] };

  if (collectionResult.status === "fulfilled") {
    reconciliation.collection = collectionResult.value;
    queryClient.setQueryData(queryKeys.collection, collectionResult.value);
  } else {
    reconciliation.errors.push(collectionResult.reason);
  }
  if (gameStateResult.status === "fulfilled") {
    reconciliation.gameState = gameStateResult.value;
    queryClient.setQueryData(queryKeys.gameState, gameStateResult.value);
  } else {
    reconciliation.errors.push(gameStateResult.reason);
  }
  if (leaderboardResult.status === "fulfilled") {
    reconciliation.leaderboard = leaderboardResult.value;
    queryClient.setQueryData(queryKeys.leaderboard, leaderboardResult.value);
  } else {
    reconciliation.errors.push(leaderboardResult.reason);
  }
  return reconciliation;
}

function getMutationError(error: unknown): unknown {
  return error instanceof Error ? error : new Error("Unable to complete that sale.");
}

/**
 * Sell-one and sell-all share a feature-local sale boundary. Each public
 * action acquires its own imperative lock before rendering can disable the
 * control, and every path performs the same Worker-owned final reads.
 */
export function useCollectionMutations(api: CollectionMutationApi): CollectionMutations {
  const queryClient = useQueryClient();
  const sellOneLockRef = useRef<MutationLock>(createMutationLock());
  const sellAllLockRef = useRef<MutationLock>(createMutationLock());
  const [pendingOperation, setPendingOperation] = useState<"sell-one" | "sell-all">();
  const sellMutation = useMutation({
    mutationFn: (catchId: string) => api.sellCatch(catchId),
    retry: false,
  });

  const refreshAuthoritativeState = useCallback(() => reconcileCollectionState(api, queryClient), [api, queryClient]);

  const executeSellOne = useCallback((catchId: string) => {
    const lock = sellOneLockRef.current;
    if (sellAllLockRef.current.active || !lock.tryAcquire()) return undefined;
    setPendingOperation("sell-one");

    return (async () => {
      let before: CollectionResponse | undefined;
      let result: SellCatchResponse | undefined;
      let operationError: unknown;
      try {
        before = await api.getCollection();
        result = await sellMutation.mutateAsync(catchId);
      } catch (error) {
        operationError = getMutationError(error);
      }

      let reconciliation: CollectionReconciliation;
      try {
        reconciliation = await refreshAuthoritativeState();
      } catch (error) {
        reconciliation = { errors: [error] };
      } finally {
        lock.release();
        setPendingOperation(undefined);
      }
      return { before, result, operationError, reconciliation };
    })();
  }, [api, refreshAuthoritativeState, sellMutation]);

  const executeSellAll = useCallback(() => {
    const lock = sellAllLockRef.current;
    if (sellOneLockRef.current.active || !lock.tryAcquire()) return undefined;
    setPendingOperation("sell-all");

    return (async () => {
      let before: CollectionResponse | undefined;
      let operationError: unknown;
      try {
        before = await api.getCollection();
        for (const specimen of before.fish) {
          try {
            await sellMutation.mutateAsync(specimen.id);
          } catch (error) {
            operationError = getMutationError(error);
            break;
          }
        }
      } catch (error) {
        operationError = getMutationError(error);
      }

      let reconciliation: CollectionReconciliation;
      try {
        reconciliation = await refreshAuthoritativeState();
      } catch (error) {
        reconciliation = { errors: [error] };
      } finally {
        lock.release();
        setPendingOperation(undefined);
      }
      return { before, operationError, reconciliation };
    })();
  }, [api, refreshAuthoritativeState, sellMutation]);

  return {
    executeSellOne,
    executeSellAll,
    refreshAuthoritativeState,
    pending: pendingOperation !== undefined,
  };
}
