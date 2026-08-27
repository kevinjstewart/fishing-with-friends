import type { PurchaseRequest, PurchaseResponse } from "@fishing/shared/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { createMutationLock, type MutationLock } from "../../api/mutation-lock";
import { queryKeys } from "../../api/query-keys";

export interface PurchaseApi {
  purchase(input: PurchaseRequest): Promise<PurchaseResponse>;
}

export interface PurchaseOutcome {
  response: PurchaseResponse;
  reconciliationError?: unknown;
}

export interface PurchaseMutation {
  execute(input: PurchaseRequest): Promise<PurchaseOutcome> | undefined;
  refreshAuthoritativeState(): Promise<void>;
  pending: boolean;
}

/**
 * Purchase coordination stays inside the shop feature. The lock is acquired
 * synchronously, before React can render the pending state, while the query
 * invalidation keeps the Worker response authoritative after settlement.
 */
export function usePurchaseMutation(api: PurchaseApi): PurchaseMutation {
  const queryClient = useQueryClient();
  const lockRef = useRef<MutationLock>(createMutationLock());
  const [locked, setLocked] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: PurchaseRequest) => api.purchase(input),
    retry: false,
  });

  const refreshAuthoritativeState = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: queryKeys.gameState, type: "active" }, { throwOnError: true });
  }, [queryClient]);

  const execute = useCallback((input: PurchaseRequest) => {
    const lock = lockRef.current;
    if (!lock.tryAcquire()) return undefined;
    setLocked(true);

    return (async () => {
      let result: PurchaseResponse | undefined;
      let operationError: unknown;
      try {
        result = await mutation.mutateAsync(input);
      } catch (error) {
        operationError = error;
      }

      let reconciliationError: unknown;
      try {
        await refreshAuthoritativeState();
      } catch (error) {
        reconciliationError = error;
      } finally {
        lock.release();
        setLocked(false);
      }

      if (operationError) throw operationError;
      if (!result) throw new Error("Unable to confirm that purchase.");
      return { response: result, reconciliationError };
    })();
  }, [mutation, refreshAuthoritativeState]);

  return { execute, refreshAuthoritativeState, pending: locked || mutation.isPending };
}
