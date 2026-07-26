import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { AppProvider, useApp } from "@/shared/store.tsx";
import { ShortcutsHelp } from "./ShortcutsHelp.tsx";

// The sheet reads its open state from the store, so a wrapper opens it on
// mount. Nothing here needs a bundle.
function Opened() {
  const { actions } = useApp();
  useEffect(() => actions.setHelp(true), [actions]);
  return <ShortcutsHelp />;
}

function openSheet() {
  render(
    <AppProvider>
      <Opened />
    </AppProvider>,
  );
}

/** Every glyph the keymap is allowed to show on a cap. */
const INTENDED_GLYPHS = "⌘⇧⌥↑↓←→";
const CAP = new RegExp(`^[\\x20-\\x7E${INTENDED_GLYPHS}]+$`);

describe("ShortcutsHelp", () => {
  it("renders no mojibake on any key cap", () => {
    // The sheet shipped with "â‡§" in the Agent panel chord: a ⇧ that had been
    // through a bad encoding round-trip and then been typed back into the
    // source as three literal characters. It renders as garbage and reads as
    // garbage, and nothing failed. Every cap is now either plain ASCII or one
    // of the glyphs the keymap deliberately uses.
    openSheet();
    const caps = document.querySelectorAll("kbd.kbd");
    expect(caps.length).toBeGreaterThan(30);
    for (const cap of caps) {
      expect(cap.textContent, `unexpected characters in key cap "${cap.textContent}"`).toMatch(CAP);
    }
  });

  it("lists the bindings that had gone missing from it", () => {
    // The sheet is a mirror of docs/ux/keyboard-shortcuts.md, and it had
    // drifted: these three were live in the app and absent here.
    openSheet();
    expect(screen.getByText("Git panel")).toBeInTheDocument();
    expect(screen.getByText("Previous thread")).toBeInTheDocument();
    expect(screen.getByText("Next thread")).toBeInTheDocument();
    expect(screen.getByText("Commit staged scope")).toBeInTheDocument();
  });

  it("distinguishes the thread and prompt chords, which differ only by modifier", () => {
    // Mod+PgUp switches thread, Shift+PgUp steps prompt. Read apart they are
    // easy to confuse, which is why they share a group in the sheet.
    openSheet();
    expect(screen.getByText("Previous prompt")).toBeInTheDocument();
    expect(screen.getByText("Next prompt")).toBeInTheDocument();
    expect(screen.getByText("Latest prompt")).toBeInTheDocument();
  });

  it("gives every action a distinct label", () => {
    // Two rows with one label is the shape a copy-paste error takes here, and
    // it also breaks the React key the list is built on.
    openSheet();
    const labels = [...document.querySelectorAll(".sc-label")].map(
      (el) => el.firstChild?.textContent ?? "",
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("pairs each action with a chord", () => {
    openSheet();
    for (const row of document.querySelectorAll(".sc-row")) {
      const keys = row.querySelector(".sc-keys");
      expect(keys?.textContent?.trim(), `no chord beside "${row.textContent}"`).toBeTruthy();
    }
  });

  it("marks pointer actions as words, not as keys", () => {
    // "click" on a keycap is a category error; it is not a key.
    openSheet();
    for (const cap of document.querySelectorAll("kbd.kbd")) {
      expect(cap.textContent?.toLowerCase()).not.toBe("click");
    }
    expect(document.querySelector(".sc-pointer")?.textContent).toBe("click");
  });
});
