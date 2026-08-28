import type {
  CatchDecision,
  CatchDecisionResponse,
  CompleteFishingResponse,
  FishingEncounterResponse,
} from "@fishing/shared/contracts";

export type EncounterPhase =
  | "booting"
  | "lobby"
  | "starting"
  | "fighting"
  | "resolving"
  | "result"
  | "deciding"
  | "decision-result"
  | "recoverable-error";

export interface EncounterError {
  operation: "bootstrap" | "start" | "completion" | "decision";
  message: string;
  encounterId?: string;
  catchId?: string;
}

export interface EncounterState {
  phase: EncounterPhase;
  encounter: FishingEncounterResponse | null;
  completionPerformance?: number;
  result: CompleteFishingResponse | null;
  pendingDecision?: CatchDecision;
  decision: CatchDecisionResponse | null;
  ambientReady: boolean;
  expired: boolean;
  error?: EncounterError;
}

export type EncounterEvent =
  | { type: "ACTIVE_ENCOUNTER_LIVE"; encounter: FishingEncounterResponse }
  | { type: "ACTIVE_ENCOUNTER_RECONCILED_LIVE"; encounter: FishingEncounterResponse }
  | { type: "ACTIVE_ENCOUNTER_EXPIRED" }
  | { type: "ACTIVE_ENCOUNTER_EMPTY" }
  | { type: "RESULT_RESTORED"; encounter: FishingEncounterResponse; result: CompleteFishingResponse }
  | { type: "DECISION_RESULT_RESTORED"; encounter: FishingEncounterResponse; result: CompleteFishingResponse; decision: CatchDecisionResponse }
  | { type: "BOOT_FAILED"; message: string }
  | { type: "BOOT_RETRY" }
  | { type: "START_REQUESTED" }
  | { type: "START_SUCCEEDED"; encounter: FishingEncounterResponse }
  | { type: "START_FAILED"; message: string }
  | { type: "COMPLETE_REQUESTED"; encounterId: string; performance: number }
  | { type: "COMPLETE_SUCCEEDED"; encounterId: string; result: CompleteFishingResponse }
  | { type: "COMPLETE_FAILED"; encounterId: string; message: string }
  | { type: "DECISION_REQUESTED"; decision: CatchDecision }
  | { type: "DECISION_SUCCEEDED"; catchId: string; result: CatchDecisionResponse }
  | { type: "DECISION_FAILED"; catchId: string; message: string }
  | { type: "PHASER_AMBIENT"; encounterId?: string }
  | { type: "RETRY"; ambientReady?: boolean }
  | { type: "RETURN_TO_LOBBY" };

export const initialEncounterState: EncounterState = {
  phase: "booting",
  encounter: null,
  result: null,
  decision: null,
  ambientReady: false,
  expired: false,
};

function lobby(expired = false): EncounterState {
  return {
    phase: "lobby",
    encounter: null,
    result: null,
    decision: null,
    ambientReady: true,
    expired,
  };
}

function recoverableError(state: EncounterState, error: EncounterError): EncounterState {
  return { ...state, phase: "recoverable-error", error };
}

function canRetry(state: EncounterState, operation: EncounterError["operation"]): boolean {
  return state.phase === "recoverable-error" && state.error?.operation === operation;
}

