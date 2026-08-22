import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseId = process.env.STAGING_D1_DATABASE_ID?.trim();
if (!databaseId) {
  throw new Error("STAGING_D1_DATABASE_ID is required to generate the staging Wrangler config.");
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error("STAGING_D1_DATABASE_ID must be a valid UUID.");
}

const sourcePath = resolve("wrangler.jsonc");
const outputPath = resolve(".wrangler.staging.jsonc");
const config = JSON.parse(await readFile(sourcePath, "utf8"));
const productionDatabaseId = config.env?.production?.d1_databases?.[0]?.database_id;
if (databaseId === productionDatabaseId) {
  throw new Error("Staging must use a different D1 database from production.");
}

const stagingOrigin = process.env.STAGING_APP_ORIGIN?.trim()
  || "https://fishing-with-friends-staging.fishing-with-friends.workers.dev";
const stagingDatabaseName = "fishing-with-friends-staging";

config.env = {
  ...config.env,
  staging: {
    name: "fishing-with-friends-staging",
    vars: {
      ENVIRONMENT: "staging",
      APP_ORIGIN: stagingOrigin,
      SESSION_TTL_SECONDS: "86400",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: stagingDatabaseName,
        database_id: databaseId,
        migrations_dir: "migrations",
      },
    ],
  },
};

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Generated ${outputPath} for ${stagingDatabaseName}.`);
