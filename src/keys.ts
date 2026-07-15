// Global keyboard shortcuts — every primary action reachable without a mouse.
// See docs/ux/keyboard-shortcuts.md. The palette/shortcuts agent may extend this.

import { useEffect } from "react";
import { useApp } from "@/store.tsx";
import { focusAgentPanel, focusAgentPanelOpener } from "@/agent/agentPanelFocus.ts";

export function useGlobalKeys() {
  const { state, actions } = useApp();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const k = e.key.toLowerCase();

      if (mod && (e.key === "1" || e.key === "2" || e.key === "3")) {
        // Layout modes: Ctrl/Cmd+1 graph-only, +2 split, +3 reader-only.
        // Mirrors VS Code's preview hotkeys but flips toward content (reader).
        e.preventDefault();
        const map = { "1": "graph", "2": "split", "3": "reader" } as const;
        actions.setLayout(map[e.key]);
      } else if (!typing && !mod && k === "\\") {
        // Cycle split -> reader -> graph (bare backslash, next to [ and ]).
        e.preventDefault();
        actions.cycleLayout();
      } else if (e.ctrlKey && e.key === "Tab") {
        // Cycle reader tabs (Ctrl even on mac — Cmd+Tab is the OS app switcher).
        e.preventDefault();
        actions.cycleTab(e.shiftKey ? -1 : 1);
      } else if (mod && k === "t" && state.bundle) {
        // New tab: opens empty and active; its empty state points at the
        // graph/sidebar/launcher to pick a concept. (Deliberately does NOT
        // auto-open the launcher — owner feedback.) docs/proposals/multi-view.md
        e.preventDefault();
        actions.openInNewTab(null);
      } else if (mod && k === "w" && state.bundle) {
        // Close the active tab (the last one never closes; the window's own
        // close button owns closing the window).
        e.preventDefault();
        actions.closeTab();
      } else if (mod && e.shiftKey && k === "a") {
        e.preventDefault();
        actions.togglePanel("agent");
        if (state.panels.agent) focusAgentPanelOpener();
        else focusAgentPanel();
      } else if (mod && e.shiftKey && k === "o") {
        // Open from URL (remote bundle). Shift distinguishes it from the local
        // folder picker on Ctrl/Cmd+O.
        e.preventDefault();
        actions.setRemoteOpen(true);
      } else if (mod && k === "o") {
        e.preventDefault();
        void actions.openFolder();
      } else if (mod && k === "p") {
        // Open the Bundle Switcher (when a bundle is open); otherwise jump
        // straight to the folder picker. preventDefault to suppress print.
        e.preventDefault();
        if (state.bundle) actions.setSwitcher(!state.switcherOpen);
        else void actions.openFolder();
      } else if (mod && k === "k") {
        e.preventDefault();
        actions.setPalette(!state.palette);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        actions.setSettingsOpen(true);
      } else if (e.key === "/" && !typing) {
        // Open the global search launcher (a synonym for Ctrl/Cmd+K). Used to
        // focus the in-sidebar search, but that was a dead key when the sidebar
        // was collapsed. See docs/proposals/global-search.md.
        e.preventDefault();
        actions.setPalette(true);
      } else if (e.key === "?" && !typing) {
        // Toggle the keyboard-shortcuts overlay (Shift+/). See
        // docs/ux/keyboard-shortcuts.md.
        e.preventDefault();
        actions.setHelp(!state.help);
      } else if (e.key === "Escape") {
        actions.setPalette(false);
        actions.setSettingsOpen(false);
        actions.setSwitcher(false);
        actions.setHelp(false);
        actions.setRemoteOpen(false);
      } else if (e.altKey && e.key === "ArrowLeft") {
        actions.back();
      } else if (e.altKey && e.key === "ArrowRight") {
        actions.forward();
      } else if (!typing && !mod && k === "v" && state.bundle && state.layout !== "reader") {
        // Cycle the graph pane's visualization (graph → treemap → sunburst →
        // pack). Skipped in reader-only layout where the pane is hidden.
        actions.cycleViz();
      } else if (!typing && !mod && k === "o" && state.bundle) {
        // Toggle the bundle Overview landing (orient before you dive).
        actions.setOverview(!state.overview);
      } else if (!typing && !mod && k === "t" && state.bundle) {
        // Toggle the Lineage panel — trace what depends on the active concept.
        actions.togglePanel("lineage");
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
