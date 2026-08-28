import type { AppEvent, AppState } from "./app-types";

export const initialAppState: AppState = {
  phase: "booting",
  screen: "lakes",
  lastSuccessfulScreen: "lakes",
  navigation: { status: "idle", requestId: 0 },
};

export function appReducer(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "BOOT_SUCCEEDED": {
      const screen = event.screen ?? state.lastSuccessfulScreen;
      return {
        phase: "ready",
        screen,
        lastSuccessfulScreen: screen,
        navigation: { status: "idle", requestId: state.navigation.requestId },
      };
    }
    case "BOOT_FAILED":
      if (state.phase !== "booting") return state;
      return {
        ...state,
        phase: "recoverable-error",
        error: { operation: "bootstrap", message: event.message },
      };
    case "BOOT_RETRY":
      if (state.phase !== "recoverable-error" || state.error?.operation !== "bootstrap") return state;
      return { ...state, phase: "booting", error: undefined };
    case "NAVIGATION_STARTED":
      if (state.phase !== "ready" && state.error?.operation !== "navigation") return state;
      if (state.phase === "ready" && state.navigation.status === "idle" && state.screen === event.screen) return state;
      return {
        ...state,
        phase: "ready",
        navigation: { status: "loading", target: event.screen, requestId: event.requestId },
        error: undefined,
      };
    case "NAVIGATION_SUCCEEDED":
      if (
        state.navigation.status !== "loading" ||
        state.navigation.requestId !== event.requestId ||
        state.navigation.target !== event.screen
      ) return state;
      return {
        ...state,
        phase: "ready",
        screen: event.screen,
        lastSuccessfulScreen: event.screen,
        navigation: { status: "idle", requestId: event.requestId },
        error: undefined,
      };
    case "NAVIGATION_FAILED":
      if (
        state.navigation.status !== "loading" ||
        state.navigation.requestId !== event.requestId ||
        state.navigation.target !== event.screen
      ) return state;
      return {
        ...state,
        phase: "recoverable-error",
        screen: state.lastSuccessfulScreen,
        navigation: { status: "idle", requestId: event.requestId },
        error: { operation: "navigation", target: event.screen, message: event.message },
      };
  }
}
