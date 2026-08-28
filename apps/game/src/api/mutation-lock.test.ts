import { describe, expect, it, vi } from "vitest";
import { createMutationLock } from "./mutation-lock";

describe("createMutationLock", () => {
  it.each(["start", "complete", "decision", "purchase", "sell", "select-equipment", "recovery"])("rejects a duplicate %s call before rerender", async (operation) => {
    const lock = createMutationLock();
    const release = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((next) => { resolve = next; });
      return { promise, resolve };
    })();
    const workerCall = vi.fn(() => release.promise);

    const request = lock.run(workerCall);
    expect(request).toBeDefined();
    expect(lock.run(workerCall)).toBeUndefined();
    expect(workerCall).toHaveBeenCalledTimes(1);
    release.resolve();
    if (!request) throw new Error("The first mutation should have started.");
    await request;
    expect(lock.active).toBe(false);
    expect(operation).toBeTruthy();
  });

  it("releases after success, rejection, or synchronous failure when using run", async () => {
    const lock = createMutationLock();
    await expect(lock.run(async () => "ok")).resolves.toBe("ok");
    expect(lock.active).toBe(false);
    await expect(lock.run(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(lock.active).toBe(false);
    expect(() => lock.run(() => { throw new Error("sync"); })).toThrow("sync");
    expect(lock.active).toBe(false);
  });
});
