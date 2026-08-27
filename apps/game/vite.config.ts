import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const reactHtmlEntry = fileURLToPath(new URL("./index.react.html", import.meta.url));

export default defineConfig(({ mode }) => {
  const isReactMigration = mode === "react-migration";

  return {
    plugins: isReactMigration ? [react()] : [],
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8787",
      },
    },
    build: {
      target: "es2022",
      ...(isReactMigration ? { rollupOptions: { input: reactHtmlEntry } } : {}),
    },
  };
});
