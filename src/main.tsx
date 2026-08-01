import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App.tsx";
import { AppProvider } from "@/shared/store.tsx";
import { installNativeBehaviors } from "@/shared/platform/native.ts";
import { isAndroidShell } from "@/shared/platform/platform.ts";
import { logToHost } from "@/shared/ipc.ts";

// The two typefaces the token layer names, bundled into the app rather than
// resolved from the host. A desktop app that inherits `system-ui` renders in
// Segoe UI on Windows, SF on macOS, and whatever fontconfig picks on Linux, so
// the same window has three different metrics, three different x-heights, and
// three different answers to `font-weight: 650`. Shipping the variable fonts
// makes the chrome identical on all three. Latin subsets only; see the file.
import "@/shared/styles/fonts.css";
import "./styles.css";

// Which shell is drawing the app, as one attribute CSS can branch on. The
// Android build has no window frame of its own to round off or inset, and its
// chrome sits under the system status and navigation bars. Set before the first
// paint so the frame never appears and then correct itself.
if (isAndroidShell()) document.documentElement.dataset.shell = "android";

// Make the webview feel native: block page-zoom + the default browser context
// menu, and remap the zoom affordance to reader text-size. The root lives for
// the whole process, so we don't keep the cleanup handle.
installNativeBehaviors();

// Crash forensics: an uncaught render error unmounts the whole React tree and,
// with the transparent window, leaves a translucent empty shell with no trace
// in the dev terminal. Route every failure path to the host terminal.
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ""}`;
  return String(error);
}
window.addEventListener("error", (event) => {
  logToHost(`window.onerror: ${event.message} @ ${event.filename}:${event.lineno}`);
});
window.addEventListener("unhandledrejection", (event) => {
  logToHost(`unhandledrejection: ${describeError(event.reason)}`);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error('Root element "#root" not found');

createRoot(rootEl, {
  onUncaughtError: (error, errorInfo) => {
    logToHost(
      `React uncaught error (tree unmounted): ${describeError(error)}\ncomponent stack: ${errorInfo.componentStack ?? "n/a"}`,
    );
  },
  onCaughtError: (error, errorInfo) => {
    logToHost(
      `React error caught by boundary: ${describeError(error)}\ncomponent stack: ${errorInfo.componentStack ?? "n/a"}`,
    );
  },
}).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
