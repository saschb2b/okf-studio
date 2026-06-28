// Global keyboard shortcuts — every primary action reachable without a mouse.
// See docs/ux/keyboard-shortcuts.md. The palette/shortcuts agent may extend this.

import { useEffect } from "react";
import { useApp } from "./store.tsx";

export function useGlobalKeys() {
  const { state, actions } = useApp();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const k = e.key.toLowerCase();

      if (mod && k === "o") {
        e.preventDefault();
        void actions.openFolder();
      } else if (mod && k === "k") {
        e.preventDefault();
        actions.setPalette(!state.palette);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        actions.setSettingsOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search]")?.focus();
      } else if (e.key === "Escape") {
        actions.setPalette(false);
        actions.setSettingsOpen(false);
      } else if (e.altKey && e.key === "ArrowLeft") {
        actions.back();
      } else if (e.altKey && e.key === "ArrowRight") {
        actions.forward();
      } else if (!typing && !mod && k === "l") {
        actions.togglePanel("log");
      } else if (!typing && !mod && k === "r") {
        void actions.rescan();
      } else if (!typing && !mod && k === "[") {
        actions.togglePanel("sidebar");
      } else if (!typing && !mod && k === "]") {
        actions.togglePanel("reader");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