export function encounterReducer(state: EncounterState, event: EncounterEvent): EncounterState {
  switch (event.type) {
    case "ACTIVE_ENCOUNTER_LIVE":
      if (state.phase !== "booting") return state;
      return { ...state, phase: "fighting", encounter: event.encounter, ambientReady: false, expired: false, error: undefined };
    case "ACTIVE_ENCOUNTER_RECONCILED_LIVE":
      if (state.phase !== "resolving" && !canRetry(state, "completion")) return state;
      return {
        ...state,
        phase: "fighting",
        encounter: event.encounter,
        completionPerformance: undefined,
        result: null,
        decision: null,
        pendingDecision: undefined,
        ambientReady: false,
        expired: false,
        error: undefined,
      };
    case "ACTIVE_ENCOUNTER_EXPIRED":
      if (state.phase !== "booting") return state;
      return lobby(true);
    case "ACTIVE_ENCOUNTER_EMPTY":
      if (state.phase !== "booting") return state;
      return lobby();
    case "RESULT_RESTORED":
      if (state.phase !== "booting") return state;
      return {
        ...state,
        phase: "result",
        encounter: event.encounter,
        result: event.result,
        decision: null,
        pendingDecision: undefined,
        ambientReady: true,
        expired: false,
        error: undefined,
      };
    case "DECISION_RESULT_RESTORED":
      if (state.phase !== "booting") return state;
      return {
        ...state,
        phase: "decision-result",
        encounter: event.encounter,
        result: event.result,
        decision: event.decision,
        pendingDecision: undefined,
        ambientReady: true,
        expired: false,
        error: undefined,
      };
    case "BOOT_FAILED":
      if (state.phase !== "booting") return state;
      return recoverableError(state, { operation: "bootstrap", message: event.message });
    case "BOOT_RETRY":
      if (!canRetry(state, "bootstrap")) return state;
      return { ...initialEncounterState };
    case "START_REQUESTED":
      if (state.phase !== "lobby" && !canRetry(state, "start")) return state;
      return { ...state, phase: "starting", expired: false, error: undefined };
    case "START_SUCCEEDED":
      if (state.phase !== "starting" && state.phase !== "lobby" && !canRetry(state, "start")) return state;
      return { ...state, phase: "fighting", encounter: event.encounter, completionPerformance: undefined, result: null, decision: null, pendingDecision: undefined, ambientReady: false, error: undefined };
    case "START_FAILED":
      if (state.phase !== "starting") return state;
      return recoverableError(state, { operation: "start", message: event.message });
    case "COMPLETE_REQUESTED":
      if (state.phase !== "fighting" || state.encounter?.encounterId !== event.encounterId) return state;
      return { ...state, phase: "resolving", completionPerformance: event.performance, error: undefined };
    case "COMPLETE_SUCCEEDED":
      if (state.phase !== "resolving" || state.encounter?.encounterId !== event.encounterId) return state;
      return state.ambientReady
        ? { ...state, phase: "result", result: event.result, pendingDecision: undefined, error: undefined }
        : { ...state, result: event.result, pendingDecision: undefined, error: undefined };
    case "COMPLETE_FAILED":
      if (state.phase !== "resolving" || state.encounter?.encounterId !== event.encounterId) return state;
      return recoverableError(state, { operation: "completion", encounterId: event.encounterId, message: event.message });
    case "DECISION_REQUESTED":
      if (state.phase !== "result" || !state.result?.catch) return state;
      return { ...state, phase: "deciding", pendingDecision: event.decision, error: undefined };
    case "DECISION_SUCCEEDED":
      if (state.phase !== "deciding" || !state.result?.catch || state.result.catch.id !== event.catchId) return state;
      return { ...state, phase: "decision-result", decision: event.result, pendingDecision: undefined, error: undefined };
    case "DECISION_FAILED":
      if (state.phase !== "deciding" || !state.result?.catch || state.result.catch.id !== event.catchId) return state;
      return recoverableError(state, { operation: "decision", catchId: event.catchId, message: event.message });
    case "PHASER_AMBIENT":
      if (state.phase !== "resolving") return state;
      if (event.encounterId && state.encounter?.encounterId !== event.encounterId) return state;
      return state.result ? { ...state, phase: "result", ambientReady: true } : { ...state, ambientReady: true };
    case "RETRY":
      if (canRetry(state, "start")) return { ...state, phase: "starting", error: undefined };
      if (canRetry(state, "completion")) return { ...state, phase: "resolving", ambientReady: Boolean(event.ambientReady), error: undefined };
      if (canRetry(state, "decision")) return { ...state, phase: "deciding", error: undefined };
      return state;
    case "RETURN_TO_LOBBY":
      if (state.phase === "booting" || state.phase === "lobby") return state;
      return lobby();
  }
}
