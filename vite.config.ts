/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/ — tuned for Tauri (fixed port, ignore src-tauri).
export default defineConfig({
  plugins: [
    react({
      // React Compiler — auto-memoization, so components carry no manual useMemo/useCallback/memo.
      babel: { plugins: [["babel-plugin-react-compiler", {}]] },
    }),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
