import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "./env";
import { app } from "./index";
import { describe, expect, it } from "vitest";

interface StoredPlayer {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(private readonly sql: string, private readonly players: StoredPlayer[]) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("INSERT INTO players")) {
      const [id, telegramUserId, telegramUsername, displayName, createdAt, updatedAt] = this.values as [
        string,
        string,
        string | null,
        string,
        string,
        string,
      ];
      const existing = this.players.find((player) => player.telegram_user_id === telegramUserId);
      if (existing) {
        existing.telegram_username = telegramUsername;
        existing.display_name = displayName;
        existing.updated_at = updatedAt;
      } else {
        this.players.push({ id, telegram_user_id: telegramUserId, telegram_username: telegramUsername, display_name: displayName, created_at: createdAt, updated_at: updatedAt });
      }
    }
    return { success: true };
  }

  async first<T>(): Promise<T | null> {
    const value = this.sql.includes("telegram_user_id = ?")
      ? this.players.find((player) => player.telegram_user_id === this.values[0])
      : this.players.find((player) => player.id === this.values[0]);
    return (value as T | undefined) ?? null;
  }
}

function createEnvironment(overrides: Partial<Env> = {}): Env {
  const players: StoredPlayer[] = [];
  const db = {
    prepare: (sql: string) => new FakeD1Statement(sql, players),
  } as unknown as D1Database;
  return {
    DB: db,
    TELEGRAM_BOT_TOKEN: "test-token",
    ENVIRONMENT: "development",
    DEV_AUTH_ENABLED: "true",
    APP_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}

describe("authentication routes", () => {
  it("keeps development auth gated behind the explicit local header", async () => {
    const response = await app.request(
      "/api/auth/dev",
      { method: "POST", body: JSON.stringify({ displayName: "Local tester" }), headers: { "Content-Type": "application/json" } },
      createEnvironment(),
    );

    expect(response.status).toBe(403);
  });

  it("creates a local player and resolves it through /api/me", async () => {
    const environment = createEnvironment();
    const response = await app.request(
      "/api/auth/dev",
      {
        method: "POST",
        body: JSON.stringify({ displayName: "Local tester" }),
        headers: { "Content-Type": "application/json", "X-Dev-Auth": "true" },
      },
      environment,
    );
    expect(response.status).toBe(200);
    const auth = (await response.json()) as { accessToken: string; player: { displayName: string } };
    expect(auth.player.displayName).toBe("Local tester");

    const me = await app.request("/api/me", { headers: { Authorization: `Bearer ${auth.accessToken}` } }, environment);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ player: { displayName: "Local tester" } });
  });

  it("never enables development auth in production", async () => {
    const response = await app.request(
      "/api/auth/dev",
      { method: "POST", headers: { "X-Dev-Auth": "true" } },
      createEnvironment({ ENVIRONMENT: "production" }),
    );

    expect(response.status).toBe(403);
  });

  it("never enables development auth in staging", async () => {
    const response = await app.request(
      "/api/auth/dev",
      { method: "POST", headers: { "X-Dev-Auth": "true" } },
      createEnvironment({ ENVIRONMENT: "staging" }),
    );

    expect(response.status).toBe(403);
  });
});
