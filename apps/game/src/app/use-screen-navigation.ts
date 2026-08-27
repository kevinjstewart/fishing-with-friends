import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { queryKeys } from "../api/query-keys";
import type { ScreenId } from "./app-types";
import { appReducer, initialAppState } from "./app-reducer";

const queryKeyForScreen: Partial<Record<ScreenId, readonly unknown[]>> = {
  friends: queryKeys.leaderboard,
  journal: queryKeys.journal,
};

export interface ScreenNavigation {
  state: typeof initialAppState;
  navigate(screen: ScreenId): void;
  retry(): void;
  markLoaded(screen: ScreenId, requestId: number): void;
  markFailed(screen: ScreenId, requestId: number, message: string): void;
}

export function useScreenNavigation(ready: boolean): ScreenNavigation {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const requestSequence = useRef(0);
  const currentRequest = useRef<{ screen: ScreenId; requestId: number } | undefined>(undefined);

  useEffect(() => {
    if (ready && state.phase === "booting") dispatch({ type: "BOOT_SUCCEEDED" });
  }, [ready, state.phase]);

  const cancelScreenQuery = useCallback((screen?: ScreenId) => {
    const queryKey = screen ? queryKeyForScreen[screen] : undefined;
    if (queryKey) void queryClient.cancelQueries({ queryKey });
  }, [queryClient]);

  const navigate = useCallback((screen: ScreenId) => {
    if (!ready) return;
    if (state.phase === "ready" && state.navigation.status === "idle" && state.screen === screen) return;

    const previousScreen = currentRequest.current?.screen ?? state.navigation.target ?? state.screen;
    cancelScreenQuery(previousScreen);
    const requestId = ++requestSequence.current;
    currentRequest.current = { screen, requestId };
    dispatch({ type: "NAVIGATION_STARTED", screen, requestId });

    if (!queryKeyForScreen[screen]) {
      dispatch({ type: "NAVIGATION_SUCCEEDED", screen, requestId });
      currentRequest.current = undefined;
    }
  }, [cancelScreenQuery, ready, state.navigation.status, state.navigation.target, state.phase, state.screen]);

  const markLoaded = useCallback((screen: ScreenId, requestId: number) => {
    if (currentRequest.current?.screen !== screen || currentRequest.current.requestId !== requestId) return;
    currentRequest.current = undefined;
    dispatch({ type: "NAVIGATION_SUCCEEDED", screen, requestId });
  }, []);

  const markFailed = useCallback((screen: ScreenId, requestId: number, message: string) => {
    if (currentRequest.current?.screen !== screen || currentRequest.current.requestId !== requestId) return;
    currentRequest.current = undefined;
    dispatch({ type: "NAVIGATION_FAILED", screen, requestId, message });
  }, []);

  const retry = useCallback(() => {
    const target = state.error?.operation === "navigation" ? state.error.target : undefined;
    if (target) navigate(target);
  }, [navigate, state.error]);

  useEffect(() => () => {
    cancelScreenQuery(currentRequest.current?.screen);
    currentRequest.current = undefined;
  }, [cancelScreenQuery]);

  return { state, navigate, retry, markLoaded, markFailed };
}
