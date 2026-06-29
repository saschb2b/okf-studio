import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";
import { installNativeBehaviors } from "./native.ts";
import "./styles.css";

// Make the webview feel native: block page-zoom + the default browser context
// menu, and remap the zoom affordance to reader text-size. The root lives for
// the whole process, so we don't keep the cleanup handle.
installNativeBehaviors();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
