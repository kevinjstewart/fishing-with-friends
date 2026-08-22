import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const secretName = process.argv[2];
const workerEnvironment = process.argv[3] ?? "production";
const sourceEnvironmentVariable = process.argv[4] ?? secretName;
const wranglerConfig = process.argv[5];
if (!secretName) {
  throw new Error("A Worker secret name is required.");
}

const secretValue = process.env[sourceEnvironmentVariable];
if (!secretValue) {
  throw new Error(`${sourceEnvironmentVariable} is not set in the environment.`);
}

const wrangler = "node_modules/.bin/wrangler";
if (!existsSync(wrangler)) {
  throw new Error("Dependencies are not installed. Run npm install first.");
}

const args = ["secret", "put", secretName, "--env", workerEnvironment];
if (wranglerConfig) {
  args.push("--config", wranglerConfig);
}

const result = spawnSync(wrangler, args, {
  input: `${secretValue}\n`,
  stdio: ["pipe", "inherit", "inherit"],
  encoding: "utf8",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
