import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFishingRuntime } from "./phaser-runtime";
import { createGame } from "./create-game";

vi.mock("./create-game", () => ({ createGame: vi.fn() }));

type Listener = (...args: unknown[]) => void;

function fakeGame() {
  const listeners = new Map<string, Set<Listener>>();
  const events = {
    on: vi.fn((event: string, listener: Listener) => {
      const handlers = listeners.get(event) ?? new Set<Listener>();
      handlers.add(listener);
      listeners.set(event, handlers);
    }),
    off: vi.fn((event: string, listener: Listener) => listeners.get(event)?.delete(listener)),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    }),
  };
  return {
    events,
    registry: { set: vi.fn() },
    destroy: vi.fn(),
  };
}

describe("createFishingRuntime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("constructs once, forwards lifecycle events and safe areas, and destroys once with listener cleanup", async () => {
    const game = fakeGame();
    vi.mocked(createGame).mockReturnValue(game as never);
    const runtime = createFishingRuntime({} as HTMLElement);
    const complete = vi.fn();
    const ambient = vi.fn();
    const unsubscribeComplete = runtime.onComplete(complete);
    runtime.onAmbient(ambient);
    const event = { encounterId: "encounter-1", performance: 0.75 };

    runtime.startFight({} as never);
    runtime.setSafeArea({ top: 1, right: 2, bottom: 3, left: 4 });
    runtime.emitCompleteForTest(event);
    game.events.emit("fishing:ambient");
    expect(game.events.emit).toHaveBeenCalledWith("fight:start", {});
    expect(game.registry.set).toHaveBeenCalledWith("safeArea", { top: 1, right: 2, bottom: 3, left: 4 });
    expect(complete).toHaveBeenCalledWith(event);
    expect(ambient).toHaveBeenCalledTimes(1);

    unsubscribeComplete();
    runtime.emitCompleteForTest(event);
    expect(complete).toHaveBeenCalledTimes(1);

    await runtime.returnToLobby();
    runtime.destroy();
    runtime.destroy();
    runtime.startFight({} as never);
    expect(game.events.off).toHaveBeenCalledTimes(2);
    expect(game.destroy).toHaveBeenCalledTimes(1);
    expect(game.destroy).toHaveBeenCalledWith(true);
  });

  it("creates only one game for one runtime instance", () => {
    vi.mocked(createGame).mockReturnValue(fakeGame() as never);
    createFishingRuntime({} as HTMLElement);
    expect(createGame).toHaveBeenCalledTimes(1);
  });
});
