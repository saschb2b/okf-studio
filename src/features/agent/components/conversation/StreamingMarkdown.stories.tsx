// The growing edge of an agent answer. The point of this surface is how it
// feels, so it needs to be viewable without an agent attached.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { StreamingMarkdown } from "./StreamingMarkdown.tsx";

const meta = {
  title: "Agent/StreamingMarkdown",
  component: StreamingMarkdown,
  args: { animate: true },
  render: (args) => (
    <div style={{ width: 620, padding: "var(--space-16)", background: "var(--bg)" }}>
      <StreamingMarkdown {...args} />
    </div>
  ),
} satisfies Meta<typeof StreamingMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-paragraph: a settled block above, an animating tail below. */
export const MidParagraph: Story = {
  args: {
    text: "# Recognized revenue\n\nThe sanctioned definition lives in the bundle.\n\nAn agent may bind the parameters but must",
  },
  play: async ({ canvas, canvasElement }) => {
    // The settled part is parsed markdown.
    await expect(canvas.getByRole("heading", { name: /Recognized revenue/ })).toBeVisible();
    // The tail is plain text, which is what lets it animate at all.
    //
    // Presence, not visibility: the fade uses `backwards` fill, so a word mid-
    // animation genuinely computes to opacity 0. Asserting it is *visible* at an
    // arbitrary instant tests the animation's phase rather than the render.
    const tail = canvasElement.querySelector(".streaming-tail");
    await expect(tail?.textContent).toContain("must");
    await expect(tail?.classList.contains("is-animated")).toBe(true);
  },
};

/** Nothing has closed yet, so nothing is parsed and it is all tail. */
export const FirstLine: Story = {
  args: { text: "Looking at the retrieval receipt" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".streaming-tail")).not.toBeNull();
    await expect(canvasElement.querySelector("h1")).toBeNull();
  },
};

/**
 * An open code fence. Held entirely in the tail: markdown treats an unclosed
 * fence as swallowing the rest of the document, so parsing it mid-stream makes
 * the whole message reflow when it finally closes.
 */
export const OpenCodeFence: Story = {
  args: {
    text: "Here is the query.\n\n```sql\nSELECT SUM(amount)\nFROM finance",
  },
  play: async ({ canvasElement }) => {
    // Not yet a rendered code block.
    await expect(canvasElement.querySelector(".streaming-tail")).not.toBeNull();
    await expect(canvasElement.textContent).toContain("SELECT SUM(amount)");
  },
};

/** Reduced motion: the words are all there, they simply do not fade in. */
export const ReducedMotion: Story = {
  args: {
    animate: false,
    text: "Settled block.\n\nAnd a tail that appears without fading",
  },
  play: async ({ canvasElement }) => {
    const tail = canvasElement.querySelector(".streaming-tail");
    await expect(tail).not.toBeNull();
    await expect(tail?.classList.contains("is-animated")).toBe(false);
  },
};
