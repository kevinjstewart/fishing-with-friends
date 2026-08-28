import { describe, expect, it, vi } from "vitest";
import { createOceanInput } from "./ocean-input";

type Listener = (...args: unknown[]) => void;

function emitter() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: vi.fn((event: string, listener: Listener) => {
      const handlers = listeners.get(event) ?? new Set<Listener>();
      handlers.add(listener);
      listeners.set(event, handlers);
    }),
    off: vi.fn((event: string, listener: Listener) => listeners.get(event)?.delete(listener)),
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

describe("OceanScene input", () => {
  it("combines pointer and Space input and releases every pointer path", () => {
    const pointer = emitter();
    const keyboard = emitter();
    const controls = createOceanInput();
    controls.bind(pointer as never, keyboard as never);

    pointer.emit("pointerdown", { id: 1 });
    pointer.emit("pointerdown", { id: 2 });
    expect(controls.isHeld()).toBe(true);
    pointer.emit("pointerup", { id: 1 });
    expect(controls.isHeld()).toBe(true);
    pointer.emit("pointerupoutside", { id: 2 });
    expect(controls.isHeld()).toBe(false);

    keyboard.emit("keydown-SPACE");
    expect(controls.isHeld()).toBe(true);
    keyboard.emit("keyup-SPACE");
    expect(controls.isHeld()).toBe(false);
  });

  it("unbinds listeners and resets held state", () => {
    const pointer = emitter();
    const keyboard = emitter();
    const controls = createOceanInput();
    controls.bind(pointer as never, keyboard as never);
    pointer.emit("pointerdown", { id: 7 });
    keyboard.emit("keydown-SPACE");
    controls.reset();
    expect(controls.isHeld()).toBe(false);

    controls.unbind();
    pointer.emit("pointerdown", { id: 8 });
    keyboard.emit("keydown-SPACE");
    expect(controls.isHeld()).toBe(false);
    expect(pointer.off).toHaveBeenCalledTimes(3);
    expect(keyboard.off).toHaveBeenCalledTimes(2);
  });
});
