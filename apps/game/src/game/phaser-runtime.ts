import type Phaser from "phaser";
import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import type { SafeAreaInsets } from "../safe-area";
import { createGame } from "./create-game";

export interface FishingCompleteEvent {
  encounterId: string;
  performance: number;
}

export interface FishingRuntime {
  setSafeArea(insets: SafeAreaInsets): void;
  startFight(encounter: FishingEncounterResponse): void;
  returnToLobby(): Promise<void>;
  onComplete(handler: (event: FishingCompleteEvent) => void): () => void;
  onAmbient(handler: (encounterId?: string) => void): () => void;
  destroy(): void;
  /** Development/test seam for the existing Phase 0 deterministic fixtures. */
  emitCompleteForTest(event: FishingCompleteEvent): void;
  /** Development/test seam for verifying the ambient-result gate. */
  emitAmbientForTest(encounterId?: string): void;
}

interface RuntimeGame {
  events: {
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
  };
  registry: { set(key: string, value: unknown): void };
  destroy(removeCanvas?: boolean): void;
}

type GameFactory = (parent: HTMLElement) => Phaser.Game;

/**
 * The one framework-neutral boundary around Phaser. The scene can keep its
 * existing event names while a future React owner uses this stable interface.
 */
export function createFishingRuntime(parent: HTMLElement, gameFactory: GameFactory = createGame): FishingRuntime {
  const game = gameFactory(parent) as unknown as RuntimeGame;
  const completeHandlers = new Set<(event: FishingCompleteEvent) => void>();
  const ambientHandlers = new Set<(encounterId?: string) => void>();
  let destroyed = false;

  const completeListener = (...args: unknown[]): void => {
    const event = args[0] as FishingCompleteEvent;
    for (const handler of completeHandlers) handler(event);
  };
  const ambientListener = (...args: unknown[]): void => {
    const encounterId = typeof args[0] === "string" ? args[0] : undefined;
    for (const handler of ambientHandlers) handler(encounterId);
  };

  game.events.on("fishing:complete", completeListener);
  game.events.on("fishing:ambient", ambientListener);

  return {
    setSafeArea(insets) {
      if (destroyed) return;
      game.registry.set("safeArea", insets);
      game.events.emit("safearea:changed");
    },
    startFight(encounter) {
      if (destroyed) return;
      game.events.emit("fight:start", encounter);
    },
    returnToLobby() {
      if (!destroyed) game.events.emit("fishing:lobby");
      return Promise.resolve();
    },
    onComplete(handler) {
      if (destroyed) return () => {};
      completeHandlers.add(handler);
      return () => completeHandlers.delete(handler);
    },
    onAmbient(handler) {
      if (destroyed) return () => {};
      ambientHandlers.add(handler);
      return () => ambientHandlers.delete(handler);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game.events.off("fishing:complete", completeListener);
      game.events.off("fishing:ambient", ambientListener);
      completeHandlers.clear();
      ambientHandlers.clear();
      game.destroy(true);
    },
    emitCompleteForTest(event) {
      if (!destroyed) game.events.emit("fishing:complete", event);
    },
    emitAmbientForTest(encounterId) {
      if (!destroyed) game.events.emit("fishing:ambient", encounterId);
    },
  };
}
