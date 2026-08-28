import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultBudgetPath = "bundle-budget.json";
const defaultReportPath = "/private/tmp/fishing-with-friends-browser/bundle-report.json";

function metric(id, label, actual, limit) {
  return { id, label, actual, limit };
}

export function evaluateBundleBudget(report, budget) {
  const measurements = [
    metric("total-game-gzip", "total game gzip", report.total?.gzipBytes, budget.totalGameGzipBytes),
    metric("phaser-chunk-gzip", "Phaser chunk gzip", report.roles?.phaserChunk?.gzipBytes, budget.phaserChunkGzipBytes),
    metric("application-chunk-gzip", "application chunk gzip", report.roles?.applicationChunk?.gzipBytes, budget.applicationChunkGzipBytes),
  ];
  const failures = measurements.flatMap((measurement) => {
    if (!Number.isInteger(measurement.actual)) {
      return [`${measurement.label} measurement is missing from the bundle report`];
    }
    if (!Number.isInteger(measurement.limit)) {
      return [`${measurement.label} budget is missing or invalid`];
    }
    return measurement.actual > measurement.limit
      ? [`${measurement.label} is ${measurement.actual} bytes, over the ${measurement.limit}-byte budget`]
      : [];
  });

  if (report.roles?.phaserChunk?.emittedAsSeparateChunk !== true) {
    failures.push("Phaser is not emitted as a separate chunk; the Phaser budget cannot be evaluated");
  }

  return { passed: failures.length === 0, measurements, failures };
}

function formatBytes(bytes) {
  return `${bytes} bytes (${(bytes / 1024).toFixed(2)} KiB)`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const reportPath = resolve(process.env.BUNDLE_REPORT_PATH ?? defaultReportPath);
  const budgetPath = resolve(process.env.BUNDLE_BUDGET_PATH ?? defaultBudgetPath);
  const [report, budget] = await Promise.all([readJson(reportPath), readJson(budgetPath)]);
  const result = evaluateBundleBudget(report, budget);

  console.log(`Bundle budget report: ${reportPath}`);
  for (const measurement of result.measurements) {
    const actual = Number.isInteger(measurement.actual) ? formatBytes(measurement.actual) : "missing";
    const limit = Number.isInteger(measurement.limit) ? formatBytes(measurement.limit) : "invalid";
    console.log(`${result.failures.some((failure) => failure.startsWith(measurement.label)) ? "FAIL" : "PASS"}  ${measurement.label}: ${actual} / ${limit}`);
  }

  if (!result.passed) {
    for (const failure of result.failures) console.error(`::error::${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("Bundle budgets passed.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`::error::Unable to check bundle budget: ${error.message}`);
    process.exitCode = 1;
  });
}
