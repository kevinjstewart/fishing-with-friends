import { describe, expect, it } from "vitest";
import { createFishingState, performanceFor, seededRandom, stepFishing } from "./fishing-mechanics";

const config = { catchZoneSize: 0.28, catchMeterGainRate: 0.6, catchMeterLossRate: 0.4, durationSeconds: 12 };
const profile = { speed: 0.4, acceleration: 0.4, directionChangeFrequency: 0.4, unpredictability: 0.3, fightDurationSeconds: 15 };

describe("fishing mechanics", () => {
  it("produces repeatable fish movement for an encounter seed", () => {
    const firstRandom = seededRandom(1234);
    const secondRandom = seededRandom(1234);
    let first = createFishingState(firstRandom);
    let second = createFishingState(secondRandom);
    for (let frame = 0; frame < 120; frame += 1) {
      first = stepFishing(first, frame % 30 < 12, 1 / 60, config, profile, firstRandom).state;
      second = stepFishing(second, frame % 30 < 12, 1 / 60, config, profile, secondRandom).state;
    }
    expect(second).toEqual(first);
  });

  it("clamps long frames so app suspension cannot resolve the encounter", () => {
    const random = seededRandom(7);
    const state = createFishingState(random);
    const next = stepFishing(state, false, 5, config, profile, random).state;
    expect(next.elapsed).toBeCloseTo(0.05);
    expect(next.result).toBe("playing");
  });

  it("always reports a decisive success when the catch meter fills", () => {
    const random = seededRandom(9);
    const state = { ...createFishingState(random), progress: 0.999, fishPosition: 0.5, netPosition: 0.5 };
    const caught = stepFishing(state, false, 1 / 30, config, profile, random).state;
    expect(caught.result).toBe("caught");
    expect(performanceFor(caught)).toBe(1);
  });

  it("does not let a failed round report a perfect score", () => {
    const state = { ...createFishingState(seededRandom(1)), elapsed: 12, progress: 0.8, insideSeconds: 9, result: "lost" as const };
    expect(performanceFor(state)).toBeLessThanOrEqual(0.74);
  });
});
