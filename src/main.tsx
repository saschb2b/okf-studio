import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";
import { installNativeBehaviors } from "./native.ts";
import { logToHost } from "./ipc.ts";
import "./styles.css";

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
