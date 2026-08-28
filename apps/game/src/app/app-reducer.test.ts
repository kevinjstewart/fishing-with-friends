import { describe, expect, it } from "vitest";
import { appReducer, initialAppState } from "./app-reducer";

describe("appReducer", () => {
  it("covers boot success, boot retry, and recoverable bootstrap failure", () => {
    const ready = appReducer(initialAppState, { type: "BOOT_SUCCEEDED", screen: "lakes" });
    expect(ready).toMatchObject({ phase: "ready", screen: "lakes", lastSuccessfulScreen: "lakes" });

    const failed = appReducer(initialAppState, { type: "BOOT_FAILED", message: "offline" });
    expect(failed).toMatchObject({ phase: "recoverable-error", error: { operation: "bootstrap", message: "offline" } });
    expect(appReducer(failed, { type: "BOOT_RETRY" })).toMatchObject({ phase: "booting", error: undefined });
  });

  it("keeps the last successful screen while navigation is loading or failed", () => {
    const ready = appReducer(initialAppState, { type: "BOOT_SUCCEEDED", screen: "lakes" });
    const loading = appReducer(ready, { type: "NAVIGATION_STARTED", screen: "friends", requestId: 1 });
    expect(loading).toMatchObject({ phase: "ready", screen: "lakes", lastSuccessfulScreen: "lakes", navigation: { status: "loading", target: "friends", requestId: 1 } });

    const failed = appReducer(loading, { type: "NAVIGATION_FAILED", screen: "friends", requestId: 1, message: "timeout" });
    expect(failed).toMatchObject({ phase: "recoverable-error", screen: "lakes", lastSuccessfulScreen: "lakes", error: { operation: "navigation", target: "friends", message: "timeout" } });

    const retried = appReducer(failed, { type: "NAVIGATION_STARTED", screen: "friends", requestId: 2 });
    expect(appReducer(retried, { type: "NAVIGATION_SUCCEEDED", screen: "friends", requestId: 2 })).toMatchObject({
      phase: "ready",
      screen: "friends",
      lastSuccessfulScreen: "friends",
      navigation: { status: "idle", requestId: 2 },
    });
  });

  it("ignores stale and invalid navigation events and repeated active-tab taps", () => {
    const ready = appReducer(initialAppState, { type: "BOOT_SUCCEEDED", screen: "lakes" });
    expect(appReducer(ready, { type: "NAVIGATION_STARTED", screen: "lakes", requestId: 1 })).toBe(ready);

    const loading = appReducer(ready, { type: "NAVIGATION_STARTED", screen: "collection", requestId: 2 });
    expect(appReducer(loading, { type: "NAVIGATION_SUCCEEDED", screen: "friends", requestId: 2 })).toBe(loading);
    expect(appReducer(loading, { type: "NAVIGATION_SUCCEEDED", screen: "collection", requestId: 1 })).toBe(loading);
    expect(appReducer(loading, { type: "NAVIGATION_FAILED", screen: "collection", requestId: 1, message: "stale" })).toBe(loading);
  });

  it("ignores boot events outside booting and supports the default boot screen", () => {
    const ready = appReducer(initialAppState, { type: "BOOT_SUCCEEDED" });
    expect(ready.screen).toBe("lakes");
    expect(appReducer(ready, { type: "BOOT_FAILED", message: "late failure" })).toBe(ready);
    expect(appReducer(ready, { type: "BOOT_RETRY" })).toBe(ready);
    expect(appReducer(initialAppState, { type: "NAVIGATION_STARTED", screen: "friends", requestId: 1 })).toBe(initialAppState);
  });
});
