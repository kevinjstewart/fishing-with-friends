import type { FishingMiniGameConfig, MovementProfile } from "@fishing/shared";

export interface FishingState {
  elapsed: number;
  fishPosition: number;
  fishVelocity: number;
  fishTarget: number;
  nextTurnAt: number;
  netPosition: number;
  netVelocity: number;
  progress: number;
  insideSeconds: number;
  wasInside: boolean;
  result: "playing" | "caught" | "lost";
}

export interface FishingStep {
  state: FishingState;
  enteredNet: boolean;
  leftNet: boolean;
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createFishingState(random: () => number): FishingState {
  const fishPosition = 0.24 + random() * 0.24;
  return {
    elapsed: 0,
    fishPosition,
    fishVelocity: 0,
    fishTarget: 0.18 + random() * 0.64,
    nextTurnAt: 0.55 + random() * 0.45,
    netPosition: 0.72,
    netVelocity: 0,
    progress: 0.28,
    insideSeconds: 0,
    wasInside: false,
    result: "playing",
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function stepFishing(
  previous: FishingState,
  held: boolean,
  deltaSeconds: number,
  config: FishingMiniGameConfig,
  profile: MovementProfile,
  random: () => number,
): FishingStep {
  if (previous.result !== "playing") return { state: previous, enteredNet: false, leftNet: false };

  // Clamp long frames so backgrounding a Telegram webview cannot decide a catch.
  const delta = clamp(deltaSeconds, 0, 1 / 20);
  const state = { ...previous, elapsed: previous.elapsed + delta };

  if (state.elapsed >= state.nextTurnAt) {
    const edgeBias = state.fishPosition < 0.25 ? 0.4 : state.fishPosition > 0.75 ? -0.4 : 0;
    state.fishTarget = clamp(0.12 + random() * 0.76 + edgeBias * random(), 0.08, 0.92);
    const turnRate = 0.48 + profile.directionChangeFrequency * 0.9;
    state.nextTurnAt = state.elapsed + (0.52 + random() * 0.9) / turnRate;
    state.fishVelocity += (random() - 0.5) * profile.acceleration * 0.42;
  }

  const fishPull = (state.fishTarget - state.fishPosition) * (1.5 + profile.acceleration * 2.2);
  const fishDamping = Math.pow(0.12 + profile.unpredictability * 0.1, delta);
  state.fishVelocity = state.fishVelocity * fishDamping + fishPull * delta;
  const maxFishSpeed = 0.24 + profile.speed * 0.62;
  state.fishVelocity = clamp(state.fishVelocity, -maxFishSpeed, maxFishSpeed);
  state.fishPosition += state.fishVelocity * delta;
  if (state.fishPosition < 0.07 || state.fishPosition > 0.93) {
    state.fishPosition = clamp(state.fishPosition, 0.07, 0.93);
    state.fishVelocity *= -0.48;
    state.fishTarget = 1 - state.fishPosition;
  }

  // A little inertia makes the net tactile, while strong damping keeps it precise.
  const netAcceleration = held ? -2.55 : 1.72;
  state.netVelocity = (state.netVelocity + netAcceleration * delta) * Math.pow(0.045, delta);
  state.netVelocity = clamp(state.netVelocity, -0.82, 0.72);
  state.netPosition += state.netVelocity * delta;
  if (state.netPosition < 0.06 || state.netPosition > 0.94) {
    state.netPosition = clamp(state.netPosition, 0.06, 0.94);
    state.netVelocity *= -0.18;
  }

  // Give the illustrated fish a small body radius, so edge catches feel fair.
  const inside = Math.abs(state.fishPosition - state.netPosition) <= config.catchZoneSize / 2 + 0.018;
  if (inside) {
    state.insideSeconds += delta;
    const focusBonus = state.progress > 0.72 ? 0.9 : 1;
    state.progress += config.catchMeterGainRate * focusBonus * delta;
  } else {
    const earlyGrace = state.elapsed < 0.65 ? 0.22 : 1;
    state.progress -= config.catchMeterLossRate * earlyGrace * delta;
  }
  state.progress = clamp(state.progress, 0, 1);
  if (state.progress >= 1) state.result = "caught";
  else if (state.progress <= 0 || state.elapsed >= config.durationSeconds) state.result = "lost";

  return {
    state,
    enteredNet: inside && !previous.wasInside,
    leftNet: !inside && previous.wasInside,
  };
}

export function performanceFor(state: FishingState): number {
  if (state.result === "caught") return 1;
  const tracking = state.insideSeconds / Math.max(state.elapsed, 0.1);
  return clamp(tracking * 0.7 + state.progress * 0.3, 0, 0.74);
}
