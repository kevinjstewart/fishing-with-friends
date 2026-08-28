import { gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const distDirectory = resolve(process.env.GAME_DIST_DIR ?? "apps/game/dist/client");
const artifactDirectory = resolve(process.env.BROWSER_ARTIFACT_DIR ?? "/private/tmp/fishing-with-friends-browser");
const reportPath = resolve(process.env.BUNDLE_REPORT_PATH ?? join(artifactDirectory, "bundle-report.json"));
const markdownPath = resolve(process.env.BUNDLE_REPORT_MARKDOWN_PATH ?? reportPath.replace(/\.json$/i, ".md"));

function sizeFor(content) {
  return {
    minifiedBytes: content.byteLength,
    gzipBytes: gzipSync(content, { level: 9 }).byteLength,
  };
}

function sumSizes(files) {
  return files.reduce((total, file) => ({
    minifiedBytes: total.minifiedBytes + file.minifiedBytes,
    gzipBytes: total.gzipBytes + file.gzipBytes,
  }), { minifiedBytes: 0, gzipBytes: 0 });
}

async function collectFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath));
      continue;
    }
    if (!/[.](?:js|css|html)$/i.test(entry.name)) continue;
    const content = await readFile(absolutePath);
    const size = sizeFor(content);
    files.push({ file: relativePath, type: extname(entry.name).slice(1), ...size, content: content.toString("utf8") });
  }
  return files;
}

function withoutContent(file) {
  const copy = { ...file };
  delete copy.content;
  return copy;
}

const files = await collectFiles(distDirectory);
const assets = files.map(withoutContent);
const javascript = files.filter((file) => file.type === "js");
const css = files.filter((file) => file.type === "css");
const html = files.filter((file) => file.type === "html");
const phaserFiles = javascript.filter((file) => /phaser/i.test(file.file) || /(?:Phaser|SceneManager|WebGLRenderer|CanvasRenderer)/.test(file.content));
const entryFiles = javascript.filter((file) => /(?:^|[/])index(?:-[^/]+)?\.js$/i.test(file.file));
const applicationRoleFiles = entryFiles.length > 0 ? entryFiles : javascript.filter((file) => /(?:^|[/])index[-.]/i.test(basename(file.file)));
const noninitialScreenFiles = javascript.filter((file) => !applicationRoleFiles.includes(file) && !phaserFiles.includes(file));
const phaserRoleFiles = phaserFiles.length > 0 ? phaserFiles : applicationRoleFiles;
const total = sumSizes(assets);
const totalGzipOfConcatenated = sizeFor(Buffer.concat(await Promise.all(files.map(async (file) => readFile(join(distDirectory, file.file))))));
const catalogueMarkers = [
  "Wind-driven current funnels baitfish",
  "A vast northern reach of cold open water",
  "Trophy fish and open-water runs",
];
const catalogueMarkersFound = catalogueMarkers.filter((marker) => files.some((file) => file.content.includes(marker)));

const report = {
  generatedAt: new Date().toISOString(),
  distDirectory,
  assets,
  javascriptChunks: javascript.map(withoutContent),
  cssAssets: css.map(withoutContent),
  htmlAssets: html.map(withoutContent),
  total: {
    ...total,
    gzipOfConcatenatedAssetsBytes: totalGzipOfConcatenated.gzipBytes,
  },
  roles: {
    applicationChunk: {
      emitted: applicationRoleFiles.length > 0,
      files: applicationRoleFiles.map(withoutContent),
      ...sumSizes(applicationRoleFiles),
    },
    phaserChunk: {
      emittedAsSeparateChunk: phaserFiles.length > 0 && phaserFiles.some((file) => !applicationRoleFiles.includes(file)),
      files: phaserRoleFiles.map(withoutContent),
      ...sumSizes(phaserRoleFiles),
      note: phaserFiles.length > 0 && phaserFiles.some((file) => !applicationRoleFiles.includes(file))
        ? "Phaser is emitted in a separate chunk."
        : "Phaser is inlined in the application chunk; this role intentionally overlaps applicationChunk for baseline attribution.",
    },
    noninitialScreenChunks: {
      emitted: noninitialScreenFiles.length > 0,
      files: noninitialScreenFiles.map(withoutContent),
      ...sumSizes(noninitialScreenFiles),
      note: noninitialScreenFiles.length > 0
        ? "Noninitial feature code is emitted outside the application entry chunk."
        : "No noninitial feature chunks were emitted.",
    },
  },
  sharedPackage: {
    catalogueIncluded: catalogueMarkersFound.length > 0,
    catalogueMarkers,
    catalogueMarkersFound,
  },
};

await stat(distDirectory);
await mkdir(resolve(reportPath, ".."), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
const markdown = [
  "# Game bundle report",
  "",
  `Generated from \`${distDirectory}\`.`,
  "",
  "| Scope | Minified | Gzip |",
  "| --- | ---: | ---: |",
  `| Total emitted assets | ${kb(total.minifiedBytes)} | ${kb(total.gzipBytes)} |`,
  `| Total concatenated gzip reference | ${kb(totalGzipOfConcatenated.minifiedBytes)} | ${kb(totalGzipOfConcatenated.gzipBytes)} |`,
  `| Application chunk role | ${kb(report.roles.applicationChunk.minifiedBytes)} | ${kb(report.roles.applicationChunk.gzipBytes)} |`,
  `| Phaser chunk role | ${kb(report.roles.phaserChunk.minifiedBytes)} | ${kb(report.roles.phaserChunk.gzipBytes)} |`,
  `| Noninitial feature chunks | ${kb(report.roles.noninitialScreenChunks.minifiedBytes)} | ${kb(report.roles.noninitialScreenChunks.gzipBytes)} |`,
  "",
  "## Shared package scope",
  "",
  `Catalogue included in production bundle: **${report.sharedPackage.catalogueIncluded ? "yes" : "no"}**.`,
  `Markers scanned: ${catalogueMarkers.join(", ")}.`,
  report.sharedPackage.catalogueIncluded ? `Markers found: ${catalogueMarkersFound.join(", ")}.` : "No catalogue markers found.",
  "",
  "## Emitted chunks",
  "",
  "| File | Type | Minified | Gzip |",
  "| --- | --- | ---: | ---: |",
  ...assets.map((asset) => `| \`${asset.file}\` | ${asset.type} | ${kb(asset.minifiedBytes)} | ${kb(asset.gzipBytes)} |`),
  "",
  `Phaser role: ${report.roles.phaserChunk.note}`,
  `Noninitial feature role: ${report.roles.noninitialScreenChunks.note}`,
  "",
].join("\n");
await writeFile(markdownPath, markdown);

console.log(markdown.trim());
console.log(`\nJSON report: ${reportPath}`);
console.log(`Markdown report: ${markdownPath}`);
