// Global story frame: the app's real tokens and theme switch. The desktop
// window is transparent (body background: transparent), so stories render
// inside an opaque frame painted with the app's --bg/--text roles; the
// toolbar's theme toggle drives the same :root[data-theme] attribute the app
// sets in shared/theme.ts.
import type { Preview } from "@storybook/react-vite";
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
};

export default preview;
