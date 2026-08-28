import { describe, expect, it, vi } from "vitest";
import type { PurchaseRequest, SelectEquipmentRequest, StartFishingRequest } from "@fishing/shared/contracts";
import type { ApiClient } from "./client";
import { ApiClientError } from "./client";
import { AuthenticatedClient } from "./authenticated-client";

function fakeApi(overrides: Record<string, unknown>): ApiClient {
  return {
    hasSession: true,
    clearSession: vi.fn(),
    authenticateWithTelegram: vi.fn(),
    authenticateForDevelopment: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function expiredError(message = "expired"): ApiClientError {
  return new ApiClientError(message, 401, "SESSION_EXPIRED");
}

describe("AuthenticatedClient", () => {
  it("shares one recovery promise while retrying each original operation once", async () => {
    const recovery = deferred<unknown>();
    const state = { value: "state" };
    const collection = { value: "collection" };
    let stateAttempts = 0;
    let collectionAttempts = 0;
    const api = fakeApi({
      getGameState: vi.fn(async () => {
        stateAttempts += 1;
        if (stateAttempts === 1) throw expiredError();
        return state;
      }),
      getCollection: vi.fn(async () => {
        collectionAttempts += 1;
        if (collectionAttempts === 1) throw expiredError();
        return collection;
      }),
      authenticateForDevelopment: vi.fn(() => recovery.promise),
    });
    const onRecoveryStart = vi.fn();
    const client = new AuthenticatedClient({ api, isDevelopment: true, getTelegramInitData: () => "", onSessionRecoveryStart: onRecoveryStart });

    const stateRequest = client.getGameState();
    const collectionRequest = client.getCollection();
    await Promise.resolve();
    expect(api.authenticateForDevelopment).toHaveBeenCalledTimes(1);
    expect(onRecoveryStart).toHaveBeenCalledTimes(1);

    recovery.resolve({});
    await expect(stateRequest).resolves.toBe(state);
    await expect(collectionRequest).resolves.toBe(collection);
    expect(stateAttempts).toBe(2);
    expect(collectionAttempts).toBe(2);
    expect(api.clearSession).toHaveBeenCalledTimes(1);
  });

  it("does not loop after a second 401 and preserves non-401 errors", async () => {
    let attempts = 0;
    const second401 = expiredError("still expired");
    const upstreamError = new ApiClientError("another outage", 503, "UPSTREAM_FAILURE");
    const api = fakeApi({
      getJournal: vi.fn(async () => {
        attempts += 1;
        throw attempts === 1 ? expiredError() : second401;
      }),
      getLeaderboard: vi.fn(async () => {
        throw upstreamError;
      }),
      authenticateForDevelopment: vi.fn(async () => ({})),
    });
    const client = new AuthenticatedClient({ api, isDevelopment: true, getTelegramInitData: () => "" });

    await expect(client.getJournal()).rejects.toBe(second401);
    await expect(client.getLeaderboard()).rejects.toBe(upstreamError);
    expect(attempts).toBe(2);
    expect(api.authenticateForDevelopment).toHaveBeenCalledTimes(1);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("forwards existing payloads, signals, and typed response identities unchanged", async () => {
    const signal = new AbortController().signal;
    const startInput: StartFishingRequest = { locationId: "willow-pond", rodId: "starter-rod", lureId: "copper-spinner", baitId: "worm" };
    const purchaseInput: PurchaseRequest = { itemId: "worm", quantity: 3 };
    const selectInput: SelectEquipmentRequest = { lureId: "copper-spinner" };
    const responses = {
      state: { value: "state" },
      active: { value: "active" },
      encounter: { value: "encounter" },
      complete: { value: "complete" },
      decision: { value: "decision" },
      sale: { value: "sale" },
      collection: { value: "collection" },
      journal: { value: "journal" },
      leaderboard: { value: "leaderboard" },
      purchase: { value: "purchase" },
      select: { value: "select" },
      recovery: { value: "recovery" },
    };
    const api = fakeApi({
      getGameState: vi.fn(async () => responses.state),
      getActiveEncounter: vi.fn(async () => responses.active),
      startFishing: vi.fn(async () => responses.encounter),
      completeFishing: vi.fn(async () => responses.complete),
      decideCatch: vi.fn(async () => responses.decision),
      sellCatch: vi.fn(async () => responses.sale),
      getCollection: vi.fn(async () => responses.collection),
      getJournal: vi.fn(async () => responses.journal),
      getLeaderboard: vi.fn(async () => responses.leaderboard),
      purchase: vi.fn(async () => responses.purchase),
      selectEquipment: vi.fn(async () => responses.select),
      digForWorms: vi.fn(async () => responses.recovery),
    });
    const client = new AuthenticatedClient({ api, isDevelopment: true, getTelegramInitData: () => "" });

    await expect(client.getGameState(signal)).resolves.toBe(responses.state);
    await expect(client.getActiveEncounter(signal)).resolves.toBe(responses.active);
    await expect(client.startFishing(startInput)).resolves.toBe(responses.encounter);
    await expect(client.completeFishing("encounter-1", 0.75)).resolves.toBe(responses.complete);
    await expect(client.decideCatch("catch-1", "keep")).resolves.toBe(responses.decision);
    await expect(client.sellCatch("catch-1")).resolves.toBe(responses.sale);
    await expect(client.getCollection(signal)).resolves.toBe(responses.collection);
    await expect(client.getJournal(signal)).resolves.toBe(responses.journal);
    await expect(client.getLeaderboard(signal)).resolves.toBe(responses.leaderboard);
    await expect(client.purchase(purchaseInput)).resolves.toBe(responses.purchase);
    await expect(client.selectEquipment(selectInput)).resolves.toBe(responses.select);
    await expect(client.digForWorms()).resolves.toBe(responses.recovery);

    expect(api.getGameState).toHaveBeenCalledWith(signal);
    expect(api.getActiveEncounter).toHaveBeenCalledWith(signal);
    expect(api.startFishing).toHaveBeenCalledWith(startInput);
    expect(api.completeFishing).toHaveBeenCalledWith("encounter-1", 0.75);
    expect(api.decideCatch).toHaveBeenCalledWith("catch-1", "keep");
    expect(api.sellCatch).toHaveBeenCalledWith("catch-1");
    expect(api.getCollection).toHaveBeenCalledWith(signal);
    expect(api.getJournal).toHaveBeenCalledWith(signal);
    expect(api.getLeaderboard).toHaveBeenCalledWith(signal);
    expect(api.purchase).toHaveBeenCalledWith(purchaseInput);
    expect(api.selectEquipment).toHaveBeenCalledWith(selectInput);
    expect(api.digForWorms).toHaveBeenCalledTimes(1);
  });

  it("keeps an aborted read aborted through recovery and skips its retry", async () => {
    const recovery = deferred<unknown>();
    let attempts = 0;
    const api = fakeApi({
      getGameState: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw expiredError();
        return { value: "stale" };
      }),
      authenticateForDevelopment: vi.fn(() => recovery.promise),
    });
    const client = new AuthenticatedClient({ api, isDevelopment: true, getTelegramInitData: () => "" });
    const controller = new AbortController();
    const request = client.getGameState(controller.signal);
    await Promise.resolve();
    controller.abort();
    recovery.resolve({});

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts).toBe(1);
  });

  it("uses Telegram authentication when development auth is unavailable", async () => {
    const api = fakeApi({
      getGameState: vi.fn(async () => { throw expiredError(); }),
      authenticateWithTelegram: vi.fn(async () => ({})),
    });
    const client = new AuthenticatedClient({ api, isDevelopment: false, getTelegramInitData: () => "opaque-init-data" });

    await expect(client.getGameState()).rejects.toBeInstanceOf(ApiClientError);
    expect(api.authenticateWithTelegram).toHaveBeenCalledWith("opaque-init-data");
    expect(api.authenticateForDevelopment).not.toHaveBeenCalled();
  });
});
