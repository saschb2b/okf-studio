/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const host = process.env.TAURI_DEV_HOST;
const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// https://vite.dev/config/ — tuned for Tauri (fixed port, ignore src-tauri).
export default defineConfig(({ mode }) => ({
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
  optimizeDeps: {
    // Storybook supplies exact story entries. Let its browser consume optimized
    // dependencies while Vite finishes crawling instead of blocking startup.
    holdUntilCrawlEnd: mode === "test" ? false : undefined,
    include: [
      "lodash/merge.js",
      "use-sync-external-store/shim/index.js",
      "use-sync-external-store/shim/with-selector.js",
    ],
    needsInterop: [
      "lodash/merge.js",
      "use-sync-external-store/shim/index.js",
      "use-sync-external-store/shim/with-selector.js",
    ],
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
    // Vitest and Storybook already supply exact entry graphs. Reusing the app
    // warmup there duplicates their collection work before the browser starts.
    warmup: mode === "test"
      ? undefined
      : {
          clientFiles: [
            "./src/**/*.{ts,tsx,css}",
            "!./src/**/*.test.{ts,tsx}",
            "!./src/**/*.stories.{ts,tsx}",
            "!./src/test/**",
          ],
        },
  },
  test: {
    // Pure logic runs in Node. Components use jsdom, full-app flows use the
    // bounded integration lane, and stories render in headless Chromium.
    // Vitest 4.1 reads the browser handshake limit from the root config after
    // expanding project instances. Individual story deadlines stay at 30 s.
    browser: { connectTimeout: 90_000 },
    projects: [
      {
        extends: true,
        cacheDir: "node_modules/.vite-unit-tests",
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.dom.test.ts", "src/**/*.integration.test.ts"],
          environment: "node",
          globals: true,
          restoreMocks: true,
          slowTestThreshold: 100,
          sequence: { shuffle: true },
        },
      },
      {
        extends: true,
        cacheDir: "node_modules/.vite-component-tests",
        test: {
          name: "component",
          include: ["src/**/*.test.tsx", "src/**/*.dom.test.ts"],
          exclude: ["src/**/*.integration.test.tsx"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          css: false,
          restoreMocks: true,
          slowTestThreshold: 250,
          sequence: { shuffle: true },
        },
      },
      {
        extends: true,
        cacheDir: "node_modules/.vite-integration-tests",
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          css: false,
          restoreMocks: true,
          slowTestThreshold: 1_000,
          maxWorkers: 2,
          testTimeout: 20_000,
          sequence: { shuffle: true },
        },
      },
      {
        extends: true,
        cacheDir: "node_modules/.vite-story-tests",
        plugins: [
          storybookTest({ configDir: fileURLToPath(new URL("./.storybook", import.meta.url)) }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          slowTestThreshold: 1_000,
          // A single browser avoids competing Chromium boots on Windows.
          maxWorkers: 1,
          testTimeout: 30_000,
          sequence: { shuffle: true },
        },
      },
    ],
  },
}));
