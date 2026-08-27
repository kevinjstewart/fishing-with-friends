/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActiveFishingEncounterResponse, AuthResponse, GameStateResponse, MeResponse, PlayerProfile } from "@fishing/shared/contracts";
import { createAppQueryClient } from "../api/query-client";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { mountReactApp } from "./mount";
import type { ReactAppServices } from "./react-services";

const player: PlayerProfile = {
  id: "player-1",
  telegramUsername: "local_developer",
  displayName: "Local developer",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const gameState = { coins: 123, activeEquipment: {}, inventory: {}, locations: [], catalog: {} } as unknown as GameStateResponse;
const activeEncounter: ActiveFishingEncounterResponse = { encounter: null, expired: false };

function createServices(overrides: Partial<ReactAppServices["api"]> = {}): ReactAppServices {
  const api = Object.assign({
    hasSession: false,
    getMe: vi.fn<(...args: [AbortSignal?]) => Promise<MeResponse>>(),
    authenticateWithTelegram: vi.fn<(...args: [string]) => Promise<AuthResponse>>(),
    authenticateForDevelopment: vi.fn<() => Promise<AuthResponse>>(),
    getGameState: vi.fn<(...args: [AbortSignal?]) => Promise<GameStateResponse>>(),
    getActiveEncounter: vi.fn<(...args: [AbortSignal?]) => Promise<ActiveFishingEncounterResponse>>(),
  }, overrides);
  api.authenticateForDevelopment.mockResolvedValue({ accessToken: "token", expiresAt: "2026-01-02T00:00:00.000Z", player });
  api.getGameState.mockResolvedValue(gameState);
  api.getActiveEncounter.mockResolvedValue(activeEncounter);

  return {
    api,
    isDevelopment: true,
    telegram: {
      isAvailable: false,
      initData: "",
      initialize: vi.fn(),
      syncViewportInsets: vi.fn(),
      dispose: vi.fn(),
    },
    runtime: {
      setSafeArea: vi.fn(),
      startFight: vi.fn(),
      returnToLobby: vi.fn(async () => {}),
      onComplete: vi.fn(() => () => {}),
      onAmbient: vi.fn(() => () => {}),
      destroy: vi.fn(),
      emitCompleteForTest: vi.fn(),
    },
  } as ReactAppServices;
}

function renderApp(services: ReactAppServices) {
  return render(
    <AppProviders queryClient={createAppQueryClient()}>
      <App services={services} />
    </AppProviders>,
  );
}

describe("React migration shell", () => {
  it("renders a deterministic loading state and passes query abort signals to the transport", async () => {
    let resolveAuth: ((response: AuthResponse) => void) | undefined;
    const services = createServices();
    services.api.authenticateForDevelopment = vi.fn(
      () => new Promise<AuthResponse>((resolve) => {
        resolveAuth = resolve;
      }),
    );
    let gameStateSignal: AbortSignal | undefined;
    services.api.getGameState = vi.fn(async (signal?: AbortSignal) => {
      gameStateSignal = signal;
      return gameState;
    });

    renderApp(services);
    expect(screen.getByTestId("react-bootstrap-loading")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");

    resolveAuth?.({ accessToken: "token", expiresAt: "2026-01-02T00:00:00.000Z", player });
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());
    expect(gameStateSignal).toBeInstanceOf(AbortSignal);
    expect(services.api.getActiveEncounter).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
  });

  it("renders authenticated success data and exposes the active-encounter result", async () => {
    const services = createServices();
    services.api.getActiveEncounter = vi.fn(async () => ({ encounter: null, expired: true }));

    renderApp(services);
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());

    expect(screen.getByText("123")).toBeInTheDocument();
    expect(services.api.getActiveEncounter).toHaveBeenCalledTimes(1);
  });

  it("renders a recoverable bootstrap failure and retries only after user input", async () => {
    const services = createServices();
    const authenticateForDevelopment = vi
      .fn<() => Promise<AuthResponse>>()
      .mockRejectedValueOnce(new Error("Worker unavailable."))
      .mockResolvedValue({ accessToken: "token", expiresAt: "2026-01-02T00:00:00.000Z", player });
    services.api.authenticateForDevelopment = authenticateForDevelopment;

    renderApp(services);
    await waitFor(() => expect(screen.getByTestId("react-bootstrap-error")).toBeInTheDocument());
    expect(screen.getByText("Worker unavailable.")).toBeInTheDocument();
    expect(authenticateForDevelopment).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());
    expect(authenticateForDevelopment).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed bootstrap query until the user requests it", async () => {
    const services = createServices();
    let gameStateAttempts = 0;
    services.api.getGameState = vi.fn(async () => {
      gameStateAttempts += 1;
      if (gameStateAttempts === 1) throw new Error("Game state unavailable.");
      return gameState;
    });

    renderApp(services);
    await waitFor(() => expect(screen.getByTestId("react-bootstrap-error")).toBeInTheDocument());
    expect(gameStateAttempts).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());
    expect(gameStateAttempts).toBe(2);
  });

  it("disables automatic query and mutation retries for the migration client", () => {
    const queryClient = createAppQueryClient();
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("cleans up Telegram and Phaser listeners on unmount and does not create duplicate React content", async () => {
    const services = createServices();
    const { unmount } = renderApp(services);
    await waitFor(() => expect(screen.getByTestId("react-app-shell")).toBeInTheDocument());

    expect(document.querySelectorAll("[data-testid=react-app-shell]")).toHaveLength(1);
    expect(services.telegram.initialize).toHaveBeenCalledTimes(1);
    expect(services.runtime.onComplete).toHaveBeenCalledTimes(1);
    expect(services.runtime.onAmbient).toHaveBeenCalledTimes(1);

    unmount();
    expect(services.telegram.dispose).toHaveBeenCalledTimes(1);
    expect(services.runtime.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps one root during duplicate mounting and cleans up before remounting", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const firstServices = createServices();
    const firstMount = mountReactApp(host, firstServices);

    expect(mountReactApp(host, firstServices)).toBe(firstMount);
    await waitFor(() => expect(host.querySelector("[data-testid=react-app-shell]")).toBeInTheDocument());
    expect(host.querySelectorAll("[data-testid=react-app-shell]")).toHaveLength(1);
    expect(firstServices.telegram.initialize).toHaveBeenCalledTimes(1);
    expect(firstServices.runtime.onComplete).toHaveBeenCalledTimes(1);

    firstMount.unmount();
    expect(host.querySelectorAll("[data-testid=react-app-shell]")).toHaveLength(0);
    expect(firstServices.telegram.dispose).toHaveBeenCalledTimes(1);
    expect(firstServices.runtime.destroy).toHaveBeenCalledTimes(1);

    const secondServices = createServices();
    const secondMount = mountReactApp(host, secondServices);
    await waitFor(() => expect(host.querySelector("[data-testid=react-app-shell]")).toBeInTheDocument());
    expect(host.querySelectorAll("[data-testid=react-app-shell]")).toHaveLength(1);
    expect(secondServices.telegram.initialize).toHaveBeenCalledTimes(1);
    expect(secondServices.runtime.onAmbient).toHaveBeenCalledTimes(1);

    secondMount.unmount();
    host.remove();
  });
});
