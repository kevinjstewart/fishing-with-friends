import type { AuthResponse, ErrorResponse, MeResponse, TelegramAuthRequest } from "@fishing/shared";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ApiClient {
  private static readonly sessionStorageKey = "fishing-with-friends.session";
  private readonly baseUrl: string;
  private accessToken: string | null;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.accessToken = sessionStorage.getItem(ApiClient.sessionStorageKey);
  }

  get hasSession(): boolean {
    return Boolean(this.accessToken);
  }

  clearSession(): void {
    this.accessToken = null;
    sessionStorage.removeItem(ApiClient.sessionStorageKey);
  }

  async authenticateWithTelegram(initData: string): Promise<AuthResponse> {
    return this.authenticate<TelegramAuthRequest>("/api/auth/telegram", { initData });
  }

  async authenticateForDevelopment(): Promise<AuthResponse> {
    return this.authenticate("/api/auth/dev", {}, { "X-Dev-Auth": "true" });
  }

  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>("/api/me");
  }

  private async authenticate<TBody>(path: string, body: TBody, extraHeaders: Record<string, string> = {}): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
    this.accessToken = response.accessToken;
    sessionStorage.setItem(ApiClient.sessionStorageKey, response.accessToken);
    return response;
  }

  private async request<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      let errorBody: ErrorResponse | undefined;
      try {
        errorBody = (await response.json()) as ErrorResponse;
      } catch {
        // Keep the transport error useful even if the server did not return JSON.
      }
      throw new ApiClientError(errorBody?.error.message ?? `Request failed with status ${response.status}.`, response.status, errorBody?.error.code);
    }
    return (await response.json()) as TResponse;
  }
}
