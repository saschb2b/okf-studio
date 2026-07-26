import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { CommandPalette } from "./CommandPalette.tsx";

function OpenPalette() {
  const { actions } = useApp();
  useEffect(() => actions.setPalette(true), [actions]);
  return <CommandPalette />;
}

const meta = {
  title: "Shell/CommandPalette",
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = () => (
  <WithStore withBundle>
    <OpenPalette />
  </WithStore>
);

/** Opened with nothing typed: a short suggested set, not all nineteen commands. */
export const ZeroQuery: Story = {
  render: open,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByText(/^Actions/)).toBeInTheDocument());
    const rows = canvasElement.ownerDocument.querySelectorAll(".palette-item");
    // The suggested few. The wall of every command is what this replaced.
    await expect(rows.length).toBeLessThanOrEqual(8);
    // And no per-row "Action" tag under a heading that already says ACTIONS.
    await expect(canvasElement.ownerDocument.querySelectorAll(".palette-hint")).toHaveLength(0);
  },
};

/** Typing ranks concepts against actions and marks what matched. */
export const Results: Story = {
  render: open,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    const input = await waitFor(() => body.getByPlaceholderText(/Search concepts/));
    await userEvent.type(input, "graph");
    await waitFor(() => expect(body.getByText(/^Concepts/)).toBeInTheDocument());
    // The matched characters are marked, which is what makes a fuzzy hit read
    // as a hit rather than as a guess.
    await waitFor(() => expect(doc.querySelectorAll(".palette-mark").length).toBeGreaterThan(0));
  },
};

/** An abbreviation still finds its concept, and shows why it matched. */
export const FuzzyAbbreviation: Story = {
  render: open,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    const input = await waitFor(() => body.getByPlaceholderText(/Search concepts/));
    // Missing the "a" of Graph — a subsequence, not a substring.
    await userEvent.type(input, "grph");
    await waitFor(() => {
      const first = doc.querySelector(".palette-item .palette-label");
      void expect(first?.textContent).toBe("Graph View");
    });
  },
};

/** Nothing matched: name the query, say what was searched, leave a way out. */
export const NoMatch: Story = {
  render: open,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = await waitFor(() => body.getByPlaceholderText(/Search concepts/));
    await userEvent.type(input, "zzzqqq");
    await waitFor(() => expect(body.getByText(/No match for/)).toBeInTheDocument());
    // Recovery, rather than a dead end.
    await expect(body.getByRole("button", { name: /Open folder/ })).toBeInTheDocument();
  },
};
