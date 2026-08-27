import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { build } from "vite";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gameSourceDirectory = join(repoRoot, "apps/game/src");
const gameDistDirectory = resolve(process.env.GAME_DIST_DIR ?? "apps/game/dist");
const catalogMarkers = [
  "Wind-driven current funnels baitfish",
  "A vast northern reach of cold open water",
  "Trophy fish and open-water runs",
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

async function buildProbe(entry) {
  const result = await build({
    configFile: false,
    root: repoRoot,
    logLevel: "error",
    build: {
      minify: false,
      target: "es2022",
      write: false,
      rollupOptions: {
        input: entry,
        preserveEntrySignatures: "strict",
        output: { format: "es" },
      },
    },
  });
  const outputs = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
  return outputs
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
}

const sourceFiles = await collectFiles(gameSourceDirectory);
const productionSource = sourceFiles.filter((file) => !/\.test\.[^.]+$/.test(file));
const productionSourceText = await Promise.all(productionSource.map((file) => readFile(file, "utf8"))).then((contents) => contents.join("\n"));
const rootImports = productionSourceText.match(/@fishing\/shared["']/g) ?? [];
const productionCatalogImports = productionSourceText.match(/@fishing\/shared\/catalog["']/g) ?? [];

if (rootImports.length > 0) {
  throw new Error(`Production game source still imports the shared root barrel (${rootImports.length} match(es)).`);
}
if (productionCatalogImports.length > 0) {
  throw new Error(`Production game source imports the catalogue subpath (${productionCatalogImports.length} match(es)).`);
}

const distFiles = await collectFiles(gameDistDirectory);
const distText = await Promise.all(distFiles.map((file) => readFile(file, "utf8"))).then((contents) => contents.join("\n"));
const emittedCatalogMarkers = catalogMarkers.filter((marker) => distText.includes(marker));
if (emittedCatalogMarkers.length > 0) {
  throw new Error(`The production game bundle contains catalogue markers: ${emittedCatalogMarkers.join(", ")}.`);
}

const contractsProbe = await buildProbe(join(repoRoot, "scripts/fixtures/shared-contracts-entry.ts"));
const catalogProbe = await buildProbe(join(repoRoot, "scripts/fixtures/shared-catalog-entry.ts"));
const deliberateCatalogMarkers = catalogMarkers.filter((marker) => catalogProbe.includes(marker));
if (!contractsProbe.includes("rodRiskBandForWeight")) {
  throw new Error("The contracts/risk subpath probe did not retain its deliberate risk import.");
}
if (deliberateCatalogMarkers.length === 0) {
  throw new Error("The deliberate catalogue subpath probe did not retain catalogue data.");
}

console.log("Shared package bundle checks passed.");
console.log(`Production game source imports shared subpaths only; catalogue imports: ${productionCatalogImports.length}.`);
console.log(`Production game bundle catalogue markers: none (${catalogMarkers.join(", ")}).`);
console.log("Deliberate contracts/risk probe retained its risk code.");
console.log(`Deliberate catalogue probe retained: ${deliberateCatalogMarkers.join(", ")}.`);
