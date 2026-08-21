import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const secretName = process.argv[2];
if (!secretName) {
  throw new Error("A Worker secret name is required.");
}

const secretValue = process.env[secretName];
if (!secretValue) {
  throw new Error(`${secretName} is not set in the environment.`);
}

const wrangler = "node_modules/.bin/wrangler";
if (!existsSync(wrangler)) {
  throw new Error("Dependencies are not installed. Run npm install first.");
}

const result = spawnSync(wrangler, ["secret", "put", secretName, "--env", "production"], {
  input: `${secretValue}\n`,
  stdio: ["pipe", "inherit", "inherit"],
  encoding: "utf8",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
