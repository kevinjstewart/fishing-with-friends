import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const configuredWorkerConfigPath = process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH?.trim();
const workerConfigPath = resolve(repositoryRoot, configuredWorkerConfigPath ?? "wrangler.jsonc");
const localStatePath = resolve(repositoryRoot, ".wrangler/state");

export default defineConfig({
  plugins: [react(), cloudflare({ configPath: workerConfigPath, persistState: { path: localStatePath } })],
  server: {
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
  },
});
