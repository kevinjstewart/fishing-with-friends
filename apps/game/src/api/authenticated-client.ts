import type {
  ActiveFishingEncounterResponse,
  AuthResponse,
  CatchDecision,
  CatchDecisionResponse,
  CollectionResponse,
  CompleteFishingResponse,
  FishJournalResponse,
  FishingEncounterResponse,
  GameStateResponse,
  LeaderboardResponse,
  MeResponse,
  PurchaseRequest,
  PurchaseResponse,
  RecoveryResponse,
  SelectEquipmentRequest,
  SelectEquipmentResponse,
  SellCatchResponse,
  StartFishingRequest,
} from "@fishing/shared/contracts";
import { ApiClientError } from "./client";
import type { ApiClient } from "./client";

export interface AuthenticatedClientOptions {
  api: ApiClient;
  isDevelopment: boolean;
  getTelegramInitData: () => string;
  onSessionRecoveryStart?: () => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  throw error;
}

/**
 * Typed Worker transport with the only automatic session recovery boundary.
 * The low-level ApiClient remains responsible for request construction and
 * response/error shapes; this wrapper only decides whether to retry it.
 */
export class AuthenticatedClient {
  private recoveryPromise: Promise<void> | undefined;

  constructor(private readonly options: AuthenticatedClientOptions) {}

  get hasSession(): boolean {
    return this.options.api.hasSession;
  }

  clearSession(): void {
    this.options.api.clearSession();
  }

  authenticateWithTelegram(initData: string): Promise<AuthResponse> {
    return this.options.api.authenticateWithTelegram(initData);
  }

  authenticateForDevelopment(): Promise<AuthResponse> {
    return this.options.api.authenticateForDevelopment();
  }

  getMe(signal?: AbortSignal): Promise<MeResponse> {
    return this.withSessionRecovery(() => this.options.api.getMe(signal), signal);
  }

  getGameState(signal?: AbortSignal): Promise<GameStateResponse> {
    return this.withSessionRecovery(() => this.options.api.getGameState(signal), signal);
  }

  getActiveEncounter(signal?: AbortSignal): Promise<ActiveFishingEncounterResponse> {
    return this.withSessionRecovery(() => this.options.api.getActiveEncounter(signal), signal);
  }

  startFishing(input: StartFishingRequest): Promise<FishingEncounterResponse> {
    return this.withSessionRecovery(() => this.options.api.startFishing(input));
  }

  completeFishing(encounterId: string, performance: number): Promise<CompleteFishingResponse> {
    return this.withSessionRecovery(() => this.options.api.completeFishing(encounterId, performance));
  }

  decideCatch(catchId: string, decision: CatchDecision): Promise<CatchDecisionResponse> {
    return this.withSessionRecovery(() => this.options.api.decideCatch(catchId, decision));
  }

  sellCatch(catchId: string): Promise<SellCatchResponse> {
    return this.withSessionRecovery(() => this.options.api.sellCatch(catchId));
  }

  getCollection(signal?: AbortSignal): Promise<CollectionResponse> {
    return this.withSessionRecovery(() => this.options.api.getCollection(signal), signal);
  }

  getJournal(signal?: AbortSignal): Promise<FishJournalResponse> {
    return this.withSessionRecovery(() => this.options.api.getJournal(signal), signal);
  }

  getLeaderboard(signal?: AbortSignal): Promise<LeaderboardResponse> {
    return this.withSessionRecovery(() => this.options.api.getLeaderboard(signal), signal);
  }

  purchase(input: PurchaseRequest): Promise<PurchaseResponse> {
    return this.withSessionRecovery(() => this.options.api.purchase(input));
  }

  selectEquipment(input: SelectEquipmentRequest): Promise<SelectEquipmentResponse> {
    return this.withSessionRecovery(() => this.options.api.selectEquipment(input));
  }

  digForWorms(): Promise<RecoveryResponse> {
    return this.withSessionRecovery(() => this.options.api.digForWorms());
  }

  private async recoverSession(): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;
    this.recoveryPromise = (async () => {
      this.options.onSessionRecoveryStart?.();
      this.options.api.clearSession();
      const initData = this.options.getTelegramInitData();
      if (initData) {
        await this.options.api.authenticateWithTelegram(initData);
        return;
      }
      if (this.options.isDevelopment) {
        await this.options.api.authenticateForDevelopment();
        return;
      }
      throw new Error("Your session expired. Reopen the game from Telegram to sign in again.");
    })().finally(() => {
      this.recoveryPromise = undefined;
    });
    return this.recoveryPromise;
  }

  private async withSessionRecovery<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal);
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      throwIfAborted(signal);
      await this.recoverSession();
      throwIfAborted(signal);
      return operation();
    }
  }
}
