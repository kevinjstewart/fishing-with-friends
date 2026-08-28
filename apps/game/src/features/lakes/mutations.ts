import type {
  ActiveEquipment,
  ActiveFishingEncounterResponse,
  FishingEncounterResponse,
  GameStateResponse,
  RecoveryResponse,
  SelectEquipmentRequest,
  SelectEquipmentResponse,
  StartFishingRequest,
} from "@fishing/shared/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { createMutationLock, type MutationLock } from "../../api/mutation-lock";
import { queryKeys } from "../../api/query-keys";

export interface LakesMutationApi {
  getGameState(): Promise<GameStateResponse>;
  getActiveEncounter(): Promise<ActiveFishingEncounterResponse>;
  selectEquipment(input: SelectEquipmentRequest): Promise<SelectEquipmentResponse>;
  digForWorms(): Promise<RecoveryResponse>;
  startFishing(input: StartFishingRequest): Promise<FishingEncounterResponse>;
}

export type LakesAction = "equipment" | "recovery" | "cast";

export interface EquipmentOutcome {
  response?: SelectEquipmentResponse;
  operationError?: unknown;
  reconciliationError?: unknown;
}

export interface RecoveryOutcome {
  response?: RecoveryResponse;
  operationError?: unknown;
  reconciliationError?: unknown;
}

export interface CastOutcome {
  encounter?: FishingEncounterResponse;
  resumedEncounter?: FishingEncounterResponse;
  expired?: boolean;
  operationError?: unknown;
  reconciliationError?: unknown;
}

export interface LakesMutations {
  pendingAction?: LakesAction;
  executeEquipment(input: SelectEquipmentRequest): Promise<EquipmentOutcome> | undefined;
  executeRecovery(): Promise<RecoveryOutcome> | undefined;
  executeCast(locationId: string, equipment: ActiveEquipment): Promise<CastOutcome> | undefined;
  refreshAuthoritativeState(): Promise<GameStateResponse>;
}

/**
 * Lakes actions share one synchronous lock. This closes the input-to-render
 * race for touch, keyboard, and programmatic activation while every refresh
 * still comes from the Worker response or a new authoritative read.
 */
export function useLakesMutations(api: LakesMutationApi): LakesMutations {
  const queryClient = useQueryClient();
  const lockRef = useRef<MutationLock>(createMutationLock());
  const [pendingAction, setPendingAction] = useState<LakesAction>();
  const equipmentMutation = useMutation({ mutationFn: (input: SelectEquipmentRequest) => api.selectEquipment(input), retry: false });
  const recoveryMutation = useMutation({ mutationFn: () => api.digForWorms(), retry: false });
  const castMutation = useMutation({ mutationFn: (input: StartFishingRequest) => api.startFishing(input), retry: false });

  const refreshAuthoritativeState = useCallback(async () => {
    const state = await api.getGameState();
    queryClient.setQueryData(queryKeys.gameState, state);
    return state;
  }, [api, queryClient]);

  const begin = useCallback((action: LakesAction): boolean => {
    if (!lockRef.current.tryAcquire()) return false;
    setPendingAction(action);
    return true;
  }, []);

  const finish = useCallback(() => {
    lockRef.current.release();
    setPendingAction(undefined);
  }, []);

  const executeEquipment = useCallback((input: SelectEquipmentRequest) => {
    if (!begin("equipment")) return undefined;
    return (async (): Promise<EquipmentOutcome> => {
      let response: SelectEquipmentResponse | undefined;
      let operationError: unknown;
      try {
        response = await equipmentMutation.mutateAsync(input);
      } catch (error) {
        operationError = error;
      }

      let reconciliationError: unknown;
      try {
        await refreshAuthoritativeState();
      } catch (error) {
        reconciliationError = error;
      } finally {
        finish();
      }
      return { response, operationError, reconciliationError };
    })();
  }, [begin, equipmentMutation, finish, refreshAuthoritativeState]);

  const executeRecovery = useCallback(() => {
    if (!begin("recovery")) return undefined;
    return (async (): Promise<RecoveryOutcome> => {
      let response: RecoveryResponse | undefined;
      let operationError: unknown;
      try {
        response = await recoveryMutation.mutateAsync();
      } catch (error) {
        operationError = error;
      }

      let reconciliationError: unknown;
      try {
        await refreshAuthoritativeState();
      } catch (error) {
        reconciliationError = error;
      } finally {
        finish();
      }
      return { response, operationError, reconciliationError };
    })();
  }, [begin, finish, recoveryMutation, refreshAuthoritativeState]);

  const executeCast = useCallback((locationId: string, equipment: ActiveEquipment) => {
    if (!begin("cast")) return undefined;
    return (async (): Promise<CastOutcome> => {
      const input: StartFishingRequest = { locationId, ...equipment };
      let encounter: FishingEncounterResponse | undefined;
      let operationError: unknown;
      let resumedEncounter: FishingEncounterResponse | undefined;
      let expired = false;
      let reconciliationError: unknown;

      try {
        encounter = await castMutation.mutateAsync(input);
        queryClient.setQueryData<ActiveFishingEncounterResponse>(queryKeys.activeEncounter, { encounter, expired: false });
      } catch (error) {
        operationError = error;
        try {
          const active = await api.getActiveEncounter();
          queryClient.setQueryData(queryKeys.activeEncounter, active);
          resumedEncounter = active.encounter ?? undefined;
          expired = active.expired;
        } catch (error) {
          reconciliationError = error;
        }
      }

      try {
        await refreshAuthoritativeState();
      } catch (error) {
        reconciliationError ??= error;
      } finally {
        finish();
      }

      return { encounter, resumedEncounter, expired, operationError, reconciliationError };
    })();
  }, [api, begin, castMutation, finish, queryClient, refreshAuthoritativeState]);

  return {
    pendingAction,
    executeEquipment,
    executeRecovery,
    executeCast,
    refreshAuthoritativeState,
  };
}
