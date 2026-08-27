import { describe, expect, it, vi } from "vitest";
import { createTelegramLifecycle } from "./lifecycle";

function fakeStyle() {
  return { setProperty: vi.fn() };
}

describe("createTelegramLifecycle", () => {
  it("initializes Telegram once, publishes safe areas, filters unstable updates, and cleans up listeners", () => {
    const root = { style: fakeStyle() } as unknown as HTMLElement;
    const probe = {} as HTMLElement;
    const webAppListeners = new Map<string, (payload?: { isStateStable?: boolean }) => void>();
    const webApp = {
      initData: "opaque-init-data",
      ready: vi.fn(),
      expand: vi.fn(),
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      disableVerticalSwipes: vi.fn(),
      onEvent: vi.fn((event: string, handler: (payload?: { isStateStable?: boolean }) => void) => webAppListeners.set(event, handler)),
      offEvent: vi.fn(),
    } as unknown as TelegramWebApp;
    const viewportListeners = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const windowRef = {
      Telegram: { WebApp: webApp },
      visualViewport: viewportListeners,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const onSafeAreaChanged = vi.fn();
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (property: string) => ({
        "padding-top": "59px",
        "padding-right": "47px",
        "padding-bottom": "34px",
        "padding-left": "47px",
      })[property] ?? "",
    }));

    const lifecycle = createTelegramLifecycle({ target: root, safeAreaProbe: probe, windowRef, onSafeAreaChanged });
    expect(lifecycle.isAvailable).toBe(true);
    expect(lifecycle.initData).toBe("opaque-init-data");
    lifecycle.initialize();
    lifecycle.initialize();

    expect(webApp.ready).toHaveBeenCalledTimes(1);
    expect(webApp.expand).toHaveBeenCalledTimes(1);
    expect(webApp.onEvent).toHaveBeenCalledTimes(4);
    expect(windowRef.addEventListener).toHaveBeenCalledTimes(2);
    expect(viewportListeners.addEventListener).toHaveBeenCalledTimes(1);
    expect(onSafeAreaChanged).toHaveBeenCalledWith({ top: 59, right: 47, bottom: 34, left: 47 });
    expect(root.style.setProperty).toHaveBeenCalledWith("--tg-safe-area-inset-top", "0px");

    webAppListeners.get("viewportChanged")?.({ isStateStable: false });
    expect(onSafeAreaChanged).toHaveBeenCalledTimes(1);
    webAppListeners.get("viewportChanged")?.({ isStateStable: true });
    expect(onSafeAreaChanged).toHaveBeenCalledTimes(2);

    lifecycle.dispose();
    lifecycle.dispose();
    expect(webApp.offEvent).toHaveBeenCalledTimes(4);
    expect(windowRef.removeEventListener).toHaveBeenCalledTimes(2);
    expect(viewportListeners.removeEventListener).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
