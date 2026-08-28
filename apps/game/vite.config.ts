import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const workerOrigin = process.env.FISHING_WORKER_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": workerOrigin,
    },
  },
  build: {
    target: "es2022",
  },
});
