export interface MutationLock {
  readonly active: boolean;
  tryAcquire(): boolean;
  release(): void;
  run<T>(operation: () => Promise<T>): Promise<T> | undefined;
}

/**
 * An imperative lock that closes the gap between an input event and the next
 * render. It is deliberately independent of UI state or a framework.
 */
export function createMutationLock(): MutationLock {
  let active = false;

  return {
    get active() {
      return active;
    },
    tryAcquire() {
      if (active) return false;
      active = true;
      return true;
    },
    release() {
      active = false;
    },
    run<T>(operation: () => Promise<T>) {
      if (!active) active = true;
      else return undefined;

      try {
        return Promise.resolve(operation()).finally(() => {
          active = false;
        });
      } catch (error) {
        active = false;
        throw error;
      }
    },
  };
}
