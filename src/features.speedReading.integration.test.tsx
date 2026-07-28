import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openBundle, renderApp } from "@/test/appHarness.tsx";

/** Open the fixture concept written to exercise pacing. */
async function openSpeedReadingConcept(user: ReturnType<typeof userEvent.setup>) {
  await openBundle(user);
  await user.click(screen.getByRole("treeitem", { name: "Speed Reading" }));
  await screen.findByRole("heading", { name: "Speed Reading", level: 1 });
}

/** Start the focus player from the reader header's visible action. */
async function startFocusReading(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /speed-read this concept/i }));
  return screen.findByRole("dialog", { name: /Speed reading/i });
}

describe("speed reading", () => {
  it("starts from the reader's visible action on the first word of the concept", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);

    const player = await startFocusReading(user);
    // The first prose block of the fixture is the "What it does" heading.
    await waitFor(() =>
      expect(player.querySelector(".speedread-word")).toHaveTextContent("What"),
    );
    // The pivot letter is split out so it can be pinned in place.
    expect(player.querySelector(".speedread-orp")).toHaveTextContent("h");
    // The sentence stays legible underneath — rereading without leaving.
    expect(player.querySelector(".speedread-context")).toHaveTextContent("What it does");
  });

  it("steps back by word and by sentence, which is what plain RSVP cannot do", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);
    const player = await startFocusReading(user);
    const word = () => player.querySelector(".speedread-word")?.textContent ?? "";

    const controls = within(player);
    await user.click(controls.getByRole("button", { name: "Pause" }));
    await user.click(controls.getByRole("button", { name: "Next word" }));
    await user.click(controls.getByRole("button", { name: "Next word" }));
    await waitFor(() => expect(word()).toContain("does"));

    await user.click(controls.getByRole("button", { name: "Previous word" }));
    await waitFor(() => expect(word()).toContain("it"));

    // Back to the top of the sentence the cursor is inside.
    await user.click(controls.getByRole("button", { name: "Previous sentence" }));
    await waitFor(() => expect(word()).toContain("What"));
  });

  it("stops at a code block instead of shredding it into words", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);
    const player = await startFocusReading(user);
    const controls = within(player);
    await user.click(controls.getByRole("button", { name: "Pause" }));

    // Walk sentence by sentence until the player refuses to tokenize a block.
    for (let i = 0; i < 40; i++) {
      if (controls.queryByRole("button", { name: "Continue reading" })) break;
      await user.click(controls.getByRole("button", { name: "Next sentence" }));
    }
    expect(controls.getByRole("button", { name: "Continue reading" })).toBeVisible();
    expect(controls.getByText(/read this one at your own pace/i)).toBeVisible();
    expect(player.querySelector(".speedread-stop-body")).toHaveTextContent(
      "buildReadingStream",
    );
  });

  it("also starts from the Aa popover, which owns guided mode and the pace", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);

    await user.click(screen.getByRole("button", { name: /reading preferences/i }));
    await user.click(await screen.findByRole("button", { name: "Focus" }));
    expect(await screen.findByRole("dialog", { name: /Speed reading/i })).toBeVisible();
  });

  it("hands the keyboard the stop: focus lands on Continue, and Space resumes", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);
    const player = await startFocusReading(user);
    const controls = within(player);
    await user.click(controls.getByRole("button", { name: "Pause" }));

    for (let i = 0; i < 40; i++) {
      if (controls.queryByRole("button", { name: /Continue reading/ })) break;
      await user.click(controls.getByRole("button", { name: "Next sentence" }));
    }
    const cont = controls.getByRole("button", { name: /Continue reading/ });
    // The control that takes over is the one holding focus — no hunting.
    await waitFor(() => expect(cont).toHaveFocus());

    // And the advertised key is the one that works.
    await user.keyboard(" ");
    await waitFor(() =>
      expect(controls.queryByRole("button", { name: /Continue reading/ })).toBeNull(),
    );
    expect(player.querySelector(".speedread-word")).toHaveTextContent(/\S/);
  });

  it("closes on Escape and gives focus back to the reader", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);
    await startFocusReading(user);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Speed reading/i })).toBeNull(),
    );
    // The concept is still the one being read; nothing navigated away.
    expect(screen.getByRole("heading", { name: "Speed Reading", level: 1 })).toBeVisible();
  });

  it("starts from the S shortcut, and only when a bundle is open", async () => {
    const user = userEvent.setup();
    renderApp();
    // Before a bundle is open there is nothing to pace, and `s` must stay inert.
    await user.keyboard("s");
    expect(screen.queryByRole("dialog", { name: /Speed reading/i })).toBeNull();

    await openSpeedReadingConcept(user);
    await user.keyboard("s");
    expect(await screen.findByRole("dialog", { name: /Speed reading/i })).toBeVisible();
  });

  it("names the comprehension cost once the pace passes the advisory rate", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);

    // Raise the pace from the popover, then start: the setting persists, the
    // mode does not.
    await user.click(screen.getByRole("button", { name: /reading preferences/i }));
    const faster = await screen.findByRole("button", { name: "Faster pace" });
    for (let i = 0; i < 10; i++) await user.click(faster);
    await user.click(screen.getByRole("button", { name: "Focus" }));

    const player = await screen.findByRole("dialog", { name: /Speed reading/i });
    expect(
      within(player).getByText(/comprehension usually starts to drop/i),
    ).toBeVisible();
  });

  it("paces the concept in place in guided mode, leaving the prose on screen", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSpeedReadingConcept(user);

    await user.click(screen.getByRole("button", { name: /reading preferences/i }));
    await user.click(await screen.findByRole("button", { name: "Guided" }));

    const bar = await screen.findByRole("group", { name: "Guided pacing" });
    expect(bar).toBeVisible();
    // The point of guided mode: the article is untouched behind the bar.
    expect(screen.getByRole("heading", { name: "Speed Reading", level: 1 })).toBeVisible();

    await user.click(within(bar).getByRole("button", { name: "Stop pacing" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Guided pacing" })).toBeNull(),
    );
  });
});
