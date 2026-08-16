// Storybook for OKF Studio's component playground — replaces ad-hoc fixtures
// like ?agent-gallery for per-component states. The react-vite framework
// reuses vite.config.ts (the @ alias and the React Compiler babel plugin).
// @storybook/addon-mcp serves an MCP endpoint at /mcp on the dev server so a
// coding agent can list components, read story source, and write stories;
// .mcp.json at the repo root points Claude Code at it.
import type { StorybookConfig } from "@storybook/react-vite";

const addons: NonNullable<StorybookConfig["addons"]> = ["@storybook/addon-vitest"];

// This config runs in Node, which the app's tsconfig does not type: the
// webview has no `process`, and pulling @types/node in for one lookup would
// put Node globals in scope across src/ too.
declare const process: { env: Record<string, string | undefined> };

// The MCP server is a development surface. Loading it inside Vitest adds its
// manifest and module-graph work to the browser handshake without testing it.
if (!process.env.VITEST) {
  addons.push("@storybook/addon-mcp");
}

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons,
};

export default config;
