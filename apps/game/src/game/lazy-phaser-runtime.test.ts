import { describe, expect, it, vi } from "vitest";
import type { FishingRuntime } from "./phaser-runtime";
import { createLazyFishingRuntime } from "./lazy-phaser-runtime";

function createFakeRuntime(): { runtime: FishingRuntime; emitComplete: (event: { encounterId: string; performance: number }) => void; emitAmbient: (encounterId?: string) => void } {
  const completeHandlers = new Set<(event: { encounterId: string; performance: number }) => void>();
  const ambientHandlers = new Set<(encounterId?: string) => void>();
  const runtime: FishingRuntime = {
    setSafeArea: vi.fn(),
    startFight: vi.fn(),
    returnToLobby: vi.fn(async () => {}),
    onComplete: vi.fn((handler) => {
      completeHandlers.add(handler);
      return () => completeHandlers.delete(handler);
    }),
    onAmbient: vi.fn((handler) => {
      ambientHandlers.add(handler);
      return () => ambientHandlers.delete(handler);
    }),
    destroy: vi.fn(),
    emitCompleteForTest: vi.fn((event) => completeHandlers.forEach((handler) => handler(event))),
    emitAmbientForTest: vi.fn((encounterId) => ambientHandlers.forEach((handler) => handler(encounterId))),
  };
  return {
    runtime,
    emitComplete: (event) => runtime.emitCompleteForTest(event),
    emitAmbient: (encounterId) => runtime.emitAmbientForTest(encounterId),
  };
}

describe("createLazyFishingRuntime", () => {
  it("can warm the ambient game after the shell is ready without starting a fight", async () => {
    let resolveLoad: ((module: { createFishingRuntime: (parent: HTMLElement) => FishingRuntime }) => void) | undefined;
    const loadRuntime = vi.fn(() => new Promise<{ createFishingRuntime: (parent: HTMLElement) => FishingRuntime }>((resolve) => { resolveLoad = resolve; }));
    const fake = createFakeRuntime();
    const createRuntime = vi.fn(() => fake.runtime);
    const lazyRuntime = createLazyFishingRuntime({} as HTMLElement, loadRuntime);

    const preload = lazyRuntime.preload?.();
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    resolveLoad?.({ createFishingRuntime: createRuntime });
    await preload;

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(fake.runtime.startFight).not.toHaveBeenCalled();
  });

  it("defers Phaser loading, shares one initialization, and forwards pre-load state", async () => {
    let resolveLoad: ((module: { createFishingRuntime: (parent: HTMLElement) => FishingRuntime }) => void) | undefined;
    const loadRuntime = vi.fn(() => new Promise<{ createFishingRuntime: (parent: HTMLElement) => FishingRuntime }>((resolve) => { resolveLoad = resolve; }));
    const fake = createFakeRuntime();
    const createRuntime = vi.fn(() => fake.runtime);
    const lazyRuntime = createLazyFishingRuntime({} as HTMLElement, loadRuntime);
    const complete = vi.fn();
    const ambient = vi.fn();

    lazyRuntime.setSafeArea({ top: 1, right: 2, bottom: 3, left: 4 });
    lazyRuntime.onComplete(complete);
    lazyRuntime.onAmbient(ambient);
    await lazyRuntime.returnToLobby();
    expect(loadRuntime).not.toHaveBeenCalled();

    const firstStart = lazyRuntime.startFight({} as never);
    const secondStart = lazyRuntime.startFight({} as never);
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    resolveLoad?.({ createFishingRuntime: createRuntime });
    await Promise.all([firstStart, secondStart]);

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(fake.runtime.setSafeArea).toHaveBeenCalledWith({ top: 1, right: 2, bottom: 3, left: 4 });
    expect(fake.runtime.onComplete).toHaveBeenCalledTimes(1);
    expect(fake.runtime.onAmbient).toHaveBeenCalledTimes(1);
    fake.emitComplete({ encounterId: "encounter-1", performance: 0.7 });
    fake.emitAmbient("encounter-1");
    expect(complete).toHaveBeenCalledWith({ encounterId: "encounter-1", performance: 0.7 });
    expect(ambient).toHaveBeenCalledWith("encounter-1");

    await lazyRuntime.startFight({} as never);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it("exposes a failed chunk load to the caller and allows a later retry", async () => {
    const fake = createFakeRuntime();
    const createRuntime = vi.fn(() => fake.runtime);
    const loadRuntime = vi.fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce({ createFishingRuntime: createRuntime });
    const lazyRuntime = createLazyFishingRuntime({} as HTMLElement, loadRuntime);

    await expect(lazyRuntime.startFight({} as never)).rejects.toThrow("chunk unavailable");
    await lazyRuntime.startFight({} as never);

    expect(loadRuntime).toHaveBeenCalledTimes(2);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it("does not create Phaser after unmount destroys a pending runtime", async () => {
    let resolveLoad: ((module: { createFishingRuntime: (parent: HTMLElement) => FishingRuntime }) => void) | undefined;
    const loadRuntime = vi.fn(() => new Promise<{ createFishingRuntime: (parent: HTMLElement) => FishingRuntime }>((resolve) => { resolveLoad = resolve; }));
    const createRuntime = vi.fn(() => createFakeRuntime().runtime);
    const lazyRuntime = createLazyFishingRuntime({} as HTMLElement, loadRuntime);
    const pendingStart = lazyRuntime.startFight({} as never);

    lazyRuntime.destroy();
    resolveLoad?.({ createFishingRuntime: createRuntime });
    await pendingStart;

    expect(createRuntime).not.toHaveBeenCalled();
  });
});
