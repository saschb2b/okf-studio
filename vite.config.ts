/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// https://vite.dev/config/ — tuned for Tauri (fixed port, ignore src-tauri).
export default defineConfig({
  plugins: [
    react({
      // React Compiler — auto-memoization, so components carry no manual useMemo/useCallback/memo.
      babel: { plugins: [["babel-plugin-react-compiler", {}]] },
    }),
  ],
  clearScreen: false,
  resolve: {
    alias: { "@": srcRoot },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Pre-transform the app's modules as soon as the server starts — i.e.
    // while cargo is still building — instead of on the webview's first
    // request, which shortens the blank gap between window creation and
    // first paint in `tauri dev`. Tests are excluded so their vitest-only
    // imports never reach the dev-server module graph.
    warmup: {
      clientFiles: [
        "./src/**/*.{ts,tsx,css}",
        "!./src/**/*.test.{ts,tsx}",
        "!./src/test/**",
      ],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
