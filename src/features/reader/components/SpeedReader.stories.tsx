import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { buildReadingStream } from "@/features/reader/speedread.ts";
import { SpeedReader } from "./SpeedReader.tsx";

const concept =
  MOCK_BUNDLE.concepts.find((candidate) => candidate.id === "features/speed-reading") ??
  MOCK_BUNDLE.concepts[0];

/** Where the fixture's first non-prose block sits, read from the engine rather
 *  than hand-counted, so the stop story cannot drift with the fixture. */
const FIRST_BLOCK_STEP = buildReadingStream(concept.body).steps.findIndex(
  (s) => s.kind === "block",
);

const meta = {
  title: "Reader/SpeedReader",
  component: SpeedReader,
  parameters: { layout: "fullscreen" },
  args: {
    title: concept.title,
    body: concept.body,
    wpm: 300,
    chunk: 1,
    boldStart: false,
    reduceMotion: false,
    onWpmChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof SpeedReader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The resting state: first word up, pivot letter marked, transport ready. */
export const Paused: Story = {
  // Stories stay still: a running player would make every assertion a race.
  args: { initialPlaying: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: /Speed reading/ })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Play" })).toBeVisible();
    // The word is split around its pivot, which carries the accent.
    await expect(canvasElement.querySelector(".speedread-orp")).toHaveTextContent(/\S/);
    // The sentence stays legible beneath it — the rereading affordance.
    await expect(canvasElement.querySelector(".speedread-context")).toHaveTextContent(
      /What it does/,
    );
  },
};

/** Stepping forward by word, then back by sentence, without playing. */
export const SteppedByHand: Story = {
  args: { initialPlaying: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const first = canvasElement.querySelector(".speedread-word")?.textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Next word" }));
    await expect(canvasElement.querySelector(".speedread-word")).not.toHaveTextContent(
      first ?? "",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Previous sentence" }));
    await expect(canvasElement.querySelector(".speedread-word")).toHaveTextContent(first ?? "");
  },
};

/**
 * The load-bearing property: the pivot letter must not move — in either axis —
 * as words and sentences change. Sentences differ in length, so the sentence
 * printed beneath the word must not be able to push it around.
 */
export const PivotHoldsItsPosition: Story = {
  args: { initialPlaying: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const next = canvas.getByRole("button", { name: "Next word" });
    const centre = () => {
      const r = canvasElement.querySelector(".speedread-orp")?.getBoundingClientRect();
      if (!r) throw new Error("no pivot letter on screen");
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    };

    const first = centre();
    const sentences = new Set<string>();
    // Far enough to cross several sentence boundaries, which is where the
    // context line's height changes.
    for (let i = 0; i < 60; i++) {
      await userEvent.click(next);
      sentences.add(canvasElement.querySelector(".speedread-context")?.textContent ?? "");
      await expect(centre()).toEqual(first);
    }
    // Guard the guard: this only proves anything if the sentence really changed.
    await expect(sentences.size).toBeGreaterThan(1);
  },
};

/** A phrase frame: two short words at once, pivot taken from the first. */
export const PhraseFrames: Story = {
  args: { chunk: 2, initialPlaying: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".speedread-word")).toHaveTextContent(/\s/);
  },
};

/** Past the advisory rate, the cost is stated rather than hidden. */
export const AboveTheAdvisoryRate: Story = {
  args: { wpm: 700, initialPlaying: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText(/comprehension usually starts to drop/i)).toBeVisible();
  },
};

/** The word-start cue, off by default and offered as comfort, not as speed. */
export const BoldWordStarts: Story = {
  args: { boldStart: true, initialPlaying: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".speedread-word b")).toBeInTheDocument();
  },
};

/** A code fence stops the player and renders as itself. */
export const StoppedAtACodeBlock: Story = {
  args: { initialStep: FIRST_BLOCK_STEP, initialPlaying: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText(/read this one at your own pace/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Continue reading" })).toBeVisible();
  },
};

/** With reduced motion on, nothing advances until it is asked to — no
 *  `initialPlaying` here, so this is the real derivation being checked. */
export const ReducedMotion: Story = {
  args: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(canvas.getByRole("dialog", { name: /Speed reading/ })).toHaveAttribute(
      "data-reduce-motion",
      "on",
    );
  },
};
