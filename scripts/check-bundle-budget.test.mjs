import assert from "node:assert/strict";
import test from "node:test";

import { evaluateBundleBudget } from "./check-bundle-budget.mjs";

const budget = {
  totalGameGzipBytes: 1000,
  phaserChunkGzipBytes: 700,
  applicationChunkGzipBytes: 200,
};

function report({ total = 900, phaser = 650, application = 180, separatePhaser = true } = {}) {
  return {
    total: { gzipBytes: total },
    roles: {
      phaserChunk: { gzipBytes: phaser, emittedAsSeparateChunk: separatePhaser },
      applicationChunk: { gzipBytes: application },
    },
  };
}

test("evaluates stable bundle roles without depending on hashed filenames", () => {
  const result = evaluateBundleBudget({
    ...report(),
    assets: [
      { file: "assets/index-a1b2c3.js", gzipBytes: 180 },
      { file: "assets/phaser-runtime-d4e5f6.js", gzipBytes: 650 },
    ],
  }, budget);

  assert.equal(result.passed, true);
  assert.deepEqual(result.measurements.map(({ id, actual, limit }) => ({ id, actual, limit })), [
    { id: "total-game-gzip", actual: 900, limit: 1000 },
    { id: "phaser-chunk-gzip", actual: 650, limit: 700 },
    { id: "application-chunk-gzip", actual: 180, limit: 200 },
  ]);
});

test("fails an intentional over-budget threshold fixture", () => {
  const result = evaluateBundleBudget(report({ total: 1001 }), budget);

  assert.equal(result.passed, false);
  assert.match(result.failures[0], /total game gzip is 1001 bytes/);
});

test("fails when Phaser is no longer a separate measured chunk", () => {
  const result = evaluateBundleBudget(report({ separatePhaser: false }), budget);

  assert.equal(result.passed, false);
  assert.match(result.failures.at(-1), /Phaser is not emitted as a separate chunk/);
});
