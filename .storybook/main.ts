// Storybook for OKF Studio's component playground — replaces ad-hoc fixtures
// like ?agent-gallery for per-component states. The react-vite framework
// reuses vite.config.ts (the @ alias and the React Compiler babel plugin).
// @storybook/addon-mcp serves an MCP endpoint at /mcp on the dev server so a
// coding agent can list components, read story source, and write stories;
// .mcp.json at the repo root points Claude Code at it.
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest", "@storybook/addon-mcp"],
};

export default config;
