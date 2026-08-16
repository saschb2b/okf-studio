// Global story frame: the app's real tokens and theme switch. The desktop
// window is transparent (body background: transparent), so stories render
// inside an opaque frame painted with the app's --bg/--text roles; the
// toolbar's theme toggle drives the same :root[data-theme] attribute the app
// sets in shared/theme.ts.
import type { Preview } from "@storybook/react-vite";
import {
  auditVisualConsistency,
  formatFindings,
  isEnforced,
} from "./visualConsistency.ts";
import "../src/styles.css";
import "../src/shared/styles/chrome.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "App color theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: ["dark", "light"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark" },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = String(context.globals.theme);
      return (
        <div
          style={{
            padding: 16,
            color: "var(--text)",
            fontFamily: "var(--ui)",
            fontSize: "var(--fs-sm)",
            background: "var(--bg)",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    backgrounds: { disable: true },
  },
  // Every story is measured against the visual-consistency criteria after it
  // renders. These defects are measurable, so they are a gate rather than a
  // reading exercise.
  afterEach: ({ canvasElement, title }) => {
    if (!isEnforced(String(title))) return;
    const findings = auditVisualConsistency(canvasElement as Element);
    if (findings.length === 0) return;
    throw new Error(
      `${findings.length} visual-consistency finding(s):
${formatFindings(findings)}`,
    );
  },
};

export default preview;
