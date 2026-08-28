import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import type { ReactAppServices } from "./react-services";

export interface ReactAppMount {
  root: Root;
  unmount(): void;
}

const activeMounts = new WeakMap<HTMLElement, ReactAppMount>();

export function mountReactApp(rootElement: HTMLElement, services: ReactAppServices): ReactAppMount {
  const existing = activeMounts.get(rootElement);
  if (existing) return existing;

  const root = createRoot(rootElement);
  let mounted = true;
  const mount: ReactAppMount = {
    root,
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      activeMounts.delete(rootElement);
    },
  };
  activeMounts.set(rootElement, mount);
  root.render(
    <AppProviders>
      <App services={services} />
    </AppProviders>,
  );
  return mount;
}

export function unmountReactApp(rootElement: HTMLElement): void {
  activeMounts.get(rootElement)?.unmount();
}
