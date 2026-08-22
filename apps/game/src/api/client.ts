import type {
  AuthResponse,
  CatchDecision,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  ErrorResponse,
  FishJournalResponse,
  FishingEncounterResponse,
  GameStateResponse,
  MeResponse,
  PurchaseRequest,
  PurchaseResponse,
  RecoveryResponse,
  SellCatchResponse,
  SelectEquipmentRequest,
  SelectEquipmentResponse,
  StartFishingRequest,
  TelegramAuthRequest,
} from "@fishing/shared";

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

  async getGameState(): Promise<GameStateResponse> {
    return this.request<GameStateResponse>("/api/game/state");
  }

  async startFishing(input: StartFishingRequest): Promise<FishingEncounterResponse> {
    return this.request<FishingEncounterResponse>("/api/game/encounters", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
    });
  }

  async completeFishing(encounterId: string, performance: number): Promise<CompleteFishingResponse> {
    return this.request<CompleteFishingResponse>(`/api/game/encounters/${encodeURIComponent(encounterId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ performance }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async decideCatch(catchId: string, decision: CatchDecision): Promise<CatchDecisionResponse> {
    return this.request<CatchDecisionResponse>(`/api/game/catches/${encodeURIComponent(catchId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async sellCatch(catchId: string): Promise<SellCatchResponse> {
    return this.request<SellCatchResponse>(`/api/game/catches/${encodeURIComponent(catchId)}/sell`, { method: "POST" });
  }

  async getCollection(): Promise<CollectionResponse> {
    return this.request<CollectionResponse>("/api/game/collection");
  }

  async getJournal(): Promise<FishJournalResponse> {
    return this.request<FishJournalResponse>("/api/game/journal");
  }

  async purchase(input: PurchaseRequest): Promise<PurchaseResponse> {
    return this.request<PurchaseResponse>("/api/game/shop/purchase", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
    });
  }

  async selectEquipment(input: SelectEquipmentRequest): Promise<SelectEquipmentResponse> {
    return this.request<SelectEquipmentResponse>("/api/game/equipment/select", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
    });
  }

  async digForWorms(): Promise<RecoveryResponse> {
    return this.request<RecoveryResponse>("/api/game/recovery/dig-worms", { method: "POST" });
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
