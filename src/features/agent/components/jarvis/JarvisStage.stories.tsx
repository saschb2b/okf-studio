// Jarvis Mode, watchable without an agent. This is the surface whose whole
// value is how it feels, so it needs to be viewable in isolation.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { JarvisStage } from "./JarvisStage.tsx";

function receiptFor(query: string) {
  return mockRetrieval(MOCK_BUNDLE, { query, contextBudgetTokens: 4096 });
}

const meta = {
  title: "Agent/JarvisStage",
  component: JarvisStage,
  parameters: { layout: "fullscreen" },
  args: {
    onDone: fn(),
    reduceMotion: false,
    result: receiptFor("recognized revenue"),
    // The field renders the open bundle, so the stories pass the mock one.
    concepts: MOCK_BUNDLE.concepts,
  },
} satisfies Meta<typeof JarvisStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An ordinary turn, playing. */
export const Playing: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Opens on the question — the establishing shot.
    await waitFor(async () => {
      await expect(body.getByText("recognized revenue")).toBeVisible();
    });
    await expect(body.getByText(/Esc to skip/i)).toBeVisible();
  },
};

/** A broad query: many candidates sweeping past, the tail aggregated. */
export const BroadSweep: Story = {
  args: { result: receiptFor("the") },
};

/**
 * Reduced motion. Everything lands at once and nothing moves — the information
 * survives, only the choreography goes. Switching the feature off here would
 * withhold what the turn used.
 */
export const ReducedMotion: Story = {
  // No field either: a slowly rotating point cloud is exactly the continuous
  // background movement this setting exists to stop.
  args: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("recognized revenue")).toBeVisible();
    // The whole sequence is present immediately rather than trickling in.
    const slots = canvasElement.ownerDocument.querySelectorAll(".jarvis-stage__slot");
    await expect(slots.length).toBeGreaterThan(1);
  },
};

/** A turn that matched nothing still opens, and shows no excerpts. */
export const FoundNothing: Story = {
  args: { result: receiptFor("qqxzzyv") },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // The opening beat lands one tick in, so this waits rather than asserting
    // against the empty first frame.
    await waitFor(async () => {
      await expect(body.getByText("qqxzzyv")).toBeVisible();
    });
    // No excerpts: a turn that found nothing is allowed to look like one.
    const excerpts = canvasElement.ownerDocument.querySelectorAll(".jarvis-panel--excerpt");
    await expect(excerpts.length).toBe(0);
  },
};
