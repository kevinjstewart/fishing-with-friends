import type { FishingEncounterResponse } from "@fishing/shared/contracts";
import type { SafeAreaInsets } from "../safe-area";
import type { FishingCompleteEvent, FishingRuntime } from "./phaser-runtime";

type RuntimeModule = { createFishingRuntime: (parent: HTMLElement) => FishingRuntime };
type RuntimeLoader = () => Promise<RuntimeModule>;

const noop = (): void => {};

/**
 * Defers the Phaser module and game construction until the initial React shell
 * has rendered or the first encounter needs it. Listener registration and
 * safe-area updates remain synchronous from React's point of view, so the rest
 * of the lifecycle does not need a second owner.
 */
export function createLazyFishingRuntime(parent: HTMLElement, loadRuntime: RuntimeLoader = () => import("./phaser-runtime")): FishingRuntime {
  let runtime: FishingRuntime | undefined;
  let loadPromise: Promise<FishingRuntime | undefined> | undefined;
  let safeArea: SafeAreaInsets | undefined;
  let destroyed = false;
  const completeHandlers = new Set<(event: FishingCompleteEvent) => void>();
  const completeUnsubscribers = new Map<(event: FishingCompleteEvent) => void, () => void>();
  const ambientHandlers = new Set<(encounterId?: string) => void>();
  const ambientUnsubscribers = new Map<(encounterId?: string) => void, () => void>();

  const ensureRuntime = (): Promise<FishingRuntime | undefined> => {
    if (runtime) return Promise.resolve(runtime);
    if (destroyed) return Promise.resolve(undefined);
    if (!loadPromise) {
      loadPromise = loadRuntime()
        .then(({ createFishingRuntime: createRuntime }) => {
          if (destroyed) return undefined;
          const created = createRuntime(parent);
          runtime = created;
          if (safeArea) created.setSafeArea(safeArea);
          for (const handler of completeHandlers) completeUnsubscribers.set(handler, created.onComplete(handler));
          for (const handler of ambientHandlers) ambientUnsubscribers.set(handler, created.onAmbient(handler));
          return created;
        })
        .catch((error: unknown) => {
          loadPromise = undefined;
          throw error;
        });
    }
    return loadPromise;
  };

  return {
    setSafeArea(insets) {
      safeArea = insets;
      runtime?.setSafeArea(insets);
    },
    preload() {
      return ensureRuntime().then(() => undefined);
    },
    startFight(encounter: FishingEncounterResponse) {
      if (destroyed) return Promise.resolve();
      return ensureRuntime().then(async (created) => {
        if (!created) return;
        await created.startFight(encounter);
      });
    },
    returnToLobby() {
      if (!runtime) return Promise.resolve();
      return runtime.returnToLobby();
    },
    onComplete(handler) {
      if (destroyed) return noop;
      completeHandlers.add(handler);
      if (runtime) completeUnsubscribers.set(handler, runtime.onComplete(handler));
      return () => {
        completeUnsubscribers.get(handler)?.();
        completeUnsubscribers.delete(handler);
        completeHandlers.delete(handler);
      };
    },
    onAmbient(handler) {
      if (destroyed) return noop;
      ambientHandlers.add(handler);
      if (runtime) ambientUnsubscribers.set(handler, runtime.onAmbient(handler));
      return () => {
        ambientUnsubscribers.get(handler)?.();
        ambientUnsubscribers.delete(handler);
        ambientHandlers.delete(handler);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtime?.destroy();
      runtime = undefined;
      completeHandlers.clear();
      completeUnsubscribers.clear();
      ambientHandlers.clear();
      ambientUnsubscribers.clear();
    },
    emitCompleteForTest(event) {
      if (destroyed) return;
      if (runtime) {
        runtime.emitCompleteForTest(event);
        return;
      }
      void ensureRuntime().then((created) => created?.emitCompleteForTest(event)).catch(() => {});
    },
    emitAmbientForTest(encounterId) {
      if (destroyed) return;
      if (runtime) {
        runtime.emitAmbientForTest(encounterId);
        return;
      }
      void ensureRuntime().then((created) => created?.emitAmbientForTest(encounterId)).catch(() => {});
    },
  };
}
